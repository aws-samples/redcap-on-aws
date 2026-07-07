/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import { aws_secretsmanager, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { assign, get, isEmpty } from 'lodash';
// SST
import { Bucket, type StackContext, use } from 'sst/constructs';
// Nag suppressions
import Suppressions from '../prototyping/cdkNag/Suppressions';
import { CrossRegionSsmParameter } from '../prototyping/constructs/CrossRegionSsmParameter';
import { DatabaseConnection } from '../prototyping/constructs/DatabaseConnection';
// Construct and other assets
import { RedCapAwsAccessUser } from '../prototyping/constructs/RedCapAwsAccessUser';
import {
  SimpleEmailService,
  type SimpleEmailServiceProps,
} from '../prototyping/constructs/SimpleEmailService';
import { Waf } from '../prototyping/constructs/Waf';
import { bucketProps } from '../prototyping/overrides/BucketProps';
import * as stage from '../stages';
import { DomainConfiguration } from './Backend/DomainConfiguration';
import { RedcapService } from './Backend/RedCapService';
import { getCountryLimitRule, getRedcapCronRule } from './Backend/WafExtraRules';
// Stack dependency
import { BuildImage } from './BuildImage';
import { cloudFrontWafParamName } from './CloudFrontWaf';
import { Database } from './Database';
import { Network } from './Network';

const { createHmac } = await import('node:crypto');

export function Backend({ stack, app }: StackContext) {
  const { networkVpc } = use(Network);
  const { dbAllowedSg } = use(Database);
  const repository = use(BuildImage);

  // Resolve DB attributes from SSM (see DatabaseConnection) instead of
  // cross-stack exports, so the cluster can be replaced without breaking deploys.
  const dbConnection = new DatabaseConnection(stack, stack.stage);

  // Config
  const domain = get(stage, [stack.stage, 'domain']);
  const subdomain = get(stage, [stack.stage, 'subdomain']);
  const hostInRoute53: boolean | string = get(stage, [stack.stage, 'hostInRoute53'], true);
  const phpTimezone = get(stage, [stack.stage, 'phpTimezone']);
  const cronSecret: string = get(stage, [stack.stage, 'cronSecret']);
  const allowedIps = get(stage, [stack.stage, 'allowedIps'], []);
  const allowedCountries = get(stage, [stack.stage, 'allowedCountries'], undefined);
  const ecsConfig = get(stage, [stack.stage, 'ecs']);
  const expressConfig = get(stage, [stack.stage, 'express']);

  if (ecsConfig && expressConfig) {
    throw new Error(
      "Configure only one runtime override per stage: set either 'ecs' or 'express', not both.",
    );
  }
  const email = get(stage, [stack.stage, 'email']);
  const bounceNotificationEmail = get(stage, [stack.stage, 'bounceNotificationEmail']);
  const port = get(stage, [stack.stage, 'port']);
  const tag = get(stage, [stack.stage, 'deployTag'], 'latest');
  const generalLogRetention = get(stage, [stack.stage, 'generalLogRetention'], undefined);
  const cronMinutes = get(stage, [stack.stage, 'cronMinutes'], undefined);

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
  const sesProps: SimpleEmailServiceProps = {
    user: redCapSESAccessUser.user,
    group: redCapSESAccessUser.userGroup,
    transformCredentials: redCapSESAccessUser.secret,
    bounceNotificationEmail: bounceNotificationEmail,
  };

  const domainConfig = new DomainConfiguration({
    app,
    domain,
    hostInRoute53,
    stack,
    subdomain,
  });

  if (!domain && !email) throw new Error('No identify found to deploy Amazon SES');

  const publicHostedZone = domainConfig.publicHostedZone;

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
    cors: false,
  });
  const redcapApplicationBucket = new Bucket(stack, 'appBucket', {
    cdk: {
      bucket: {
        ...bucketProps(app, redcapApplicationBucketLogs),
      },
    },
    cors: false,
  });

  redcapApplicationBucket.cdk.bucket.grantReadWrite(redCapS3AccessUser.userGroup);

  // AWS WAF: CRON SHARED SECRET
  const searchString = createHmac('sha256', cronSecret)
    .update(cronSecret.split('').reverse().join(''))
    .digest('hex');

  // AWS WAF: CRON RULE
  const extraRules = [getRedcapCronRule(searchString, 20)];

  // AWS WAF: COUNTRY ALLOW IF IN LIST
  if (!isEmpty(allowedCountries)) {
    const countryRules = getCountryLimitRule(allowedCountries, 10);
    if (countryRules) extraRules.push(countryRules);
  }

  const waf = !expressConfig
    ? new Waf(stack, `${app.stage}-${app.name}-appwaf`, { allowedIps, extraRules })
    : undefined;

  const environmentVariables = {
    S3_BUCKET: redcapApplicationBucket.bucketName,
    USE_IAM_DB_AUTH: 'true',
    DB_SECRET_NAME: dbConnection.secretName,
    SMTP_EMAIL: email,
    DB_SECRET_ID: dbConnection.secretArn,
    DB_SALT_SECRET_ID: dbSalt.secretArn,
    SES_CREDENTIALS_SECRET_ID: ses.sesUserCredentials.secretArn,
    S3_SECRET_ID: redCapS3AccessUser.secret.secretArn,
    PHP_TIMEZONE: phpTimezone || 'UTC',
  };

  assign(environmentVariables, {
    READ_REPLICA_HOSTNAME: dbConnection.readEndpoint,
  });

  const service = new RedcapService(stack, app, {
    dbConnection,
    domain,
    subdomain,
    publicHostedZone,
    waf,
    secrets: {
      dbSalt,
      dbSecret: dbConnection.secret,
      redCapS3AccessUser,
      ses,
    },
    environmentVariables,
    vpc: networkVpc.vpc,
    servicePort: port,
    logRetention: generalLogRetention,
    repository,
    searchString,
    cronMinutes,
  });

  if (expressConfig) {
    // Deploy with ECS Express Mode backend, fronted by CloudFront.
    // Deploy the WAF first: sst deploy --stage <stage> --region us-east-1
    const cloudFrontWafArn = new CrossRegionSsmParameter(stack, 'cloudfront-waf-arn-reader', {
      region: 'us-east-1',
      parameterName: cloudFrontWafParamName(stack.stage),
    }).value;

    service.expressDeploy({
      securityGroups: [dbAllowedSg],
      cpu: get(expressConfig, 'cpu', '1024'),
      memory: get(expressConfig, 'memory', '2048'),
      scaling: get(expressConfig, 'scaling', undefined),
      tag,
      webAclArn: cloudFrontWafArn,
    });
  } else if (ecsConfig) {
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
  if (publicHostedZone?.hostedZoneNameServers)
    stack.addOutputs({
      NameServers: Fn.join(',', publicHostedZone.hostedZoneNameServers),
    });

  stack.addOutputs({
    AppRunnerServiceUrl: service.AppRunnerServiceUrl || '',
    CustomServiceUrl: service.CustomServiceUrl || '',
    EcsServiceUrl: service.EcsServiceUrl || '',
    ExpressServiceUrl: service.ExpressServiceUrl || '',
  });

  // Suppress cdk nag offenses.
  Suppressions.BackendStackSuppressions(stack);
  Suppressions.SesSuppressions(ses);
  if (waf) Suppressions.WebWafSuppressions(waf);
  Suppressions.RedCapAwsAccessUserSuppressions([redCapS3AccessUser, redCapSESAccessUser]);
  Suppressions.DBSecretSaltSuppressions(dbSalt);

  if (service.appRunnerService) Suppressions.AppRunnerSuppressions(service.appRunnerService, app);
  if (service.ecsService) Suppressions.ECSSuppressions(service.ecsService);
  if (service.expressService) Suppressions.ExpressSuppressions(service.expressService);

  return {
    repository,
    dbSalt,
    sesUserCredentials: ses.sesUserCredentials,
    s3UserCredentials: redCapS3AccessUser.secret,
    environmentVariables,
  };
}
