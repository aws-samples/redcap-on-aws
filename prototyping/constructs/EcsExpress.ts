/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
   * Custom domain served by the CloudFront distribution. When set together with
   * `publicHostedZone` and `certificate` (which must be in us-east-1), CloudFront
   * uses the domain and a Route53 alias record is created.
   */
  domain?: string;
  subdomain?: string;
  publicHostedZone?: IPublicHostedZone;
  /**
   * ACM certificate for the custom domain. MUST be issued in us-east-1 because
   * it is attached to CloudFront. If omitted, CloudFront serves its default
   * `*.cloudfront.net` domain.
   */
  certificate?: ICertificate;
  /**
   * ARN of the CLOUDFRONT-scoped WAF Web ACL (must be in us-east-1) to attach
   * to the CloudFront distribution.
   */
  webAclArn?: string;
}

/**
 * Deploys REDCap on ECS Express Mode (`AWS::ECS::ExpressGatewayService`) fronted
 * by a CloudFront distribution using a VPC Origin.
 *
 * Express Mode is a managed abstraction: Amazon ECS provisions and owns the
 * Application Load Balancer, target groups, listener, service security groups,
 * SSL certificate and auto-scaling policies. We provide the container config,
 * three IAM roles, and the VPC/subnet/security-group placement.
 *
 * The tasks and the ECS-managed ALB run in PRIVATE subnets (internal ALB, no
 * public IPs). Public internet access is provided by a CloudFront distribution
 * whose origin is a VPC Origin pointing at the internal ALB. This keeps the
 * REDCap containers private while still exposing a public HTTPS endpoint, and
 * lets WAF and the custom domain attach to CloudFront.
 *
 * DB connectivity is achieved by attaching the shared `dbAllowedSg` (which
 * Aurora already trusts) to the service tasks — the same pattern as App Runner.
 */
export class EcsExpress extends Construct {
  public readonly service: CfnExpressGatewayService;
  public readonly executionRole: aws_iam.Role;
  public readonly taskRole: aws_iam.Role;
  public readonly infrastructureRole: aws_iam.Role;
  public readonly logGroup: LogGroup;
  public readonly distribution: Distribution;
  /** The public CloudFront domain name of the distribution. */
  public readonly url: string;
  /** The ARN of the managed load balancer. */
  public readonly loadBalancerArn: string;
  /** The ARN of the CloudFront distribution, for WAF association. */
  public readonly distributionArn: string;
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
        // PRIVATE_WITH_EGRESS keeps the managed ALB INTERNAL and the tasks
        // private (no public IPs). Public access is via CloudFront (below).
        // NOTE: subnet type is immutable on an Express service - changing it
        // requires REPLACING the service (a CloudFormation update is rejected).
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

    this.loadBalancerArn = this.service.attrIngressPathLoadBalancerArn;

    // Import the ECS-managed internal ALB by its attributes so it can be used
    // as a CloudFront VPC Origin. The ALB DNS name and canonical hosted zone
    // are exposed by the Express service; the security group is AWS-managed.
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

    // CloudFront distribution fronting the internal ALB via a VPC Origin.
    //
    // The Express-managed ALB routes by host-header matching its own
    // `*.ecs.<region>.on.aws` endpoint. So we must send that endpoint as the
    // Host header to the origin, NOT the viewer's CloudFront/custom domain
    // (which would 404 at the ALB). We achieve this by:
    //   - setting the VPC origin `domainName` to the Express endpoint, and
    //   - using ALL_VIEWER_EXCEPT_HOST_HEADER so CloudFront sends the origin
    //     domain (the Express endpoint) as Host instead of the viewer Host.
    this.distribution = new Distribution(this, 'distribution', {
      comment: `${prefix} REDCap CloudFront`,
      defaultBehavior: {
        origin: VpcOrigin.withApplicationLoadBalancer(managedAlb, {
          protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
          httpsPort: 443,
          readTimeout: Duration.seconds(60),
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

    this.distributionArn = `arn:aws:cloudfront::${scope.account}:distribution/${this.distribution.distributionId}`;
    this.url = this.distribution.distributionDomainName;

    // Route53 alias for the custom domain -> CloudFront.
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
