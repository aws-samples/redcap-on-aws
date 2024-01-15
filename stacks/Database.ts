/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Duration, aws_ec2 } from 'aws-cdk-lib';
import {
  AuroraMysqlEngineVersion,
  DatabaseClusterEngine,
  ParameterGroup,
} from 'aws-cdk-lib/aws-rds';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { RDS, StackContext, use } from 'sst/constructs';
import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { AuroraServerlessV2 } from '../prototyping/constructs/AuroraServerlessV2';
import { Network } from './Network';

export function Database({ stack, app }: StackContext) {
  const { networkVpc } = use(Network);
  let auroraClusterV1;
  let auroraClusterV2;
  let dbSecret: ISecret | undefined;
  let resourceIdV2: string | undefined;

  const dbAllowedSg = new aws_ec2.SecurityGroup(stack, `${app.stage}-${app.name}-apprunner-db-sg`, {
    vpc: networkVpc.vpc,
    allowAllOutbound: true,
  });

  // when mode is dev, create Aurora Serverless v1, when mode is prod, create Aurora Serverless v2
  if (app.mode === 'dev') {
    const rdsV1ParameterGroup = new ParameterGroup(stack, 'RDSV1PG', {
      engine: DatabaseClusterEngine.auroraMysql({
        // Use same version as sst: https://github.com/serverless-stack/sst/blob/master/packages/sst/src/constructs/RDS.ts#L417
        version: AuroraMysqlEngineVersion.VER_2_07_1,
      }),
      parameters: {
        max_allowed_packet: '4194304',
      },
    });
    auroraClusterV1 = new RDS(stack, 'RDSV1', {
      engine: 'mysql5.7',
      defaultDatabaseName: 'redcap',
      scaling: {
        autoPause: false,
        minCapacity: 'ACU_1',
        maxCapacity: 'ACU_2',
      },
      cdk: {
        cluster: {
          credentials: {
            username: 'dbadmin',
          },
          deletionProtection: false,
          vpc: networkVpc.vpc,
          vpcSubnets: {
            subnets: networkVpc.vpc.isolatedSubnets,
          },
        },
      },
    });

    dbSecret = auroraClusterV1.cdk.cluster.secret;

    auroraClusterV1.cdk.cluster.addRotationSingleUser({
      automaticallyAfter: Duration.days(120),
    });

    auroraClusterV1?.cdk.cluster.connections.allowDefaultPortFrom(dbAllowedSg);

    Suppressions.SSTRDSSuppressions(auroraClusterV1);
  } else {
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
      afterDaysDuration: Duration.days(120),
      parameterGroupParameters: {
        max_allowed_packet: '4194304',
      },
    });
    dbSecret = auroraClusterV2.aurora.secret;
    resourceIdV2 = auroraClusterV2.resourceId;

    auroraClusterV2?.aurora.connections.allowDefaultPortFrom(dbAllowedSg);
    Suppressions.RDSV2Suppressions(auroraClusterV2);
  }

  const readReplicaHostname = auroraClusterV2?.aurora.clusterReadEndpoint.hostname;
  return { dbSecret, dbAllowedSg, readReplicaHostname, resourceIdV2 };
}
