/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

/**
 * Vendored L1 construct for `AWS::ECS::ExpressGatewayService`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The typed `aws-cdk-lib/aws-ecs.CfnExpressGatewayService` L1 only ships in
 * aws-cdk-lib >= 2.261.0. This project is pinned to aws-cdk-lib 2.224.0 (via
 * SST v2), which cannot be upgraded without a large, slow migration.
 *
 * A CDK L1 construct is just a thin, code-generated wrapper around
 * `cdk.CfnResource` that:
 *   1. accepts camelCase props,
 *   2. maps them to the CloudFormation PascalCase property shape, and
 *   3. exposes `attr*` accessors over `getAtt(...)`.
 *
 * The deployed CloudFormation template is identical regardless of the local
 * aws-cdk-lib version — CloudFormation validates `AWS::ECS::ExpressGatewayService`
 * server-side. So we reproduce (1)-(3) here on top of `CfnResource`, giving us
 * the same ergonomics and compile-time typing without upgrading CDK.
 *
 * The interfaces below are 1:1 with the CDK-generated types. They are derived
 * from the authoritative CloudFormation resource + property-type specifications:
 *   - AWS::ECS::ExpressGatewayService
 *   - AWS::ECS::ExpressGatewayService ExpressGatewayContainer
 *   - AWS::ECS::ExpressGatewayService ExpressGatewayServiceNetworkConfiguration
 *   - AWS::ECS::ExpressGatewayService ExpressGatewayScalingTarget
 *   - AWS::ECS::ExpressGatewayService ExpressGatewayServiceAwsLogsConfiguration
 *   - AWS::ECS::ExpressGatewayService ExpressGatewayRepositoryCredentials
 *
 * What we intentionally DO NOT reproduce from the generated file: the
 * `cfn_parse` round-trip (`fromCloudFormation`), property validators, and the
 * 2.26x-era `ITaggableV2`/mixin machinery. None of those exist on 2.224 and
 * none are needed to synthesize the resource.
 */

import { CfnResource, type CfnTag, type IResolvable } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/**
 * The log configuration for the primary container.
 */
export interface ExpressGatewayServiceAwsLogsConfigurationProperty {
  /** The name of the CloudWatch log group to send container logs to. */
  readonly logGroup?: string;
  /** The prefix applied to the log stream names. */
  readonly logStreamPrefix?: string;
}

/**
 * Repository credentials for private registry authentication.
 */
export interface ExpressGatewayRepositoryCredentialsProperty {
  /** The ARN of the Secrets Manager secret that holds the registry credentials. */
  readonly credentialsParameter: string;
}

/**
 * An environment variable passed to the container.
 */
export interface KeyValuePairProperty {
  /** The name of the environment variable. */
  readonly name?: string;
  /** The value of the environment variable. */
  readonly value?: string;
}

/**
 * A secret injected into the container as an environment variable.
 */
export interface SecretProperty {
  /** The name of the environment variable to set. */
  readonly name: string;
  /**
   * The secret to expose. For Secrets Manager this is the secret ARN
   * (optionally with a JSON key), for SSM this is the parameter ARN/name.
   */
  readonly valueFrom: string;
}

/**
 * The primary container configuration for an Express service. This container
 * receives traffic from the managed Application Load Balancer.
 */
export interface ExpressGatewayContainerProperty {
  /**
   * The image used to start the container. This is the only required field.
   * e.g. `repository-url/image:tag` or `repository-url/image@digest`.
   */
  readonly image: string;
  /** The log configuration for the container. */
  readonly awsLogsConfiguration?: IResolvable | ExpressGatewayServiceAwsLogsConfigurationProperty;
  /** The command passed to the container. */
  readonly command?: string[];
  /** The port the container listens on for load balancer traffic. Default: 80. */
  readonly containerPort?: number;
  /** The environment variables to pass to the container. */
  readonly environment?: Array<IResolvable | KeyValuePairProperty> | IResolvable;
  /** Repository credentials for private registry authentication. */
  readonly repositoryCredentials?: IResolvable | ExpressGatewayRepositoryCredentialsProperty;
  /** The secrets to pass to the container. */
  readonly secrets?: Array<IResolvable | SecretProperty> | IResolvable;
}

