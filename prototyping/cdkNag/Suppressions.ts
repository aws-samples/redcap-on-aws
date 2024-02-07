/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Stack } from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { App, Function } from 'sst/constructs';

import { CfnDetector } from 'aws-cdk-lib/aws-guardduty';
import { BucketDeployment } from 'aws-cdk-lib/aws-s3-deployment';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

import { Instance } from 'aws-cdk-lib/aws-ec2';
import { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { AppRunner } from '../constructs/AppRunner';
import { AuroraServerlessV2 } from '../constructs/AuroraServerlessV2';
import { CodeBuildProject } from '../constructs/CodeBuildProject';
import { RedCapAwsAccessUser } from '../constructs/RedCapAwsAccessUser';
import { SimpleEmailService } from '../constructs/SimpleEmailService';
import { Waf } from '../constructs/Waf';

export class Suppressions {
  static SSTEmptyStackSuppressions(stack: Stack) {
    try {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'IAM role managed policy for deploying',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'IAM role managed policy for deploying',
        },
      ]);
    } catch (e) {}
  }

  static StateMachineSuppressions(
    terminateStateMachine: StateMachine,
    stateMachineExecHandler: Function,
  ) {
    try {
      const stack = Stack.of(terminateStateMachine);
      NagSuppressions.addResourceSuppressions(
        [terminateStateMachine, stateMachineExecHandler],
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Default policies for Lambda and state machine',
          },
        ],
        true,
      );
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Need to use * because cannot get full stack ARN while deployment',
        },
      ]);
    } catch (e) {}
  }
  static EC2ServerSuppressions(ec2ServerInstance: Instance) {
    const stack = Stack.of(ec2ServerInstance);
    try {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Managed policy for SSM',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'SST lambda version',
        },
      ]);
    } catch (e) {}
    try {
      NagSuppressions.addResourceSuppressions(
        [ec2ServerInstance.role, ec2ServerInstance],
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Default policy ec2',
          },
          {
            id: 'AwsSolutions-EC29',
            reason:
              'This is a temporary EC2 instance, terminated after a defined user duration time',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static Route53NS(zone: IHostedZone) {
    const stack = Stack.of(zone);
    try {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Managed policy for ns records',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'SST lambda version',
        },
      ]);
    } catch (e) {}
  }

  static SesSuppressions(ses: SimpleEmailService) {
    try {
      const stack = Stack.of(ses);
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/ses-user-password/Resource`,
          `${stack.stackName}/redcap-ses/user-policy/Resource`,
          `${stack.stackName}/get-credentials/ServiceRole/Resource`,
          `${stack.stackName}/get-credentials/ServiceRole/DefaultPolicy/Resource`,
          `${stack.stackName}/get-credentials/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-SMG4',
            reason: 'Secret managed by lambda createSesCredentials for SES credentials',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Ses * send raw email and manage secret bind by resource',
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Use managed roles',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'SST lambda version',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static AppRunnerSuppressions(service: AppRunner, app: App) {
    const stack = Stack.of(service);
    try {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Managed policy for apprunner and ecr image pull',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Deployed app runner policy',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'SST lambda version',
        },
      ]);
    } catch (e) {}
    try {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [`${stack.stackName}/${app.stage}-${app.name}-service/apprunner-topic/Resource`],
        [
          {
            id: 'AwsSolutions-SNS2',
            reason: 'AppRunner event state, no encryption',
          },
          {
            id: 'AwsSolutions-SNS3',
            reason: 'AppRunner event state, no encryption',
          },
        ],
      );
    } catch (e) {}
    try {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/${app.stage}-${app.name}-service/apprunner-accessRole/Resource`,
          `${stack.stackName}/${app.stage}-${app.name}-service/apprunner-accessRole/DefaultPolicy/Resource`,
          `${stack.stackName}/${app.stage}-${app.name}-apprunner-custom-domain/LambdaRole`,
          `${stack.stackName}/${app.stage}-${app.name}-apprunner-custom-domain/AppRunnerCustomDomainProvider`,
          `${stack.stackName}/${app.stage}-${app.name}-service/apprunner-topic/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Managed policy for apprunner and ecr image pull',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Deployed app runner policy',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'SST lambda version',
          },
        ],
      );
    } catch (e) {}
  }

  static WebWafSuppressions(waf: Waf) {
    try {
      const stack = Stack.of(waf);
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/CustomResourceHandler/ServiceRole/Resource`,
          `${stack.stackName}/CustomResourceHandler/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom resource service role resource',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Cdk custom resource lambda version',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static NetworkVpcSuppressions(networkVpc: Construct) {
    NagSuppressions.addStackSuppressions(
      Stack.of(networkVpc),
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Related to custom handler self-policy deployed by cdk (flowlogs)',
        },
        {
          id: 'AwsSolutions-L1',
          reason:
            'Related to lambda container to manage a custom handler deployed by cdk (flowlogs)',
        },
        {
          id: 'CdkNagValidationFailure',
          reason: 'TODO: SG created by by privatelink ',
        },
      ],
      true,
    );
  }

  static DBSecretSalt(secret: Secret) {
    try {
      NagSuppressions.addResourceSuppressions(
        secret,
        [
          {
            id: 'AwsSolutions-SMG4',
            reason: 'This is db salt for redcap, should not be rotated',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static RDSV2Suppressions(cluster: AuroraServerlessV2) {
    const stack = Stack.of(cluster);
    try {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`,
          `${stack.stackName}/AWS679f53fac002430cb0da5b7982bd2287/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom resource for RDS cluster resource ID',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Related to lambda container to manage a custom handler deployed by cdk',
          },
        ],
      );
    } catch (e) {}
    try {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/CustomResourceHandler/ServiceRole/Resource`,
          `${stack.stackName}/CustomResourceHandler/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom resource handler service Role',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Related to lambda container to manage a custom handler deployed by cdk',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Lambda migration function default policy',
          },
        ],
      );
    } catch (e) {}
    try {
      NagSuppressions.addResourceSuppressions(
        cluster,
        [
          {
            id: 'AwsSolutions-RDS11',
            reason: 'Use default mysql port',
          },
          {
            id: 'AwsSolutions-RDS10',
            reason: "It's convenient to set deletionProtection as false in development",
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom resource handler service Role',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Lambda migration function default policy',
          },
          {
            id: 'AwsSolutions-L1',
            reason:
              'Related to lambda container to manage a custom handler deployed by cdk (auroraServerlessV2)',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'due to migrationsFunctionHandler in sst',
          },
        ],
        true,
      );
    } catch (e) {}
    try {
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource`,
          `${stack.stackName}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom resource handler service Role',
          },

          {
            id: 'AwsSolutions-IAM5',
            reason: 'Lambda migration function default policy',
          },
        ],
      );
    } catch (e) {}
  }

  static BuildImageSuppressions(project: CodeBuildProject, app: App) {
    const stack = Stack.of(project);
    try {
      NagSuppressions.addStackSuppressions(
        stack,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom handler service role',
          },
          {
            id: 'AwsSolutions-CB3',
            reason: 'Priviledge mode to build docker image',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Custom resource lambda version',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'need to grant to get all assets under specific bucket',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static BucketSuppressions(bucketDeploymentLambda: BucketDeployment) {
    const stack = Stack.of(bucketDeploymentLambda);
    try {
      NagSuppressions.addResourceSuppressions(
        stack,
        [
          {
            // TODO: might be required to enable later, but put into a extension
            id: 'AwsSolutions-S1',
            reason: 'No access logs required for self-upload redcap files',
          },
          {
            id: 'AwsSolutions-L1',
            reason:
              'Related to lambda container to manage a custom handler deployed by cdk (CDKBucketDeploy)',
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Created IAM role automatically for the deployment lambda ',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Created IAM policy automatically for the deployment lambda ',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static SecurityDetectorSuppressions(detector: CfnDetector) {
    try {
      const stack = Stack.of(detector);
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack}/CustomResourceHandler/ServiceRole/Resource`,
          `${stack}/CustomResourceHandler/Resource`,
        ],
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Custom resource handler service Role',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'Custom resource lambda version',
          },
        ],
        true,
      );
    } catch (e) {}
  }

  static RedCapAwsAccessUserSuppressions(redCapAccessUser: Array<RedCapAwsAccessUser>) {
    try {
      NagSuppressions.addResourceSuppressions(
        redCapAccessUser,
        [
          {
            id: 'AwsSolutions-SMG4',
            reason: 'Storing an IAM credential, must be rotated manually',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'need to read/write whole s3 bucket',
          },
        ],
        true,
      );
    } catch (e) {}
  }
}
