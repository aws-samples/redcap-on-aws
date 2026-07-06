/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Arn, ArnFormat, aws_ec2, aws_iam, aws_secretsmanager, aws_ssm, Stack } from 'aws-cdk-lib';
import type { ISecurityGroup } from 'aws-cdk-lib/aws-ec2';
import type { IGrantable, IRole } from 'aws-cdk-lib/aws-iam';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { dbParameterNames } from '../dbSharedParameters';

/**
 * Decoupled view of the database cluster for consuming stacks (Backend, EC2Server).
 *
 * Instead of importing the live cluster's volatile attributes through
 * CloudFormation cross-stack exports (which prevents replacing the cluster while
 * those exports are in use), the consuming stacks resolve the values from SSM
 * Parameter Store by their stable, stage-based names at deploy time.
 *
 * IAM grants are built from the resolved values (a reconstructed secret) and from
 * a stable `rds-db:connect` resource ARN scoped by database user, so they no
 * longer depend on the cluster's resource id and survive cluster replacement.
 */
export class DatabaseConnection {
  public readonly secret: ISecret;
  public readonly secretArn: string;
  public readonly secretName: string;
  public readonly readEndpoint: string;
  public readonly securityGroup: ISecurityGroup;

  private readonly scope: Construct;

  constructor(scope: Construct, stage: string) {
    this.scope = scope;
    const names = dbParameterNames(stage);

    // Deploy-time dynamic references ({{resolve:ssm:...}}). These resolve to the
    // current parameter value when the stack is deployed, so a cluster
    // replacement (which updates the value in the Database stack) is picked up.
    this.secretArn = aws_ssm.StringParameter.valueForStringParameter(scope, names.secretArn);
    this.secretName = aws_ssm.StringParameter.valueForStringParameter(scope, names.secretName);
    this.readEndpoint = aws_ssm.StringParameter.valueForStringParameter(scope, names.readEndpoint);

    this.secret = aws_secretsmanager.Secret.fromSecretCompleteArn(
      scope,
      'ImportedDbSecret',
      this.secretArn,
    );

    this.securityGroup = aws_ec2.SecurityGroup.fromSecurityGroupId(
      scope,
      'ImportedDbSecurityGroup',
      aws_ssm.StringParameter.valueForStringParameter(scope, names.securityGroupId),
      { mutable: true },
    );
  }

  /**
   * Grant `rds-db:connect` for the given database user.
   *
   * The resource ARN uses a wildcard for the cluster resource id
   * (`dbuser:*​/{dbUser}`) so the grant does not depend on the cluster's
   * `clusterResourceIdentifier`, which changes when the cluster is replaced.
   */
  public grantConnect(grantee: IGrantable, dbUser: string): void {
    const stack = Stack.of(this.scope);
    const resourceArn = Arn.format(
      {
        service: 'rds-db',
        resource: 'dbuser',
        resourceName: `*/${dbUser}`,
        arnFormat: ArnFormat.COLON_RESOURCE_NAME,
      },
      stack,
    );

    grantee.grantPrincipal.addToPrincipalPolicy(
      new aws_iam.PolicyStatement({
        actions: ['rds-db:connect'],
        resources: [resourceArn],
      }),
    );
  }

  /** Grant read access to the database credentials secret. */
  public grantSecretRead(grantee: IGrantable | IRole): void {
    this.secret.grantRead(grantee);
  }
}