/**
 * The network configuration for an Express service.
 */
export interface ExpressGatewayServiceNetworkConfigurationProperty {
  /** The IDs of the security groups associated with the Express service. */
  readonly securityGroups?: string[];
  /** The IDs of the subnets associated with the Express service. */
  readonly subnets?: string[];
}

/**
 * The metric used for Express service auto-scaling decisions.
 */
export type ExpressGatewayAutoScalingMetric =
  | 'AVERAGE_CPU'
  | 'AVERAGE_MEMORY'
  | 'REQUEST_COUNT_PER_TARGET';

/**
 * The auto-scaling configuration for an Express service.
 */
export interface ExpressGatewayScalingTargetProperty {
  /** The metric used for auto-scaling. Default for Express is `CPUUtilization`. */
  readonly autoScalingMetric?: ExpressGatewayAutoScalingMetric | string;
  /** The target value for the auto-scaling metric. Default: 60. */
  readonly autoScalingTargetValue?: number;
  /** The maximum number of tasks to run. */
  readonly maxTaskCount?: number;
  /** The minimum number of tasks to run. */
  readonly minTaskCount?: number;
}

/**
 * Properties for defining a `CfnExpressGatewayService`.
 */
export interface CfnExpressGatewayServiceProps {
  /**
   * The ARN of the infrastructure role that lets Amazon ECS manage AWS
   * resources (ALB, target groups, security groups, SSL certs, auto scaling)
   * for the Express service on your behalf. This is the only required prop.
   */
  readonly infrastructureRoleArn: string;
  /** The primary container configuration for this service revision. */
  readonly primaryContainer?: IResolvable | ExpressGatewayContainerProperty;
  /** The ARN of the task execution role for the service revision. */
  readonly executionRoleArn?: string;
  /** The ARN of the task role for the service revision. */
  readonly taskRoleArn?: string;
  /** The short name or full ARN of the cluster that hosts the Express service. */
  readonly cluster?: string;
  /** The CPU allocation for tasks in this service revision. Default: "256". */
  readonly cpu?: string;
  /** The memory allocation for tasks in this service revision. Default: "512". */
  readonly memory?: string;
  /** The health check path for this service revision. Default: "HTTP:80/ping". */
  readonly healthCheckPath?: string;
  /** The network configuration for tasks in this service revision. */
  readonly networkConfiguration?: IResolvable | ExpressGatewayServiceNetworkConfigurationProperty;
  /** The auto-scaling configuration for this service revision. */
  readonly scalingTarget?: IResolvable | ExpressGatewayScalingTargetProperty;
  /** The name of the Express service. */
  readonly serviceName?: string;
  /** The metadata applied to the Express service. */
  readonly tags?: CfnTag[];
}

// ---------------------------------------------------------------------------
// camelCase -> CloudFormation PascalCase serialization.
//
// These mirror the generated `*PropertyToCloudFormation` mappers. They are
// pure functions with no dependency on CDK internals. `undefined` inputs are
// passed straight through so optional properties are omitted from the template.
// ---------------------------------------------------------------------------

function isResolvable(x: unknown): x is IResolvable {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { resolve?: unknown }).resolve === 'function'
  );
}

function awsLogsConfigurationToCfn(
  prop?: IResolvable | ExpressGatewayServiceAwsLogsConfigurationProperty,
): unknown {
  if (prop == null || isResolvable(prop)) return prop;
  return {
    LogGroup: prop.logGroup,
    LogStreamPrefix: prop.logStreamPrefix,
  };
}

function repositoryCredentialsToCfn(
  prop?: IResolvable | ExpressGatewayRepositoryCredentialsProperty,
): unknown {
  if (prop == null || isResolvable(prop)) return prop;
  return { CredentialsParameter: prop.credentialsParameter };
}

function keyValuePairToCfn(prop: IResolvable | KeyValuePairProperty): unknown {
  if (isResolvable(prop)) return prop;
  return { Name: prop.name, Value: prop.value };
}

function secretToCfn(prop: IResolvable | SecretProperty): unknown {
  if (isResolvable(prop)) return prop;
  return { Name: prop.name, ValueFrom: prop.valueFrom };
}

