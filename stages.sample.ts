import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';
import { Duration } from 'aws-cdk-lib';
import { DomainAppsConfig, ProtoConfigOptions, RedCapConfig } from './prototyping';

const baseOptions: ProtoConfigOptions = {
  name: 'REDCap',
  profile: 'your_aws_profile',
  region: 'ap-northeast-1',
  allowedIps: ['192.0.3.0/24'],
  allowedCountries: ['JP'], //(ISO) 3166
};

const dev: RedCapConfig = {
  ...baseOptions,
  hostInRoute53: false,
  phpTimezone: 'Asia/Tokyo',
  redCapS3Path: 'redcap-binaries/redcap13.7.2.zip',
  cronSecret: 'mysecret',
  cronMinutes: 1, // a value of 0 means disabled
  email: 'email@mydomain.com',
  port: 8080,
  db: {
    dbSnapshotId: undefined,
    maxAllowedPacket: '4194304',
    dbReaders: 0, // disable readers for dev envs
    scaling: {
      maxCapacityAcu: 2,
      minCapacityAcu: 0,
    },
  },
  // Uncomment to use ECS as backend instead of appRunner
  // ecs: {
  //   memory: '4 GB',
  //   cpu: '4 vCPU',
  //   scaling: {
  //     maxContainers: 3,
  //     minContainers: 1,
  //     requestsPerContainer: 100,
  //     cpuUtilization: 90,
  //   },
  // },
};

const prod: RedCapConfig = {
  ...baseOptions,
  phpTimezone: 'Asia/Tokyo',
  redCapLocalVersion: 'redcap13.7.2',
  domain: 'redcap.mydomain.com',
  hostInRoute53: true,
  email: 'email@mydomain.com',
  appRunnerConcurrency: 10,
  appRunnerMaxSize: 10,
  appRunnerMinSize: 2,
  cronSecret: 'prodsecret',
  cronMinutes: 1,
  cpu: Cpu.FOUR_VCPU,
  memory: Memory.EIGHT_GB,
  ec2ServerStack: {
    ec2StackDuration: Duration.hours(3),
  },
  bounceNotificationEmail: 'email+bounce@mydomain.com',
};

const stag: RedCapConfig = {
  ...baseOptions,
  redCapS3Path: 'redcap-binaries/redcap13.7.2.zip',
  domain: 'redcap.mydomain.com',
  phpTimezone: 'Asia/Tokyo',
  hostInRoute53: true,
  appRunnerConcurrency: 10,
  appRunnerMaxSize: 5,
  appRunnerMinSize: 1,
  rebuildImage: false,
  cronSecret: 'stagsecret',
  cronMinutes: 1,
  cpu: Cpu.FOUR_VCPU,
  memory: Memory.EIGHT_GB,
};

// Optional: External NameServer configuration with AppRunner stage, example:
// const route53NS: DomainAppsConfig = {
//  ...baseOptions,
//  profile: 'your_aws_profile',
//  region: 'your_aws_region',
//  domain: 'redcap.mydomain.com',
//  apps: [
//    {
//      name: 'redcap',
//      nsRecords: [
//        'ns-sample.co.uk',
//        'ns-sample.net',
//        'ns-sample.org',
//        'ns-sample.com',
//      ],
//    },
//  ],
// };

// Default route53NS config, no records are created.
const route53NS: DomainAppsConfig = {
  ...baseOptions,
  profile: 'your_aws_profile',
  region: 'ap-northeast-1',
  domain: '',
  apps: [],
};

export { dev, prod, route53NS, stag };
