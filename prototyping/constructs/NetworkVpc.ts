/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { RemovalPolicy, aws_ec2 } from 'aws-cdk-lib';
import {
  FlowLogDestination,
  FlowLogTrafficType,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  SubnetType,
  Vpc,
  VpcProps,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { isEmpty } from 'lodash';

export class NetworkVpc extends Construct {
  public readonly vpc: Vpc;
  public readonly endpoints: { [x: string]: aws_ec2.InterfaceVpcEndpoint } = {};
  public readonly eipAllocationForNat: string[] | undefined;

  constructor(
    scope: Construct,
    id: string,
    props: {
      maxAzs: number;
      cidr: string;
      cidrMask: number;
      publicSubnet?: boolean;
      isolatedSubnet?: boolean;
      natSubnet?: boolean;
      vpcEndpoints?: Array<InterfaceVpcEndpointAwsService>;
      vpcEndpointS3?: boolean;
      vpcEndpointDynamoDb?: boolean;
      logRetention?: Lowercase<keyof typeof RetentionDays>;
    },
  ) {
    super(scope, id);

    const logRetention = props.logRetention || 'TWO_MONTHS';

    // Vpc logging
    const cwLogs = new LogGroup(this, 'vpc-logs', {
      logGroupName: `/${id}/vpc-logs/`,
      retention: RetentionDays[logRetention.toUpperCase() as keyof typeof RetentionDays],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // configure subnets following props value
    const subnetConfiguration: VpcProps['subnetConfiguration'] = [];

    if (props.publicSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: 'public-subnet',
        subnetType: SubnetType.PUBLIC,
      });
    }

    if (props.natSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: 'private-subnet',
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      });
    }

    if (props.isolatedSubnet) {
      subnetConfiguration.push({
        cidrMask: props.cidrMask,
        name: 'isolated-subnet',
        subnetType: SubnetType.PRIVATE_ISOLATED,
      });
    }

    if (isEmpty(subnetConfiguration)) {
      throw new Error('No subnet configuration enabled');
    }

    // Create VPC - Private and public subnets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vpcTempProps: any = {
      ipAddresses: IpAddresses.cidr(props.cidr),
      vpcName: `${id}-vpc`,
      subnetConfiguration,
      maxAzs: props.maxAzs,
      flowLogs: {
        s3: {
          destination: FlowLogDestination.toCloudWatchLogs(cwLogs),
          trafficType: FlowLogTrafficType.ALL,
        },
      },
    };

    // setup NAT Gateway
    if (props.natSubnet) {
      this.eipAllocationForNat = [];
      const eipAllocationIds: string[] = [];

      for (let i = 0; i < props.maxAzs; i++) {
        const eip = new aws_ec2.CfnEIP(this, `${id}-nat-eip${i}`, {});
        this.eipAllocationForNat.push(eip.attrPublicIp);
        eipAllocationIds.push(eip.attrAllocationId);
      }

      vpcTempProps.natGatewayProvider = aws_ec2.NatProvider.gateway({
        eipAllocationIds,
      });
    }

    const vpcProps: aws_ec2.VpcProps = vpcTempProps;

    this.vpc = new Vpc(this, 'vpc', vpcProps);

    // Add vpc endpoints
    const interfaceEndpointOptions = {
      vpc: this.vpc,
      privateDnsEnable: true,
    };

    // create VPC endpoints
    props.vpcEndpoints?.forEach((vpcEndpoint) => {
      this.endpoints[`${vpcEndpoint.shortName}`] = this.vpc.addInterfaceEndpoint(
        `${vpcEndpoint.shortName}-vep`,
        {
          service: vpcEndpoint,
          ...interfaceEndpointOptions,
        },
      );
    });

    // Vpc endpoints for s3 and dynamodb
    if (props.vpcEndpointDynamoDb)
      this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
        service: aws_ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      });
    if (props.vpcEndpointS3) {
      this.vpc.addGatewayEndpoint('S3Endpoint', {
        service: aws_ec2.GatewayVpcEndpointAwsService.S3,
      });
    }
  }
}
