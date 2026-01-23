/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Stack } from 'aws-cdk-lib';
import type { Instance } from 'aws-cdk-lib/aws-ec2';
import type { CfnDetector } from 'aws-cdk-lib/aws-guardduty';
import type { IHostedZone } from 'aws-cdk-lib/aws-route53';
import type { BucketDeployment } from 'aws-cdk-lib/aws-s3-deployment';
import type { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import type { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { get } from 'lodash';
import type { App, Function as SSTFunctionType } from 'sst/constructs';
import * as stage from '../../stages';
import type { AppRunner } from '../constructs/AppRunner';
import type { AuroraServerlessV2 } from '../constructs/AuroraServerlessV2';
import type { CodeBuildProject } from '../constructs/CodeBuildProject';
import type { EcsFargate } from '../constructs/EcsFargate';
import type { RedCapAwsAccessUser } from '../constructs/RedCapAwsAccessUser';
import type { SimpleEmailService } from '../constructs/SimpleEmailService';
import type { Waf } from '../constructs/Waf';

const Suppressions = {
  ECSSuppressions(service: EcsFargate) {
    const stack = Stack.of(service);
    try {
      NagSuppressions.addStackSuppressions(
        stack,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Log retention default service role',
          },
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Default exec role for AWS Fargate',
          },
          {
            id: 'AwsSolutions-L1',
            reason: 'SST lambda version',
          },
        ],
        true,
      );
    } catch {
      /* empty */
    }
    try {
      NagSuppressions.addResourceSuppressions(
        service,
        [
          {
            id: 'AwsSolutions-ECS4',
            reason: 'container insight due to sst/Service construct, but enabled by escape hatch',
          },
          {
            id: 'AwsSolutions-ECS2',
            reason: 'use env vars for secrets arn',
          },
          {
            id: 'AwsSolutions-EC23',
            reason: 'alb needs to be internet facing',
          },
        ],
        true,
      );
    } catch {
      /* empty */
    }
  },

  SSTEmptyStackSuppressions(stack: Stack) {
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
    } catch {
      /* empty */
    }
  },

  EC2ServerSuppressions(
    ec2ServerInstance: Instance,
    terminateStateMachine: StateMachine,
    stateMachineExecHandler: SSTFunctionType,
  ) {
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
    } catch {
      /* empty */
    }
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
    } catch {
      /* empty */
    }
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
      //suppress SourcemapUploaderPolicy/Resource
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Need to use * because cannot get full stack ARN while deployment',
        },
      ]);
    } catch {
      /* empty */
    }
  },

  Route53NS(zone: IHostedZone) {
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
    } catch {
      /* empty */
    }
  },

  SesSuppressions(ses: SimpleEmailService) {
    try {
      const stack = Stack.of(ses);
      NagSuppressions.addResourceSuppressionsByPath(
        stack,
        [
          `${stack.stackName}/ses-user-password/Resource`,
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
    } catch {
      /* empty */
    }
  },

  AppRunnerSuppressions(service: AppRunner, app: App) {
    const stack = Stack.of(service);
    try {
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Managed policy for AppRunner and ecr image pull',
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
    } catch {
      /* empty */
    }
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
    } catch {
      /* empty */
    }
    const resources = [
      `${stack.stackName}/${app.stage}-${app.name}-service/apprunner-accessRole/Resource`,
      `${stack.stackName}/${app.stage}-${app.name}-service/apprunner-accessRole/DefaultPolicy/Resource`,
      `${stack.stackName}/${app.stage}-${app.name}-service/apprunner-topic/Resource`,
    ];

    const domain = get(stage, [app.stage, 'domain'], undefined);

    if (domain) {
      resources.push(
        `${stack.stackName}/${app.stage}-${app.name}-apprunner-custom-domain/AppRunnerCustomDomainProvider`,
        `${stack.stackName}/${app.stage}-${app.name}-apprunner-custom-domain/LambdaRole`,
      );
    }
    try {
      NagSuppressions.addResourceSuppressionsByPath(stack, resources, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Managed policy for AppRunner and ECR image pull',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Deployed app runner policy',
        },
        {
          id: 'AwsSolutions-L1',
          reason: 'SST Lambda version',
        },
      ]);
    } catch {
      /* empty */
    }
  },

  WebWafSuppressions(waf: Waf) {
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
    } catch {
      /* empty */
    }
  },

  NetworkVpcSuppressions(networkVpc: Construct) {
    try {
      NagSuppressions.addStackSuppressions(Stack.of(networkVpc), [
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
        {
          id: 'AwsSolutions-EC23',
          reason: 'TODO: SG created by by privatelink ',
        },
      ]);
    } catch {
      /* empty */
    }
  },

  DBSecretSaltSuppressions(secret: Secret) {
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
    } catch {
      /* empty */
    }
  },

  RDSV2Suppressions(cluster: AuroraServerlessV2) {
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
    } catch {
      /* empty */
    }
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
    } catch {
      /* empty */
    }
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
    } catch {
      /* empty */
    }
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
    } catch {
      /* empty */
    }
  },

  BuildImageSuppressions(project: CodeBuildProject) {
    const stack = Stack.of(project);
    try {
      NagSuppressions.addStackSuppressions(stack, [
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
          reason: 'Xray and ec2 policies',
        },
      ]);
    } catch {
      /* empty */
    }
  },

  BucketSuppressions(bucketDeploymentLambda: BucketDeployment) {
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
    } catch {
      /* empty */
    }
  },

  SecurityDetectorSuppressions(detector: CfnDetector) {
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
    } catch {
      /* empty */
    }
  },

  RedCapAwsAccessUserSuppressions(redCapAccessUser: Array<RedCapAwsAccessUser>) {
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
    } catch {
      /* empty */
    }
  },

  SimpleEmailServiceSuppressions(snsTopic: ITopic) {
    try {
      NagSuppressions.addResourceSuppressions(snsTopic, [
        {
          id: 'AwsSolutions-SNS2',
          reason: 'SES bounce, no encryption',
        },
        {
          id: 'AwsSolutions-SNS3',
          reason: 'SES bounce, no encryption',
        },
      ]);
    } catch {
      /* empty */
    }
  },
};

export default Suppressions;
