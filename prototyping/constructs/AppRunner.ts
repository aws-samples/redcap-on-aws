/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import * as ecr from 'aws-cdk-lib/aws-ecr';

import {
  Cpu,
  ImageConfiguration,
  Memory,
  Service,
  Source,
  VpcConnector,
} from '@aws-cdk/aws-apprunner-alpha';
import {
  RemovalPolicy,
  aws_ec2,
  aws_events,
  aws_events_targets,
  aws_iam,
  aws_sns,
} from 'aws-cdk-lib';
import {
  CfnAutoScalingConfiguration,
  CfnAutoScalingConfigurationProps,
  CfnService,
} from 'aws-cdk-lib/aws-apprunner';
import { Construct } from 'constructs';

export class AppRunner extends Construct {
  public readonly service;
  constructor(
    scope: Construct,
    id: string,
    props: {
      instanceRole?: aws_iam.Role;
      accessRole?: aws_iam.Role;
      autoDeploymentsEnabled?: boolean;
      notificationEmail?: string;
      network?: {
        vpc: aws_ec2.Vpc;
        subnetType: aws_ec2.SubnetType;
        securityGroups?: aws_ec2.ISecurityGroup[];
      };
      appName: string;
      service: {
        config?: {
          cpu?: Cpu;
          port?: ImageConfiguration['port'];
          memory?: Memory;
          environmentSecrets?: ImageConfiguration['environmentSecrets'];
          environmentVariables?: ImageConfiguration['environmentVariables'];
        };
        image: {
          repositoryName: string;
          tag?: string;
        };
        healthCheck?: {
          path?: string;
        };
      };
      scalingConfiguration?: CfnAutoScalingConfigurationProps;
    },
  ) {
    super(scope, id);

    // Create VPC Connector
    let vpcConnector;

    if (props.network) {
      vpcConnector = new VpcConnector(this, 'vpc-connector', {
        vpc: props.network.vpc,
        vpcSubnets: props.network.vpc.selectSubnets({ subnetType: props.network.subnetType }),
        securityGroups: props.network.securityGroups,
      });
    }

    // Create access role if there's no access role in props
    let accessRole;
    if (props.accessRole) accessRole = props.accessRole;
    else {
      accessRole = new aws_iam.Role(this, `apprunner-accessRole`, {
        assumedBy: new aws_iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      });
      accessRole.addToPolicy(
        new aws_iam.PolicyStatement({
          actions: [
            'ecr:DescribeImages',
            'wafv2:ListResourcesForWebACL',
            'wafv2:GetWebACLForResource',
            'wafv2:AssociateWebACL',
            'wafv2:DisassociateWebACL',
            'apprunner:ListAssociatedServicesForWebAcl',
            'apprunner:DescribeWebAclForService',
            'apprunner:AssociateWebAcl',
            'apprunner:DisassociateWebAcl',
          ],
          resources: ['*'],
        }),
      );
    }

    // Create App Runner service
    this.service = new Service(this, 'apprunner-service', {
      source: Source.fromEcr({
        imageConfiguration: { ...props.service.config },
        repository: ecr.Repository.fromRepositoryName(
          this,
          `${props.appName}-reponame`,
          props.service.image.repositoryName,
        ),
        tagOrDigest: props.service.image.tag || 'latest',
      }),
      autoDeploymentsEnabled: props.autoDeploymentsEnabled || false,
      vpcConnector,
      accessRole,
      instanceRole: props.instanceRole,
      cpu: props.service.config?.cpu || Cpu.TWO_VCPU,
      memory: props.service.config?.memory || Memory.FOUR_GB,
    });

    // Configure auto scaling
    const autoScalingConfiguration = new CfnAutoScalingConfiguration(
      this,
      `AppRunnerScalingConfig`,
      props.scalingConfiguration,
    );
    const cfnService = this.service.node.defaultChild as CfnService;
    cfnService.autoScalingConfigurationArn =
      autoScalingConfiguration.attrAutoScalingConfigurationArn;

    // Configure health check
    if (props.service.healthCheck?.path) {
      cfnService.healthCheckConfiguration = {
        protocol: 'HTTP',
        path: props.service.healthCheck.path,
      };
    }

    this.service.applyRemovalPolicy(RemovalPolicy.DESTROY);

    // Configure notification email about App Runner
    if (props.notificationEmail) {
      const rule = new aws_events.Rule(this, 'apprunner-rule', {
        eventPattern: {
          source: ['aws.apprunner'],
          detail: {
            serviceName: [this.service.serviceName],
            operationStatus: [
              'PauseServiceCompletedSuccessfully',
              'PauseServiceFailed',
              'ResumeServiceCompletedSuccessfully',
              'ResumeServiceFailed',
              'UpdateServiceCompletedSuccessfully',
              'UpdateServiceFailed',
              'DeploymentCompletedSuccessfully',
              'DeploymentFailed',
            ],
          },
        },
      });

      const snsTopic = new aws_sns.Topic(this, 'apprunner-topic');

      rule.addTarget(new aws_events_targets.SnsTopic(snsTopic));
      new aws_sns.Subscription(this, 'apprunner-sub', {
        endpoint: props.notificationEmail,
        protocol: aws_sns.SubscriptionProtocol.EMAIL,
        topic: snsTopic,
      });
    }
  }
}
