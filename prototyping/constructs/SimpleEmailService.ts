/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Duration, RemovalPolicy, Stack, aws_iam, aws_secretsmanager, triggers } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Function } from 'sst/constructs';

export interface SimpleEmailServiceProps {
  group?: aws_iam.Group;
  /**
   * The IAM user for Amazon SES
   */
  user: aws_iam.User;
  /**
   * Secret containing an IAM user AccessKeyId and a SecretAccessKey in SecretManager to be transformed to SES credentials.
   * Default: new IAM credentials will be created.
   */
  transformCredentials?: aws_secretsmanager.Secret;
  publicHostedZone?: PublicHostedZone;
  domain?: string;
  email?: string;
}

export class SimpleEmailService extends Construct {
  public readonly sesUserCredentials: aws_secretsmanager.Secret;
  constructor(scope: Construct, id: string, props: SimpleEmailServiceProps) {
    super(scope, id);

    let identity;
    let mailFromDomain;

    // check props
    if (props.publicHostedZone && props.domain) {
      throw new Error('SES can be configured with public hosted zone or a domain');
    }

    if ((props.publicHostedZone || props.domain) && props.email) {
      throw new Error('SES can be configured with one public hosted zone, domain or email');
    }

    // create Identity
    if (props.publicHostedZone) {
      identity = Identity.publicHostedZone(props.publicHostedZone);
      mailFromDomain = `mail.${props.publicHostedZone.zoneName}`;
    } else if (props.domain) {
      identity = Identity.domain(props.domain);
      mailFromDomain = `mail.${props.domain}`;
    } else if (props.email) {
      this.VerifyEmailIdentity(props.email, Stack.of(this).region);
    }

    if (identity)
      new EmailIdentity(this, `${id}-identity`, {
        identity,
        mailFromDomain,
      });

    // grant redcap user send e-mail
    const user = props.user;

    const policy = new aws_iam.Policy(this, 'user-policy', {
      statements: [
        new aws_iam.PolicyStatement({
          effect: aws_iam.Effect.ALLOW,
          actions: ['ses:SendRawEmail', 'ses:SendEmail'],
          resources: ['*'],
        }),
      ],
    });

    if (props.group) {
      props.group.attachInlinePolicy(policy);
    } else {
      user.attachInlinePolicy(policy);
    }

    // store ses password in Secrets Manager
    this.sesUserCredentials = new aws_secretsmanager.Secret(scope, 'ses-user-password', {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // create lambda function to get SES credential
    const getCredentialsFunction = new Function(scope, 'get-credentials', {
      environment: {
        SES_USERNAME: user.userName || 'redcap-smtp-user',
        SES_USER_PASSWORD_ARN: this.sesUserCredentials.secretArn,
        TRANSFORM_CREDENTIALS_ARN: props.transformCredentials?.secretArn || '',
      },
      handler: 'packages/functions/src/createSesCredentials.handler',
    });

    getCredentialsFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['iam:CreateAccessKey', 'iam:ListAccessKeys'],
        resources: [user.userArn],
      }),
    );

    getCredentialsFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:UpdateSecret',
          'secretsmanager:PutSecretValue',
        ],
        resources: [this.sesUserCredentials.secretArn],
      }),
    );

    if (props.transformCredentials)
      getCredentialsFunction.addToRolePolicy(
        new PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [props.transformCredentials.secretArn],
        }),
      );

    // execute get credential function after once deployed
    new triggers.Trigger(scope, 'create-credentials-ses', {
      handler: getCredentialsFunction,
      timeout: Duration.minutes(1),
      invocationType: triggers.InvocationType.REQUEST_RESPONSE,
    });
  }

  // verify email identity using custom resource
  VerifyEmailIdentity(emailAddress: string, region: string) {
    return new AwsCustomResource(this, `verifyEmailIdentity-${emailAddress}`, {
      onCreate: {
        service: 'SES',
        action: 'verifyEmailIdentity',
        parameters: {
          EmailAddress: emailAddress,
        },
        physicalResourceId: PhysicalResourceId.of(`verify-${emailAddress}`),
        region,
      },
      onDelete: {
        service: 'SES',
        action: 'deleteIdentity',
        parameters: {
          Identity: emailAddress,
        },
        region,
      },
      policy: this.generateSesPolicyForCustomResource('VerifyEmailIdentity', 'DeleteIdentity'),
    });
  }
  generateSesPolicyForCustomResource(...methods: string[]): AwsCustomResourcePolicy {
    return AwsCustomResourcePolicy.fromStatements([
      new PolicyStatement({
        actions: methods.map((method) => 'ses:' + method),
        effect: Effect.ALLOW,
        resources: ['*'],
      }),
    ]);
  }
}
