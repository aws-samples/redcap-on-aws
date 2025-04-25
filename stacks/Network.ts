/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import { StackContext } from 'sst/constructs';
import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { NetworkVpc } from '../prototyping/constructs/NetworkVpc';
import { get } from 'lodash';

import * as stage from '../stages';

export function Network({ stack, app }: StackContext) {
  const iface = InterfaceVpcEndpointAwsService;
  const networkVpc = new NetworkVpc(stack, `${app.stage}-${app.name}-vpc`, {
    cidr: '10.0.0.0/16',
    cidrMask: 24,
    publicSubnet: true,
    isolatedSubnet: true,
    natSubnet: true,
    vpcEndpoints: [iface.SECRETS_MANAGER],
    vpcEndpointS3: true,
    maxAzs: 2,
    logRetention: get(stage, [stack.stage, 'generalLogRetention'], undefined),
  });

  networkVpc.vpc.publicSubnets.forEach(publicSubnet => stack.exportValue(publicSubnet.subnetId));
  Suppressions.NetworkVpcSuppressions(networkVpc);
  return { networkVpc };
}
