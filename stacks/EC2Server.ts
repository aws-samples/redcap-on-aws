/* eslint-disable no-useless-escape */
import { aws_ec2 } from 'aws-cdk-lib';
import {
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  SubnetType,
  UserData,
} from 'aws-cdk-lib/aws-ec2';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import {
  DefinitionBody,
  LogLevel,
  StateMachine,
  Wait,
  WaitTime,
} from 'aws-cdk-lib/aws-stepfunctions';
import { CallAwsService } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Trigger } from 'aws-cdk-lib/triggers';

import { get } from 'lodash';
import { Function, StackContext, use } from 'sst/constructs';

import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { Backend } from './Backend';
import { BuildImage } from './BuildImage';
import { Database } from './Database';
import { Network } from './Network';

import * as stage from '../stages';

function generateEnvUserData(envVars: { [key: string]: string }, profiledPath: string): string {
  const envExports = Object.keys(envVars)
    .map(key =>
      envVars[key].includes('--output json')
        ? `export ${key}=${envVars[key]}`
        : `export ${key}=\\"${envVars[key]}\\"`,
    )
    .join('\\n');
  return `
touch ${profiledPath}
chmod +x ${profiledPath}
echo -e "${envExports}" > ${profiledPath}
  `;
}

export function EC2Server({ stack, app }: StackContext) {
  const ec2Stack = get(stage, [stack.stage, 'ec2ServerStack']);
  const ec2StackDuration = get(ec2Stack, 'ec2StackDuration');

  if (!ec2Stack) {
    Suppressions.SSTEmptyStackSuppressions(stack);
    return;
  }

  const repository = use(BuildImage);
  const { networkVpc } = use(Network);
  const { dbSalt, s3UserCredentials, sesUserCredentials, environmentVariables } = use(Backend);
  const { dbAllowedSg, auroraClusterV2 } = use(Database);

  const userData = UserData.forLinux({ shebang: '#!/bin/bash' });

  const profiledPath = '/etc/profile.d/cdk_variables.sh';
  const dockerEnv = `-e AWS_REGION='${app.region}'\
  -e USE_CERT='1' \
  -e USE_IAM_DB_AUTH='true' \
  -e DB_SECRET_ID=\$DB_SECRET_ID \
  -e DB_SALT_SECRET_ID=\$DB_SALT_SECRET_ID \
  -e DB_SECRET_NAME=\$DB_SECRET_NAME \
  -e S3_BUCKET=\$S3_BUCKET \
  -e S3_SECRET_ID=\$S3_SECRET_ID \
  -e SES_CREDENTIALS_SECRET_ID=\$SES_CREDENTIALS_SECRET_ID \
  -e PHP_TIMEZONE=\$PHP_TIMEZONE \
  -e SMTP_EMAIL=\$SMTP_EMAIL`;

  userData.addCommands(
    'sudo dnf update -y',
    'sudo dnf install -y docker',
    'sudo service docker start',
    'sudo usermod -a -G docker ec2-user',
    `aws ecr get-login-password --region ${app.region} | docker login --username AWS --password-stdin ${app.account}.dkr.ecr.${app.region}.amazonaws.com`,
    `docker pull ${repository.repositoryUri}`,
    generateEnvUserData(environmentVariables, profiledPath),
    `sudo su && runuser -l ec2-user -c 'docker run --rm -d --sig-proxy=false -p 8081:8081 ${dockerEnv} ${repository.repositoryUri}'`,
  );

  const ec2ServerInstance = new Instance(stack, `EC2ServerInstance`, {
    instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MEDIUM),
    machineImage: MachineImage.latestAmazonLinux2023(),
    vpc: networkVpc.vpc,
    vpcSubnets: networkVpc.vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    }),
    userData,
    userDataCausesReplacement: true,
    securityGroup: dbAllowedSg,
    ssmSessionPermissions: true,
    detailedMonitoring: true,
    associatePublicIpAddress: false,
    blockDevices: [
      {
        deviceName: '/dev/sda1',
        mappingEnabled: true,
        volume: aws_ec2.BlockDeviceVolume.ebs(20, {
          deleteOnTermination: true,
          encrypted: true,
          volumeType: aws_ec2.EbsDeviceVolumeType.GP2,
        }),
      },
    ],
  });

  // Allow secrets read for EC2 instance
  auroraClusterV2.aurora.secret?.grantRead(ec2ServerInstance.role);
  dbSalt.grantRead(ec2ServerInstance.role);
  s3UserCredentials.grantRead(ec2ServerInstance.role);
  sesUserCredentials.grantRead(ec2ServerInstance.role);
  repository.grantPull(ec2ServerInstance.role);

  // Allow RDS IAM connect
  auroraClusterV2.aurora.grantConnect(ec2ServerInstance.role, 'redcap_user');

  const wait = new Wait(stack, `wait`, {
    time: WaitTime.duration(ec2StackDuration),
  });

  const stackArn = `arn:aws:cloudformation:${stack.region}:${stack.account}:stack/${stack.stackName}/*`;

  const deleteStack = new CallAwsService(stack, `deleteStack`, {
    service: 'cloudFormation',
    action: 'deleteStack',
    iamResources: [stackArn],
    parameters: {
      StackName: stack.stackName,
    },
  });

  deleteStack.addRetry({
    maxAttempts: 3,
  });

  const def = DefinitionBody.fromChainable(wait.next(deleteStack));

  const terminateStateMachine = new StateMachine(stack, `deleteStackStateMachine`, {
    definitionBody: def,
    logs: {
      destination: new LogGroup(stack, `deleteStackSfnLogGroup`),
      level: LogLevel.ALL,
    },
    tracingEnabled: true,
  });

  const stateMachineExecHandler = new Function(stack, `stateMachineExecHandler`, {
    handler: 'packages/functions/src/stateMachineExec.handler',
    environment: {
      SFN_ARN: terminateStateMachine.stateMachineArn,
    },
  });

  stateMachineExecHandler.addToRolePolicy(
    new PolicyStatement({
      actions: ['states:StartExecution'],
      effect: Effect.ALLOW,
      resources: [terminateStateMachine.stateMachineArn],
    }),
  );

  new Trigger(stack, 'terminateEC2Trigger', {
    handler: stateMachineExecHandler,
  });

  const profile = get(stage, [stack.stage, 'profile'], 'default');

  stack.addOutputs({
    ssmPortForward: `aws ssm start-session --target ${ec2ServerInstance.instanceId} \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["8081"],"localPortNumber":["8081"]}' --region ${app.region} --profile ${profile}`,
  });

  Suppressions.EC2ServerSuppressions(
    ec2ServerInstance,
    terminateStateMachine,
    stateMachineExecHandler,
  );
}
