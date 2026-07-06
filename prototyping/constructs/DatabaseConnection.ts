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
 * Reads the DB cluster's volatile attributes from SSM
 */
export class DatabaseConnection {
  public readonly secret: ISecret;
  public readonly secretArn: string;
  public readonly secretName: string;
  public readonly readEndpoint: string;
  public readonly securityGroup: ISecurityGroup;

  private readonly scope: Construct;
  private readonly clusterResourceId: string;

  constructor(scope: Construct, stage: string) {
    this.scope = scope;
    const names = dbParameterNames(stage);

    this.secretArn = aws_ssm.StringParameter.valueForStringParameter(scope, names.secretArn);
    this.secretName = aws_ssm.StringParameter.valueForStringParameter(scope, names.secretName);
    this.readEndpoint = aws_ssm.StringParameter.valueForStringParameter(scope, names.readEndpoint);
    this.clusterResourceId = aws_ssm.StringParameter.valueForStringParameter(
      scope,
      names.clusterResourceId,
    );

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
   * Grant `rds-db:connect`. The cluster resource id is resolved from SSM, so the
   * grant is scoped to the current cluster only (not other stages) and still
   * survives cluster replacement (the SSM value updates on the next deploy).
   */
  public grantConnect(grantee: IGrantable, dbUser: string): void {
    const stack = Stack.of(this.scope);
    const resourceArn = Arn.format(
      {
        service: 'rds-db',
        resource: 'dbuser',
        resourceName: `${this.clusterResourceId}/${dbUser}`,
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

  public grantSecretRead(grantee: IGrantable | IRole): void {
    this.secret.grantRead(grantee);
  }
}
