import { RedCapConfig, DomainAppsConfig } from './prototyping';
import { Cpu, Memory } from '@aws-cdk/aws-apprunner-alpha';

const baseOptions = {
  name: 'REDCap',
  profile: 'your_aws_profile',
  region: 'ap-northeast-1',
  allowedIps: ['192.0.3.0/24'],
};

const dev: RedCapConfig = {
  ...baseOptions,
  hostInRoute53: false,
  phpTimezone: 'Asia/Tokyo',
  redCapS3Path: 'redcap-binaries/redcap13.7.2.zip',
  cronSecret: 'mysecret',
  email: 'email@mydomain.com',
  port: 8080,
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
  cpu: Cpu.FOUR_VCPU,
  memory: Memory.EIGHT_GB,
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
  cronSecret: 'stagsecret',
  cpu: Cpu.FOUR_VCPU,
  memory: Memory.EIGHT_GB,
};

// Optional: External NameServer configuration with AppRunner stage, example:
// const route53NS: DomainAppsConfig = {
//  ...baseOptions,
//  profile: 'your_aws_profile',
//  region: 'your_aws_region',
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
//  domain: 'redcap.mydomain.com',
// };

// Default route53NS config, no records are created. 
const route53NS: DomainAppsConfig = {
  ...baseOptions,
  profile: 'your_aws_profile',
  region: 'ap-northeast-1',
  apps: [],
  domain: '',
};

export { prod, stag, dev, route53NS };