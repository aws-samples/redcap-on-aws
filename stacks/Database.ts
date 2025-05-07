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
import { RedCapConfig } from '../prototyping';

export function Database({ stack, app }: StackContext) {
  const { networkVpc } = use(Network);

  const dbAllowedSg = new aws_ec2.SecurityGroup(stack, `${app.stage}-${app.name}-apprunner-db-sg`, {
    vpc: networkVpc.vpc,
    allowAllOutbound: true,
  });

  const dbConfig = get(stage, [stack.stage, 'db']) as RedCapConfig['db'];

  if (!dbConfig)
    console.warn(
      'WARNING: db config is absent in stages.ts, using Amazon Aurora defaults settings',
    );

  const readers = dbConfig?.dbReaders ?? undefined;
  const scaling = dbConfig?.scaling ?? {
    maxCapacityAcu: 2,
    minCapacityAcu: 0.5,
  };
  const maxAllowedPacket = dbConfig?.maxAllowedPacket ?? '4194304';
  const snapshotIdentifier = dbConfig?.dbSnapshotId ?? undefined;
  const logRetention = get(stage, [stack.stage, 'generalLogRetention'], undefined);

  const auroraClusterV2 = new AuroraServerlessV2(stack, 'RDSV2', {
    engine: 'mysql8.0',
    defaultDatabaseName: 'redcap',
    dbUserName: 'dbadmin',
    vpc: networkVpc.vpc,
    scaling: {
      minCapacityAcu: scaling.minCapacityAcu,
      maxCapacityAcu: scaling.maxCapacityAcu,
    },
    enabledProxy: false,
    logRetention,
    rotateSecretAfterDays: Duration.days(120),
    parameterGroupParameters: {
      max_allowed_packet: maxAllowedPacket,
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
