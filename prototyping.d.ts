import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import { Duration } from 'aws-cdk-lib';
import { ServiceProps } from 'sst/constructs';
import { ConfigOptions } from 'sst/project';

export interface ProtoConfigOptions extends ConfigOptions {
  allowedIps?: string[];
  allowedCountries?: string[]; // WAF allowed country list,  ISO 3166-2.
}

export interface RedCapConfig extends ProtoConfigOptions {
  generalLogRetention?: ServiceProps['logRetention']; // Optional general log retention period for <ecs fargate, aurora rds, vpc>
  bounceNotificationEmail?: string;
  phpTimezone?: string;
  redCapS3Path?: string; // if specified, target an s3 path
  redCapLocalVersion?: string; // if specified, refer the local package file
  domain?: string;
  subdomain?: string;
  hostInRoute53: boolean | string; // if string, this will perform a lookup in Route 53 for the provided domain name. If true, it will create a new Hosted Zone in Route 53.
  email?: string; // used for AWS appRunner notifications and SES if no domain is provided.
  appRunnerConcurrency?: number;
  appRunnerMaxSize?: number;
  appRunnerMinSize?: number;
  autoDeploymentsEnabled?: boolean;
  cpu?: Cpu;
  memory?: Memory;
  cronSecret?: string; // protect cron.php endpoint with a secret parameter https://endpoint/cron.php?secret=<secret>
  cronMinutes?: number; // cron execution in minutes, a value of zero means disabled
  port?: number;
  deployTag?: string; // forces a new AppRunner deployment and tags ECR docker image with this value
  rebuildImage?: boolean;
  ec2ServerStack?: {
    // an EC2 server running the REDCap docker image, used for long running server requests
    ec2StackDuration: Duration; // after this time, the EC2 stack will be destroyed
  };
  ecs?: {
    //Override AppRunner deployment and use Amazon ECS Fargate
    memory: ServiceProps['memory'];
    cpu: ServiceProps['cpu'];
    scaling: ServiceProps['scaling'];
  };
  db?: {
    // The number of additional aurora readers, by default, 1 reader is added. Use 0 to use single writer/reader
    dbReaders?: number;
    dbSnapshotId?: string;
    maxAllowedPacket?: string;
    scaling?: {
      minCapacityAcu: number;
      maxCapacityAcu: number;
    };
  };
}

export interface DomainAppsConfig extends ConfigOptions {
  apps: Array<DomainAppConfig>;
  domain: string;
  profile: string;
  region: string;
}

interface DomainAppConfig {
  name: string;
  nsRecords: Array<string>;
}
