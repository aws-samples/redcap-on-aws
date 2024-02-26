import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import { Duration } from 'aws-cdk-lib';
import { ConfigOptions } from 'sst/project';

export interface ProtoConfigOptions extends ConfigOptions {
  allowedIps?: string[];
}

export interface RedCapConfig extends ProtoConfigOptions {
  phpTimezone?: string;
  redCapS3Path?: string; // if specified, target an s3 path
  redCapLocalVersion?: string; // if specified, refer the local package file
  domain?: string;
  subdomain?: string;
  hostInRoute53: boolean;
  email?: string; // used for AWS appRunner notifications and SES if no domain is provided.
  appRunnerConcurrency?: number;
  appRunnerMaxSize?: number;
  appRunnerMinSize?: number;
  autoDeploymentsEnabled?: boolean;
  cpu?: Cpu;
  memory?: Memory;
  cronSecret?: string; // protect cron.php endpoint with a secret parameter https://endpoint/cron.php?secret=<secret>
  port?: number;
  deployTag?: string; // forces a new AppRunner deployment and tags ECR docker image with this value
  rebuildImage?: boolean;
  ec2ServerStack?: {
    // an EC2 server running the REDCap docker image, used for long running server requests
    ec2StackDuration: Duration; // after this time, the EC2 stack will be destroyed
  };
}

interface DomainAppConfig {
  name: string;
  nsRecords: Array<string>;
}

export interface DomainAppsConfig extends ConfigOptions {
  apps: Array<DomainAppConfig>;
  domain: string;
  profile: string;
  region: string;
}
