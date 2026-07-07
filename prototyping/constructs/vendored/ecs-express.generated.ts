/*
 *  Copyright 2026 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

/**
 * Vendored L1 construct for `AWS::ECS::ExpressGatewayService`.
 *
 * The typed `CfnExpressGatewayService` only ships in aws-cdk-lib >= 2.261.0;
 * this project is pinned to 2.224.0 (SST v2).
 */

import { CfnResource, type CfnTag, Fn, type IResolvable } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface ExpressGatewayServiceAwsLogsConfigurationProperty {
  readonly logGroup?: string;
  readonly logStreamPrefix?: string;
}

export interface ExpressGatewayRepositoryCredentialsProperty {
  readonly credentialsParameter: string;
}

export interface KeyValuePairProperty {
  readonly name?: string;
  readonly value?: string;
}

export interface SecretProperty {
  readonly name: string;
  /** Secrets Manager secret ARN (optionally with JSON key) or SSM parameter ARN/name. */
  readonly valueFrom: string;
}

export interface ExpressGatewayContainerProperty {
  /** The only required field; `repository-url/image:tag` or `...@digest`. */
  readonly image: string;
  readonly awsLogsConfiguration?: IResolvable | ExpressGatewayServiceAwsLogsConfigurationProperty;
  readonly command?: string[];
  /** Default: 80. */
  readonly containerPort?: number;
  readonly environment?: Array<IResolvable | KeyValuePairProperty> | IResolvable;
  readonly repositoryCredentials?: IResolvable | ExpressGatewayRepositoryCredentialsProperty;
  readonly secrets?: Array<IResolvable | SecretProperty> | IResolvable;
}

export interface ExpressGatewayServiceNetworkConfigurationProperty {
  readonly securityGroups?: string[];
  readonly subnets?: string[];
}

export type ExpressGatewayAutoScalingMetric =
  | 'AVERAGE_CPU'
  | 'AVERAGE_MEMORY'
  | 'REQUEST_COUNT_PER_TARGET';

export interface ExpressGatewayScalingTargetProperty {
  readonly autoScalingMetric?: ExpressGatewayAutoScalingMetric | string;
  /** Default: 60. */
  readonly autoScalingTargetValue?: number;
  readonly maxTaskCount?: number;
  readonly minTaskCount?: number;
}

export interface CfnExpressGatewayServiceProps {
  /** The only required prop; lets ECS manage the ALB, SGs, certs, and scaling. */
  readonly infrastructureRoleArn: string;
  readonly primaryContainer?: IResolvable | ExpressGatewayContainerProperty;
  readonly executionRoleArn?: string;
  readonly taskRoleArn?: string;
  readonly cluster?: string;
  /** Default: "256". */
  readonly cpu?: string;
  /** Default: "512". */
  readonly memory?: string;
  /** Default: "HTTP:80/ping". */
  readonly healthCheckPath?: string;
  readonly networkConfiguration?: IResolvable | ExpressGatewayServiceNetworkConfigurationProperty;
  readonly scalingTarget?: IResolvable | ExpressGatewayScalingTargetProperty;
  readonly serviceName?: string;
  readonly tags?: CfnTag[];
}

// camelCase -> CloudFormation PascalCase serialization, mirroring the generated
// `*PropertyToCloudFormation` mappers. `undefined` inputs pass through so
// optional properties are omitted from the template.

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
 * L1 construct for `AWS::ECS::ExpressGatewayService`, implemented on
 * `CfnResource` so it compiles against aws-cdk-lib 2.224.0.
 */
export class CfnExpressGatewayService extends CfnResource {
  public static readonly CFN_RESOURCE_TYPE_NAME = 'AWS::ECS::ExpressGatewayService';

  public readonly attrEndpoint: string;
  public readonly attrServiceArn: string;
  public readonly attrCreatedAt: string;
  public readonly attrUpdatedAt: string;

  public readonly attrIngressPathLoadBalancerArn: string;
  public readonly attrIngressPathListenerArn: string;
  public readonly attrIngressPathCertificateArn: string;
  public readonly attrIngressPathLoadBalancerSecurityGroupId: string;

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
    // The security groups attr is a list; take the first for ALB import.
    this.attrIngressPathLoadBalancerSecurityGroupId = Fn.select(
      0,
      this.getAtt('ECSManagedResourceArns.IngressPath.LoadBalancerSecurityGroups').toStringList(),
    );
  }
}
