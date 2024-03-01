/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import * as stage from '../stages';

import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import { Fn, RemovalPolicy, aws_secretsmanager } from 'aws-cdk-lib';
import { assign, get, isEmpty } from 'lodash';

// SST
import { Bucket, StackContext, use } from 'sst/constructs';

// Stack dependency
import { BuildImage } from './BuildImage';
import { Database } from './Database';
import { Network } from './Network';

// Construct and other assets
import { RedCapAwsAccessUser } from '../prototyping/constructs/RedCapAwsAccessUser';
import {
  SimpleEmailService,
  SimpleEmailServiceProps,
} from '../prototyping/constructs/SimpleEmailService';
import { Waf } from '../prototyping/constructs/Waf';
import { getRedcapCronRuleIpFilter, getRedcapCronRuleNoIpFilter } from './Backend/WafRuleForCron';

// Nag suppressions
import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { bucketProps } from '../prototyping/overrides/BucketProps';
import { RedcapService } from './Backend/RedCapService';
import { DomainConfiguration } from './Backend/DomainConfiguration';

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
  const hostInRoute53: boolean | string = get(stage, [stack.stage, 'hostInRoute53'], true);
  const phpTimezone = get(stage, [stack.stage, 'phpTimezone']);
  const cronSecret = get(stage, [stack.stage, 'cronSecret'], 'mysecret');
  const allowedIps = get(stage, [stack.stage, 'allowedIps'], []);
  const ecsConfig = get(stage, [stack.stage, 'ecs']);
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

  const domainConfig = new DomainConfiguration({
    app,
    domain,
    hostInRoute53,
    stack,
    subdomain,
  });

  if (!domain && !email) throw new Error('No identify found to deploy Amazon SES');

  let publicHostedZone = domainConfig.publicHostedZone;

  // SES configuration
  if (publicHostedZone) {
    assign(sesProps, { publicHostedZone });
  } else {
    assign(sesProps, { email });
  }

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
  const redcapApplicationBucketLogs = new Bucket(stack, 'appBucket-logs', {
    cdk: {
      bucket: {
        ...bucketProps(app),
      },
    },
  });
  const redcapApplicationBucket = new Bucket(stack, 'appBucket', {
    cdk: {
      bucket: {
        ...bucketProps(app, redcapApplicationBucketLogs),
      },
    },
  });

  redcapApplicationBucket.cdk.bucket.grantReadWrite(redCapS3AccessUser.userGroup);

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

  const environmentVariables = {
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

  const service = new RedcapService(stack, app, {
    databaseCluster: auroraClusterV2.aurora,
    domain,
    subdomain,
    publicHostedZone,
    waf,
    secrets: {
      dbSalt,
      dbSecret,
      redCapS3AccessUser,
      ses,
    },
    environmentVariables,
    vpc: networkVpc.vpc,
    servicePort: port,
    repository,
    searchString,
  });

  if (ecsConfig) {
    // Deploy with ECS backend
    service.ecsDeploy({
      cpu: get(ecsConfig, 'cpu', '2 vCPU'),
      memory: get(ecsConfig, 'memory', '4 GB'),
      scaling: get(ecsConfig, 'scaling', { maxContainers: 2, minContainers: 1 }),
      tag,
    });
  } else {
    // Deploy with AppRunner backend
    service.appRunnerDeploy({
      autoDeploymentsEnabled: get(stage, [stack.stage, 'autoDeploymentsEnabled'], true),
      cpu: get(stage, [stack.stage, 'cpu'], Cpu.TWO_VCPU),
      memory: get(stage, [stack.stage, 'memory'], Memory.FOUR_GB),
      notificationEmail: email,
      securityGroups: [dbAllowedSg],
      tag,
      scalingConfiguration: {
        maxConcurrency: get(stage, [stack.stage, 'appRunnerConcurrency'], 10),
        maxSize: get(stage, [stack.stage, 'appRunnerMaxSize'], 2),
        minSize: get(stage, [stack.stage, 'appRunnerMinSize'], 1),
      },
    });
  }
  // Additional outputs
  if (publicHostedZone && publicHostedZone.hostedZoneNameServers)
    stack.addOutputs({
      NameServers: Fn.join(',', publicHostedZone.hostedZoneNameServers),
    });

  stack.addOutputs({
    AppRunnerServiceUrl: service.AppRunnerServiceUrl || '',
    CustomServiceUrl: service.CustomServiceUrl || '',
    EcsServiceUrl: service.EcsServiceUrl || '',
  });

  // Suppress cdk nag offenses.
  Suppressions.SesSuppressions(ses);
  Suppressions.WebWafSuppressions(waf);
  Suppressions.RedCapAwsAccessUserSuppressions([redCapS3AccessUser, redCapSESAccessUser]);
  Suppressions.DBSecretSalt(dbSalt);

  if (service.appRunnerService) Suppressions.AppRunnerSuppressions(service.appRunnerService, app);
  if (service.ecsService) Suppressions.ECSSuppressions(service.ecsService);

  return {
    repository,
    dbSalt,
    sesUserCredentials: ses.sesUserCredentials,
    s3UserCredentials: redCapS3AccessUser.secret,
    environmentVariables,
  };
}
