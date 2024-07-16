/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Duration, aws_ec2 } from 'aws-cdk-lib';
import { StackContext, use } from 'sst/constructs';
import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { AuroraServerlessV2 } from '../prototyping/constructs/AuroraServerlessV2';
import { Network } from './Network';
import { get } from 'lodash';

import * as stage from '../stages';

export function Database({ stack, app }: StackContext) {
  const { networkVpc } = use(Network);

  let auroraClusterV2;

  const dbAllowedSg = new aws_ec2.SecurityGroup(stack, `${app.stage}-${app.name}-apprunner-db-sg`, {
    vpc: networkVpc.vpc,
    allowAllOutbound: true,
  });

  const readers = get(stage, [stack.stage, 'dbReaders'], undefined);
  const snapshotIdentifier = get(stage, [stack.stage, 'dbSnapshotId'], undefined);
  const generalLogRetention = get(stage, [stack.stage, 'generalLogRetention'], undefined);

  auroraClusterV2 = new AuroraServerlessV2(stack, 'RDSV2', {
    engine: 'mysql8.0',
    defaultDatabaseName: 'redcap',
    dbUserName: 'dbadmin',
    vpc: networkVpc.vpc,
    scaling: {
      minCapacityAcu: 0.5,
      maxCapacityAcu: 8,
    },
    enabledProxy: false,
    logRetention: generalLogRetention,
    rotateSecretAfterDays: Duration.days(120),
    parameterGroupParameters: {
      max_allowed_packet: '4194304',
    },
    readers,
    snapshotIdentifier,
  });

  stack.exportValue(auroraClusterV2.aurora.clusterResourceIdentifier);
  stack.exportValue(auroraClusterV2.aurora.connections.securityGroups[0].securityGroupId);

  auroraClusterV2?.aurora.connections.allowDefaultPortFrom(dbAllowedSg);
  Suppressions.RDSV2Suppressions(auroraClusterV2);

  return { dbAllowedSg, auroraClusterV2 };
}
