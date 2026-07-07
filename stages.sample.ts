import { aws_rds, Duration } from 'aws-cdk-lib';
import type { DomainAppsConfig, ProtoConfigOptions, RedCapConfig } from './prototyping';

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
    maxAllowedPacket: '1073741824',
    preferredMaintenanceWindow: 'Sun:23:45-Mon:00:15',
    engineVersion: aws_rds.AuroraMysqlEngineVersion.VER_3_10_0,
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
  // Uncomment to use ECS Express Mode instead of appRunner. Takes precedence
  // over `ecs`. CPU/memory are CloudFormation strings.
  // express: {
  //   cpu: '1024',
  //   memory: '2048',
  //   scaling: {
  //     autoScalingMetric: 'AVERAGE_CPU',
  //     autoScalingTargetValue: 60,
  //     minTaskCount: 1,
  //     maxTaskCount: 3,
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
  cronSecret: 'prodsecret',
  cronMinutes: 1,
  ec2ServerStack: {
    ec2StackDuration: Duration.hours(3),
  },
  db: {
    maxAllowedPacket: '1073741824',
    preferredMaintenanceWindow: 'Sun:23:45-Mon:00:15',
  },
  bounceNotificationEmail: 'email+bounce@mydomain.com',
  // ECS Express Mode runtime. Deploy with `yarn deploy:express --stage prod`.
  express: {
    cpu: '4096',
    memory: '8192',
    scaling: {
      autoScalingMetric: 'AVERAGE_CPU',
      autoScalingTargetValue: 60,
      minTaskCount: 2,
      maxTaskCount: 10,
    },
  },
};

const stag: RedCapConfig = {
  ...baseOptions,
  redCapS3Path: 'redcap-binaries/redcap13.7.2.zip',
  domain: 'redcap.mydomain.com',
  phpTimezone: 'Asia/Tokyo',
  hostInRoute53: true,
  rebuildImage: false,
  cronSecret: 'stagsecret',
  cronMinutes: 1,
  // ECS Express Mode runtime. Deploy with `yarn deploy:express --stage stag`.
  express: {
    cpu: '4096',
    memory: '8192',
    scaling: {
      autoScalingMetric: 'AVERAGE_CPU',
      autoScalingTargetValue: 60,
      minTaskCount: 1,
      maxTaskCount: 5,
    },
  },
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
