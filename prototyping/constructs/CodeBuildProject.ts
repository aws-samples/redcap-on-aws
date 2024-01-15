/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Project, ProjectProps } from 'aws-cdk-lib/aws-codebuild';
import { Function } from 'sst/constructs';

import { Duration, RemovalPolicy, triggers } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export class CodeBuildProject extends Construct {
  public readonly project;
  public readonly props;
  constructor(scope: Construct, id: string, props: ProjectProps) {
    super(scope, id);
    this.props = props;

    // setup encryption key
    const key = new Key(this, 'CodeBuildProjectKey', {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // create CodeBuild project
    this.project = new Project(this, 'buildJob', {
      encryptionKey: key,
      ...props,
    });
  }

  // create Trigger construct to run CodeBuild Project
  public addLambdaTrigger(
    handler: string,
    name: string,
    executeBefore?: Construct[],
    executeAfter?: Construct[],
  ): string {
    const buildJobFunc = new Function(this, `${name}-lambda-trigger`, {
      handler: handler || 'packages/functions/src/startProjectBuild.handler',
      timeout: '10 minutes',
      environment: {
        CODEBUILD_PROJECT_NAME: this.project.projectName || '',
      },
    });

    buildJobFunc.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'codebuild:StartBuild',
          'codebuild:ListBuildsForProject',
          'codebuild:BatchGetBuilds',
        ],
        resources: [this.project.projectArn],
      }),
    );

    const after = executeAfter;
    after?.push(buildJobFunc);

    const buildTrigger = new triggers.Trigger(this, `${name}-trigger`, {
      handler: buildJobFunc,
      timeout: Duration.minutes(10),
      executeAfter: after,
      executeBefore,
    });

    return buildJobFunc.functionName;
  }
}
