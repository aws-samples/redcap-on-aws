/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { aws_iam, RemovalPolicy } from 'aws-cdk-lib';
import type { ISecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import type { Repository } from 'aws-cdk-lib/aws-ecr';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { App, Stack } from 'sst/constructs';
import {
  CfnExpressGatewayService,
  type ExpressGatewayScalingTargetProperty,
} from './vendored/ecs-express.generated';

export interface EcsExpressProps {
  app: App;
  stack: Stack;
  /**
   * The container image tag to deploy from the ECR repository.
   */
  tag: string;
  /**
   * The ECR repository that hosts the REDCap image.
   */
  repository: Repository;
  /**
   * Environment variables passed to the primary container. REDCap reads its
   * secrets by ARN from these variables at runtime.
   */
  environmentVariables?: Record<string, string>;
  /**
   * CPU allocation string, e.g. "256", "512", "1024". Default: "1024".
   */
  cpu?: string;
  /**
   * Memory allocation string, e.g. "512", "2048". Default: "2048".
   */
  memory?: string;
  /**
   * The port the REDCap container listens on. Default: 8080.
   */
  servicePort?: number;
  /**
   * Health check path used by the managed load balancer. Default: "/".
   */
  healthCheckPath?: string;
  /**
   * Auto-scaling configuration for the Express service.
   */
  scaling?: ExpressGatewayScalingTargetProperty;
  network: {
    vpc: Vpc;
    subnetType: SubnetType;
    /**
     * Security groups attached to the service tasks. Pass the shared
     * `dbAllowedSg` so Aurora ingress works without touching AWS-managed SGs.
     */
    securityGroups: ISecurityGroup[];
  };
  /**
   * Log retention for the container log group. Default: two years.
   */
  logRetention?: RetentionDays;
}

/**
 * Deploys REDCap on ECS Express Mode (`AWS::ECS::ExpressGatewayService`).
 *
 * Express Mode is a managed abstraction: Amazon ECS provisions and owns the
 * Application Load Balancer, target groups, listener, service security groups,
 * SSL certificate and auto-scaling policies. We provide the container config,
 * three IAM roles, and the VPC/subnet/security-group placement.
 *
 * Because the service security groups are AWS-managed and only known as tokens
 * after creation, DB connectivity is achieved by attaching the shared
 * `dbAllowedSg` (which Aurora already trusts) to the service tasks — the same
 * pattern used by the App Runner runtime.
 */
export class EcsExpress extends Construct {
  public readonly service: CfnExpressGatewayService;
  public readonly executionRole: aws_iam.Role;
  public readonly taskRole: aws_iam.Role;
  public readonly infrastructureRole: aws_iam.Role;
  public readonly logGroup: LogGroup;
  /** The managed endpoint hostname of the Express service. */
  public readonly url: string;
  /** The ARN of the managed load balancer, for WAF association. */
  public readonly loadBalancerArn: string;

  constructor(scope: Stack, id: string, props: EcsExpressProps) {
    super(scope, id);

    const prefix = `${props.app.stage}-${props.app.name}-express`;
    const servicePort = props.servicePort ?? 8080;

    // Log group for the primary container.
    this.logGroup = new LogGroup(this, 'log-group', {
      retention: props.logRetention ?? RetentionDays.TWO_YEARS,
      removalPolicy: props.app.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Task execution role: pull the image from ECR and write container logs.
    this.executionRole = new aws_iam.Role(this, 'execution-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'REDCap Express task execution role',
    });
    props.repository.grantPull(this.executionRole);
    this.executionRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );
    this.logGroup.grantWrite(this.executionRole);

    // Task role: the application identity. Secret/DB grants are added by the
    // caller (RedcapService.grantSecretsReadAndConnect), mirroring the ECS path.
    this.taskRole = new aws_iam.Role(this, 'task-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'REDCap Express task role',
    });

    // Infrastructure role: lets Amazon ECS manage the ALB, target groups,
    // security groups, SSL certs and auto scaling on our behalf.
    this.infrastructureRole = new aws_iam.Role(this, 'infrastructure-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs.amazonaws.com'),
      description: 'REDCap Express infrastructure role',
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSInfrastructureRoleforExpressGatewayServices',
        ),
      ],
    });

    const environment = Object.entries(props.environmentVariables ?? {}).map(([name, value]) => ({
      name,
      value,
    }));

    this.service = new CfnExpressGatewayService(this, 'service', {
      serviceName: prefix,
      infrastructureRoleArn: this.infrastructureRole.roleArn,
      executionRoleArn: this.executionRole.roleArn,
      taskRoleArn: this.taskRole.roleArn,
      cpu: props.cpu ?? '1024',
      memory: props.memory ?? '2048',
      healthCheckPath: props.healthCheckPath ?? '/',
      primaryContainer: {
        image: `${props.repository.repositoryUri}:${props.tag}`,
        containerPort: servicePort,
        environment,
        awsLogsConfiguration: {
          logGroup: this.logGroup.logGroupName,
          logStreamPrefix: 'redcap',
        },
      },
      networkConfiguration: {
        securityGroups: props.network.securityGroups.map((sg) => sg.securityGroupId),
        subnets: props.network.vpc.selectSubnets({ subnetType: props.network.subnetType })
          .subnetIds,
      },
      scalingTarget: props.scaling,
    });

    // Ensure the roles exist before the service that references their ARNs.
    this.service.node.addDependency(this.infrastructureRole);
    this.service.node.addDependency(this.executionRole);
    this.service.node.addDependency(this.taskRole);

    this.url = this.service.attrEndpoint;
    this.loadBalancerArn = this.service.attrIngressPathLoadBalancerArn;
  }
}
