/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { SecretValue, aws_iam } from 'aws-cdk-lib';
import { AccessKey, Group, User } from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class RedCapAwsAccessUser extends Construct {
  public readonly secret: Secret;
  public readonly user: User;
  public readonly userGroup: Group;
  constructor(
    scope: Construct,
    id: string,
    props: {
      user?: aws_iam.User;
      group?: aws_iam.Group;
      userName?: string;
      groupName: string;
    },
  ) {
    super(scope, id);

    // create IAM user
    this.user =
      props.user ??
      new aws_iam.User(this, 'redcap-user', {
        userName: props.userName,
      });

    // create IAM user group
    this.userGroup =
      props.group ??
      new aws_iam.Group(this, 'redcap-group', {
        groupName: props.groupName,
      });

    this.userGroup.addUser(this.user);

    // create access key and store in Secrets Manager
    const accessKey = new AccessKey(this, 'AccessKey', { user: this.user });
    this.secret = new Secret(this, 'Secret', {
      secretObjectValue: {
        AccessKeyId: SecretValue.unsafePlainText(accessKey.accessKeyId),
        SecretAccessKey: accessKey.secretAccessKey,
      },
    });
  }
}
