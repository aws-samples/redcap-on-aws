/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import * as stage from '../stages';

import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import {
  Duration,
  Fn,
  RemovalPolicy,
  SecretValue,
  aws_ec2,
  aws_events,
  aws_secretsmanager,
  cloudformation_include,
} from 'aws-cdk-lib';
import { HttpMethod } from 'aws-cdk-lib/aws-events';
import { ApiDestination } from 'aws-cdk-lib/aws-events-targets';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { assign, get, isEmpty } from 'lodash';

// SST
import { Bucket, StackContext, use } from 'sst/constructs';

// Stack dependency
import { BuildImage } from './BuildImage';
import { Database } from './Database';
import { Network } from './Network';

// Construct and other assets
import { AppRunner } from '../prototyping/constructs/AppRunner';
import { RedCapAwsAccessUser } from '../prototyping/constructs/RedCapAwsAccessUser';
import {
  SimpleEmailService,
  SimpleEmailServiceProps,
} from '../prototyping/constructs/SimpleEmailService';
import { Waf, WebACLAssociation } from '../prototyping/constructs/Waf';
import { getRedcapCronRuleIpFilter, getRedcapCronRuleNoIpFilter } from './Backend/WafRuleForCron';

// Nag suppressions
import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { bucketProps } from '../prototyping/overrides/BucketProps';
import { getAppRunnerHostedZone } from './Backend/AppRunnerHostedZones';

const { createHmac } = await import('node:crypto');

