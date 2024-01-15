import { ConfigOptions } from 'sst/project';
import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';

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
  cpu?: Cpu;
  memory?: Memory;
  cronSecret?: string; // protect cron.php endpoint with a secret parameter https://endpoint/cron.php?secret=<secret>
  port?: number;
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
