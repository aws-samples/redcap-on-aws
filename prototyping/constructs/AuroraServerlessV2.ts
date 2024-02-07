/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { isEmpty } from 'lodash';

import { Duration, RemovalPolicy, Stack, aws_ec2, aws_iam, aws_logs, aws_rds } from 'aws-cdk-lib';
import { IVpc } from 'aws-cdk-lib/aws-ec2';

import { Construct } from 'constructs';
import { Config } from 'sst/constructs';

type ScalingConfiguration = {
  minCapacityAcu?: number;
  maxCapacityAcu?: number;
};

type AuroraProps = {
  engine: RdsV2Engines['engine'];
  vpc: aws_ec2.IVpc;
  scaling: ScalingConfiguration;
  migrations?: string;
  dbUserName?: string;
  enabledProxy?: boolean;
  defaultDatabaseName?: string | undefined;
  backupRetentionInDays?: number;
  removalPolicy?: RemovalPolicy;
  migrateOneDown?: boolean;
  parameterGroupParameters?: aws_rds.ParameterGroupProps['parameters'];
  disableKeyRotation?: boolean;
  rotateSecretAfterDays?: Duration;
};

type RdsV2Engines = {
  engine: 'mysql8.0' | 'postgresql13.10' | 'postgresql14.7' | 'postgresql15.2';
};

/**
 * @summary Constructs a new instance of the AuroraServerlessV2 class.
 * @param {cdk.App} scope - represents the scope for all the resources.
 * @param {string} id - this is a a scope-unique id.
 * @param {AuroraProps} props - user provided props for the construct
 */
export class AuroraServerlessV2 extends Construct {
  public readonly aurora: aws_rds.DatabaseCluster;
  public readonly proxyRole: aws_iam.Role | undefined;
  public readonly proxy: aws_rds.DatabaseProxy | undefined;
  public readonly databaseCredentials: aws_rds.Credentials;
  private props: AuroraProps | undefined;
  private parameterGroup: aws_rds.ParameterGroup | undefined;

  vpc: IVpc;
  RDS_V2_SECRET_ARN!: Config.Parameter;
  RDS_PROXY_ENDPOINT!: Config.Parameter;

  constructor(scope: Construct, id: string, props: AuroraProps) {
    super(scope, id);

    this.vpc = props.vpc;
    this.props = props;

    // Check whether isolated subnets which you chose or not
    if (isEmpty(props.vpc.isolatedSubnets)) {
      throw new Error('You should speficy the isolated subnets in subnets');
    }

    // Auto-generated secret
    this.databaseCredentials = aws_rds.Credentials.fromGeneratedSecret(
      props.dbUserName || 'dbadmin',
      {},
    );

    // Create parameter group if there's no parameter group in props
    if (props.parameterGroupParameters) {
      this.parameterGroup = new aws_rds.ParameterGroup(this, 'AuroraV2ParameterGroup', {
        engine: this.getEngine(props.engine),
        parameters: props.parameterGroupParameters,
      });
    }

    // Create Aurora Cluster
    this.aurora = new aws_rds.DatabaseCluster(this, 'ServerlessAuroraDatabase', {
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.vpc.isolatedSubnets,
      },
      engine: this.getEngine(props.engine),
      cloudwatchLogsExports:
        props.engine === 'mysql8.0' ? ['error', 'general', 'slowquery', 'audit'] : ['postgresql'], // Export all available MySQL-based logs
      defaultDatabaseName: props.defaultDatabaseName || 'sampleDB',
      cloudwatchLogsRetention: aws_logs.RetentionDays.ONE_YEAR,
      iamAuthentication: true,
      writer: aws_rds.ClusterInstance.serverlessV2('WriterClusterInstance', {
        autoMinorVersionUpgrade: true,
        publiclyAccessible: false,
        caCertificate: aws_rds.CaCertificate.RDS_CA_RDS2048_G1,
      }),
      readers: [
        aws_rds.ClusterInstance.serverlessV2('ReaderClusterInstance1', {
          autoMinorVersionUpgrade: true,
          publiclyAccessible: false,
          caCertificate: aws_rds.CaCertificate.RDS_CA_RDS2048_G1,
        }),
      ],
      serverlessV2MinCapacity: props.scaling.minCapacityAcu || 0.5,
      serverlessV2MaxCapacity: props.scaling.maxCapacityAcu || 2,
      backup: {
        retention: props.backupRetentionInDays
          ? Duration.days(props.backupRetentionInDays)
          : Duration.days(30),
      },

      credentials: this.databaseCredentials,
      backtrackWindow: Duration.hours(24),
      parameterGroup: this.parameterGroup,
      storageEncrypted: true,
      removalPolicy: props.removalPolicy ? props.removalPolicy : RemovalPolicy.SNAPSHOT,
    });

    // Secret Rotation
    if (!props.disableKeyRotation)
      this.aurora.addRotationSingleUser({
        automaticallyAfter: props.rotateSecretAfterDays,
      });

    // Setup IAM authentication
    if (this.aurora.secret) {
      this.RDS_V2_SECRET_ARN = new Config.Parameter(this, 'RDS_V2_SECRET_ARN', {
        value: this.aurora.secret.secretArn,
      });
      if (props.enabledProxy) {
        this.proxy = this.aurora.addProxy('dbproxy', {
          secrets: [this.aurora.secret],
          vpc: props.vpc,
          iamAuth: true,
          dbProxyName: `${id}-dbclusterv2-dbproxy`,
        });

        this.proxyRole = new aws_iam.Role(this, 'DBProxyRole', {
          assumedBy: new aws_iam.AccountPrincipal(Stack.of(this).account),
        });
        this.proxy.grantConnect(this.proxyRole, props.dbUserName);

        this.RDS_PROXY_ENDPOINT = new Config.Parameter(this, 'RDS_PROXY_ENDPOINT', {
          value: this.proxy.endpoint,
        });
      }
    }
  }

  // Get engine name
  // This function is to keep compatibility with RDSV1 construct in sst
  private getEngine(engine: RdsV2Engines['engine']) {
    if (engine === 'mysql8.0') {
      return aws_rds.DatabaseClusterEngine.auroraMysql({
        version: aws_rds.AuroraMysqlEngineVersion.VER_3_04_0,
      });
    } else if (engine === 'postgresql13.10') {
      return aws_rds.DatabaseClusterEngine.auroraPostgres({
        version: aws_rds.AuroraPostgresEngineVersion.VER_13_10,
      });
    } else if (engine === 'postgresql14.7') {
      return aws_rds.DatabaseClusterEngine.auroraPostgres({
        version: aws_rds.AuroraPostgresEngineVersion.VER_14_7,
      });
    } else if (engine === 'postgresql15.2') {
      return aws_rds.DatabaseClusterEngine.auroraPostgres({
        version: aws_rds.AuroraPostgresEngineVersion.VER_15_2,
      });
    }
    throw new Error(
      `The specified "engine" is not supported in this package. Only mysql8.0, postgresql13.10, postgresql14.7, and postgresql15.2 engines are currently supported.`,
    );
  }
}