function primaryContainerToCfn(prop?: IResolvable | ExpressGatewayContainerProperty): unknown {
  if (prop == null || isResolvable(prop)) return prop;
  return {
    Image: prop.image,
    AwsLogsConfiguration: awsLogsConfigurationToCfn(prop.awsLogsConfiguration),
    Command: prop.command,
    ContainerPort: prop.containerPort,
    Environment: isResolvable(prop.environment)
      ? prop.environment
      : prop.environment?.map(keyValuePairToCfn),
    RepositoryCredentials: repositoryCredentialsToCfn(prop.repositoryCredentials),
    Secrets: isResolvable(prop.secrets) ? prop.secrets : prop.secrets?.map(secretToCfn),
  };
}

function networkConfigurationToCfn(
  prop?: IResolvable | ExpressGatewayServiceNetworkConfigurationProperty,
): unknown {
  if (prop == null || isResolvable(prop)) return prop;
  return {
    SecurityGroups: prop.securityGroups,
    Subnets: prop.subnets,
  };
}

function scalingTargetToCfn(prop?: IResolvable | ExpressGatewayScalingTargetProperty): unknown {
  if (prop == null || isResolvable(prop)) return prop;
  return {
    AutoScalingMetric: prop.autoScalingMetric,
    AutoScalingTargetValue: prop.autoScalingTargetValue,
    MaxTaskCount: prop.maxTaskCount,
    MinTaskCount: prop.minTaskCount,
  };
}

/**
 * An L1 CloudFormation construct for `AWS::ECS::ExpressGatewayService`.
 *
 * Behaviourally equivalent to the generated
 * `aws-cdk-lib/aws-ecs.CfnExpressGatewayService`, but implemented on
 * `CfnResource` so it compiles against aws-cdk-lib 2.224.0.
 */
export class CfnExpressGatewayService extends CfnResource {
  /** The CloudFormation resource type name for this resource class. */
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::ECS::ExpressGatewayService';

  /** The Endpoint of the Express service. */
  public readonly attrEndpoint: string;
  /** The ARN that identifies the Express service. */
  public readonly attrServiceArn: string;
  /** The Unix timestamp for when the Express service was created. */
  public readonly attrCreatedAt: string;
  /** The Unix timestamp for when the Express service was last updated. */
  public readonly attrUpdatedAt: string;

  /** The ARN of the Load Balancer associated with the Express service. */
  public readonly attrIngressPathLoadBalancerArn: string;
  /** The ARN of the Load Balancer listener associated with the Express service. */
  public readonly attrIngressPathListenerArn: string;
  /** The Certificate ARN associated with the Express service. */
  public readonly attrIngressPathCertificateArn: string;

  constructor(scope: Construct, id: string, props: CfnExpressGatewayServiceProps) {
    super(scope, id, {
      type: CfnExpressGatewayService.CFN_RESOURCE_TYPE_NAME,
      properties: {
        InfrastructureRoleArn: props.infrastructureRoleArn,
        PrimaryContainer: primaryContainerToCfn(props.primaryContainer),
        ExecutionRoleArn: props.executionRoleArn,
        TaskRoleArn: props.taskRoleArn,
        Cluster: props.cluster,
        Cpu: props.cpu,
        Memory: props.memory,
        HealthCheckPath: props.healthCheckPath,
        NetworkConfiguration: networkConfigurationToCfn(props.networkConfiguration),
        ScalingTarget: scalingTargetToCfn(props.scalingTarget),
        ServiceName: props.serviceName,
        Tags: props.tags,
      },
    });

    this.attrEndpoint = this.getAtt('Endpoint').toString();
    this.attrServiceArn = this.getAtt('ServiceArn').toString();
    this.attrCreatedAt = this.getAtt('CreatedAt').toString();
    this.attrUpdatedAt = this.getAtt('UpdatedAt').toString();

    this.attrIngressPathLoadBalancerArn = this.getAtt(
      'ECSManagedResourceArns.IngressPath.LoadBalancerArn',
    ).toString();
    this.attrIngressPathListenerArn = this.getAtt(
      'ECSManagedResourceArns.IngressPath.ListenerArn',
    ).toString();
    this.attrIngressPathCertificateArn = this.getAtt(
      'ECSManagedResourceArns.IngressPath.CertificateArn',
    ).toString();
  }
}
