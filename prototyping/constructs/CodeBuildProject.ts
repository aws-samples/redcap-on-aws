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

interface LambdaTriggerProps {
  handler: string;
  name: string;
  rebuild: boolean;
  executeBefore?: Construct[];
  executeAfter?: Construct[];
}
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
  public addLambdaTrigger(props: LambdaTriggerProps): string {
    const environment = {
      CODEBUILD_PROJECT_NAME: this.project.projectName || '',
      TIMESTAMP: props.rebuild ? Date.now().toString() : 'NA',
    };

    const buildJobFunc = new Function(this, `${props.name}-lambda-trigger`, {
      handler: props.handler,
      timeout: '15 minutes',
      environment,
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

    const after = props.executeAfter;
    after?.push(buildJobFunc);

    new triggers.Trigger(this, `${props.name}-trigger`, {
      handler: buildJobFunc,
      timeout: Duration.minutes(10),
      executeOnHandlerChange: true,
      executeAfter: after,
      executeBefore: props.executeBefore,
    });

    return buildJobFunc.functionName;
  }
}