export function Backend({ stack, app }: StackContext) {
  const { networkVpc } = use(Network);
  const { dbSecret, dbAllowedSg, readReplicaHostname, auroraClusterV2 } = use(Database);
  const repository = use(BuildImage);

  if (!dbSecret) {
    throw new Error('No database secret found');
  }

  // Config
  const domain = get(stage, [stack.stage, 'domain']);
  const subdomain = get(stage, [stack.stage, 'subdomain']);
  const hostInRoute53 = get(stage, [stack.stage, 'hostInRoute53'], true);
  const phpTimezone = get(stage, [stack.stage, 'phpTimezone']);
  const autoDeploymentsEnabled = get(stage, [stack.stage, 'autoDeploymentsEnabled'], true);

  const cronSecret = get(stage, [stack.stage, 'cronSecret'], 'mysecret');
  const allowedIps = get(stage, [stack.stage, 'allowedIps'], []);
  const cpu = get(stage, [stack.stage, 'cpu'], Cpu.TWO_VCPU);
  const memory = get(stage, [stack.stage, 'memory'], Memory.FOUR_GB);
  const maxConcurrency = get(stage, [stack.stage, 'appRunnerConcurrency'], 10);
  const maxSize = get(stage, [stack.stage, 'appRunnerMaxSize'], 2);
  const minSize = get(stage, [stack.stage, 'appRunnerMinSize'], 1);
  const email = get(stage, [stack.stage, 'email']);
  const port = get(stage, [stack.stage, 'port']);
  const tag = get(stage, [stack.stage, 'deployTag'], 'latest');

  // IAM user and group to access AWS S3 service (file system)
  const redCapS3AccessUser = new RedCapAwsAccessUser(stack, `${app.stage}-${app.name}-s3-access`, {
    groupName: `${app.stage}-${app.name}-groupS3`,
  });

  // IAM user and group to access AWS SES service (email)
  const redCapSESAccessUser = new RedCapAwsAccessUser(
    stack,
    `${app.stage}-${app.name}-ses-access`,
    {
      groupName: `${app.stage}-${app.name}-groupSES`,
    },
  );

  // Route53 DNS and Amazon SES validation
  let sesProps: SimpleEmailServiceProps = {
    user: redCapSESAccessUser.user,
    group: redCapSESAccessUser.userGroup,
    transformCredentials: redCapSESAccessUser.secret,
  };
  let publicHostedZone;

  if (domain) {
    if (hostInRoute53) {
      // Creates entity with record mail.<your_hosted_zone_name>
      publicHostedZone = new PublicHostedZone(stack, `${app.stage}-${app.name}-hostedzone`, {
        zoneName: domain,
      });
      sesProps = assign(sesProps, { publicHostedZone });
    } else {
      sesProps = assign(sesProps, { domain });
    }
  } else if (email) {
    // Validate current user email for Amazon SES
    sesProps = assign(sesProps, { email });
  }

  if (!domain && !email) throw new Error('No identify found to deploy Amazon SES');

  const ses = new SimpleEmailService(stack, `${app.stage}-${app.name}-redcap-ses`, {
    ...sesProps,
  });

  // DB salt secret
  const dbSalt = new aws_secretsmanager.Secret(stack, `${app.stage}-${app.name}-dbsalt`, {
    description:
      'REDCap db salt secret, value must be hashed to sha256 before passing it to database.php',
    removalPolicy: app.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
  });

  // REDCap S3 integration for file storage
  const redcapApplicationBucket = new Bucket(stack, 'appBucket', {
    cdk: {
      bucket: {
        ...bucketProps(app),
      },
    },
  });

  redcapApplicationBucket.cdk.bucket.grantReadWrite(redCapS3AccessUser.userGroup);

  const runnerEnvVars = {
    AWS_REGION: stack.region,
    S3_BUCKET: redcapApplicationBucket.bucketName,
    READ_REPLICA_HOSTNAME: readReplicaHostname || '',
    USE_IAM_DB_AUTH: 'true',
    DB_SECRET_NAME: dbSecret.secretName,
    SMTP_EMAIL: email,
    DB_SECRET_ID: dbSecret.secretArn,
    DB_SALT_SECRET_ID: dbSalt.secretArn,
    SES_CREDENTIALS_SECRET_ID: ses.sesUserCredentials.secretArn,
    S3_SECRET_ID: redCapS3AccessUser.secret.secretArn,
    PHP_TIMEZONE: phpTimezone || 'UTC',
  };

  // AppRunner service
  const redCapRunner = new AppRunner(stack, `${app.stage}-${app.name}-service`, {
    appName: `${app.stage}-${app.name}`,
    notificationEmail: email,
    network: {
      vpc: networkVpc.vpc,
      subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      securityGroups: [dbAllowedSg],
    },
    autoDeploymentsEnabled,
    service: {
      config: {
        port: port || 8080,
        cpu,
        memory,
        environmentVariables: runnerEnvVars,
      },
      image: {
        repositoryName: repository.repositoryName,
        tag,
      },
    },
    scalingConfiguration: {
      maxConcurrency,
      maxSize,
      minSize,
    },
  });

  // Secrets access permission
  dbSecret.grantRead(redCapRunner.service);
  dbSalt.grantRead(redCapRunner.service);
  ses.sesUserCredentials.grantRead(redCapRunner.service);
  redCapS3AccessUser.secret.grantRead(redCapRunner.service);

  // Aurora IAM
  auroraClusterV2.aurora.grantConnect(redCapRunner.service, 'redcap_user');

  // WAF and rules for /cron.php
  const searchString = createHmac('sha256', cronSecret)
    .update(cronSecret.split('').reverse().join(''))
    .digest('hex');
  const { redcapCronRule } = isEmpty(allowedIps)
    ? getRedcapCronRuleNoIpFilter(searchString, 10)
    : getRedcapCronRuleIpFilter(searchString, 10);

  const waf = new Waf(stack, `${app.stage}-${app.name}-appwaf`, {
    allowedIps,
    extraRules: [redcapCronRule],
  });

  new WebACLAssociation(stack, 'apprunner-redcap', {
    webAclArn: waf.waf.attrArn,
    resourceArn: redCapRunner.service.serviceArn,
  });

  // AppRunner CNAME domain
  const ServiceUrl = `https://${redCapRunner.service.serviceUrl}`;

  // Automatic AppRunner custom domain enablement only if using Route53
  if (domain && publicHostedZone) {
    const DomainName = subdomain ? `${subdomain}.${domain}` : domain;
    const RecordSetType = subdomain ? 'CNAME' : 'A';
    new cloudformation_include.CfnInclude(
      stack,
      `${app.stage}-${app.name}-apprunner-custom-domain`,
      {
        templateFile: './prototyping/cfn/AppRunnerCustomDomain.yaml',
        parameters: {
          DomainName,
          RecordSetType,
          AppRunnerHostedZones: getAppRunnerHostedZone(stack.region),
          ServiceUrl: redCapRunner.service.serviceUrl,
          ServiceArn: redCapRunner.service.serviceArn,
          DNSDomainId: publicHostedZone.hostedZoneId,
        },
      },
    );
    stack.addOutputs({
      RedcapCustomUrl: `https://${DomainName}`,
    });
  }

  // Create the REDCap scheduler cronjob via endpoint call
  const connection = new aws_events.Connection(stack, 'redcap-connection', {
    // Auth not in use, REDCap does not have any auth requirement for this. However, this constructs requires it.
    // To protect this, we add a AWS WAF rule above.
    authorization: aws_events.Authorization.basic(
      'redcap-cron-user',
      SecretValue.unsafePlainText('nopassword'),
    ),
    description: 'Connection to REDCap cronjob',
  });

  const destination = new aws_events.ApiDestination(stack, 'redcap-destination', {
    connection,
    endpoint: `${ServiceUrl}/cron.php?secret=${searchString}`,
    httpMethod: HttpMethod.GET,
    description: 'Call cron on REDCap deployment',
  });

  new aws_events.Rule(stack, 'redcap-cron', {
    schedule: aws_events.Schedule.rate(Duration.minutes(1)),
    targets: [new ApiDestination(destination)],
  });

  // Additional outputs
  if (publicHostedZone && publicHostedZone.hostedZoneNameServers)
    stack.addOutputs({
      NameServers: Fn.join(',', publicHostedZone.hostedZoneNameServers),
    });

  stack.addOutputs({
    AppRunnerServiceUrl: ServiceUrl,
  });

  // Suppress cdk nag offenses.
  Suppressions.SesSuppressions(ses);
  Suppressions.WebWafSuppressions(waf);
  Suppressions.RedCapAwsAccessUserSuppressions([redCapS3AccessUser, redCapSESAccessUser]);
  Suppressions.DBSecretSalt(dbSalt);
  Suppressions.AppRunnerSuppressions(redCapRunner, app);

  return {
    repository,
    dbSalt,
    sesUserCredentials: ses.sesUserCredentials,
    s3UserCredentials: redCapS3AccessUser.secret,
    runnerEnvVars,
  };
}
