/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { aws_iam, cloudformation_include, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { type ISecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2';
import type { Repository } from 'aws-cdk-lib/aws-ecr';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53';
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
    /**
     * Subnet type for the Express service. Defaults to PRIVATE_WITH_EGRESS so
     * the ECS-managed ALB is internal and tasks stay private; a CloudFront VPC
     * Origin fronts the internal ALB for public access. Immutable after create.
     */
    subnetType?: SubnetType;
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
  /**
   * Custom domain to attach to the Express-managed ALB. When set together with
   * `publicHostedZone`, an ACM certificate is issued and a host-header rule +
   * Route53 alias record are created via a custom-resource workaround.
   */
  domain?: string;
  subdomain?: string;
  publicHostedZone?: IPublicHostedZone;
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
  /** The custom domain name, when configured. */
  public readonly customUrl?: string;

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
        // ECS Express Mode places its managed ALB in the subnets given here.
        // We use PRIVATE_WITH_EGRESS so the managed ALB is INTERNAL and the
        // tasks stay private (no public IPs). Public internet access is provided
        // by a CloudFront distribution with a VPC Origin in front of the
        // internal ALB (see the CloudFront wiring below). NOTE: subnet type is
        // immutable on an Express service - changing it requires REPLACING the
        // service (CloudFormation update is rejected by ECS).
        subnets: props.network.vpc.selectSubnets({
          subnetType: props.network.subnetType ?? SubnetType.PRIVATE_WITH_EGRESS,
        }).subnetIds,
      },
      scalingTarget: props.scaling,
    });

    // Ensure the roles exist before the service that references their ARNs.
    this.service.node.addDependency(this.infrastructureRole);
    this.service.node.addDependency(this.executionRole);
    this.service.node.addDependency(this.taskRole);

    this.url = this.service.attrEndpoint;
    this.loadBalancerArn = this.service.attrIngressPathLoadBalancerArn;

    // Attach a custom domain to the ECS-managed ALB. Express Mode does not
    // expose certificate/domain configuration on the CloudFormation resource,
    // so we replicate AWS's documented "update outside Express Mode" steps via
    // a custom-resource Lambda (mirrors the App Runner custom-domain approach).
    if (props.domain && props.publicHostedZone) {
      const domainName = props.subdomain ? `${props.subdomain}.${props.domain}` : props.domain;

      const certificate = new Certificate(this, 'express-domain-certificate', {
        domainName,
        validation: CertificateValidation.fromDns(props.publicHostedZone),
      });

      const customDomainCfn = new cloudformation_include.CfnInclude(
        this,
        `${prefix}-custom-domain`,
        {
          templateFile: './prototyping/cfn/EcsExpressCustomDomain.yaml',
          parameters: {
            DomainName: domainName,
            ListenerArn: this.service.attrIngressPathListenerArn,
            LoadBalancerArn: this.service.attrIngressPathLoadBalancerArn,
            CertificateArn: certificate.certificateArn,
            DNSDomainId: props.publicHostedZone.hostedZoneId,
          },
        },
      );

      // Re-assert the domain config after each Express service update to
      // counter drift from UpdateExpressGatewayService.
      customDomainCfn.node.addDependency(this.service);
      this.customUrl = domainName;
    }
  }
}
