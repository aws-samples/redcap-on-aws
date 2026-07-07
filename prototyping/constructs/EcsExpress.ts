/*
 *  Copyright 2026 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { aws_iam, Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { VpcOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { type ISecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2';
import type { Repository } from 'aws-cdk-lib/aws-ecr';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { ARecord, type IPublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import type { App, Stack } from 'sst/constructs';
import {
  CfnExpressGatewayService,
  type ExpressGatewayScalingTargetProperty,
} from './vendored/ecs-express.generated';

export interface EcsExpressProps {
  app: App;
  stack: Stack;
  /** Container image tag to deploy from the ECR repository. */
  tag: string;
  /** ECR repository hosting the REDCap image. */
  repository: Repository;
  /** Environment variables passed to the primary container. */
  environmentVariables?: Record<string, string>;
  /** CPU allocation string, e.g. "1024". Default: "1024". */
  cpu?: string;
  /** Memory allocation string, e.g. "2048". Default: "2048". */
  memory?: string;
  /** Container listen port. Default: 8080. */
  servicePort?: number;
  /** Load balancer health check path. Default: "/". */
  healthCheckPath?: string;
  /** Auto-scaling configuration for the Express service. */
  scaling?: ExpressGatewayScalingTargetProperty;
  network: {
    vpc: Vpc;
    /** Subnet type for the managed ALB. Default PRIVATE_WITH_EGRESS. Immutable after create. */
    subnetType?: SubnetType;
    /** Security groups for the tasks (pass the shared `dbAllowedSg` for Aurora ingress). */
    securityGroups: ISecurityGroup[];
  };
  /** Log retention for the container log group. Default: two years. */
  logRetention?: RetentionDays;
  /** Custom domain served by CloudFront (requires `publicHostedZone` and `certificate`). */
  domain?: string;
  subdomain?: string;
  publicHostedZone?: IPublicHostedZone;
  /** ACM certificate for the custom domain. Must be in us-east-1 (attached to CloudFront). */
  certificate?: ICertificate;
  /** ARN of the CLOUDFRONT-scoped WAF Web ACL (us-east-1) for the distribution. */
  webAclArn?: string;
}

/**
 * Deploys REDCap on ECS Express Mode (`AWS::ECS::ExpressGatewayService`) fronted
 * by a CloudFront distribution via a VPC Origin.
 */
export class EcsExpress extends Construct {
  public readonly service: CfnExpressGatewayService;
  public readonly executionRole: aws_iam.Role;
  public readonly taskRole: aws_iam.Role;
  public readonly infrastructureRole: aws_iam.Role;
  public readonly logGroup: LogGroup;
  public readonly distribution: Distribution;
  /** Public CloudFront domain name. */
  public readonly url: string;
  /** ARN of the managed load balancer. */
  public readonly loadBalancerArn: string;
  /** Custom domain name, when configured. */
  public readonly customUrl?: string;

  constructor(scope: Stack, id: string, props: EcsExpressProps) {
    super(scope, id);

    const prefix = `${props.app.stage}-${props.app.name}-express`;
    const servicePort = props.servicePort ?? 8080;

    this.logGroup = new LogGroup(this, 'log-group', {
      retention: props.logRetention ?? RetentionDays.TWO_YEARS,
      removalPolicy: props.app.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Execution role: pull image from ECR, write logs.
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

    // Task role: application identity; secret/DB grants added by the caller.
    this.taskRole = new aws_iam.Role(this, 'task-role', {
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'REDCap Express task role',
    });

    // Infrastructure role: lets ECS manage the ALB, SGs, TLS and auto scaling.
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
        subnets: props.network.vpc.selectSubnets({
          subnetType: props.network.subnetType ?? SubnetType.PRIVATE_WITH_EGRESS,
        }).subnetIds,
      },
      scalingTarget: props.scaling,
    });

    this.service.node.addDependency(this.infrastructureRole);
    this.service.node.addDependency(this.executionRole);
    this.service.node.addDependency(this.taskRole);

    this.loadBalancerArn = this.service.attrIngressPathLoadBalancerArn;

    // Import the ECS-managed internal ALB so it can back a CloudFront VPC Origin.
    const managedAlb = ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(
      this,
      'managed-alb',
      {
        loadBalancerArn: this.service.attrIngressPathLoadBalancerArn,
        securityGroupId: this.service.attrIngressPathLoadBalancerSecurityGroupId,
        loadBalancerDnsName: this.service.attrEndpoint,
      },
    );

    const domainName =
      props.domain && props.publicHostedZone
        ? props.subdomain
          ? `${props.subdomain}.${props.domain}`
          : props.domain
        : undefined;

    const useCustomDomain = Boolean(domainName && props.certificate);

    // CloudFront fronts the internal ALB via a VPC Origin. The managed ALB
    // routes by host header matching its own `*.ecs.<region>.on.aws` endpoint,
    // so ALL_VIEWER_EXCEPT_HOST_HEADER + origin `domainName` send that endpoint
    // as Host (the viewer Host would 404 at the ALB).
    this.distribution = new Distribution(this, 'distribution', {
      comment: `${prefix} REDCap CloudFront`,
      defaultBehavior: {
        origin: VpcOrigin.withApplicationLoadBalancer(managedAlb, {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          httpsPort: 443,
          readTimeout: Duration.seconds(120),
          domainName: this.service.attrEndpoint,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      ...(useCustomDomain
        ? { domainNames: [domainName as string], certificate: props.certificate }
        : {}),
      ...(props.webAclArn ? { webAclId: props.webAclArn } : {}),
    });

    this.distribution.node.addDependency(this.service);

    this.url = this.distribution.distributionDomainName;

    if (useCustomDomain && props.publicHostedZone) {
      new ARecord(this, 'cloudfront-a-record', {
        zone: props.publicHostedZone,
        recordName: domainName,
        deleteExisting: true,
        comment: 'To REDCap ECS Express CloudFront',
        target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      });
      this.customUrl = domainName;
    }
  }
}
