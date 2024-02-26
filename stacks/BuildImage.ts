/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { get, last, split, toLower } from 'lodash';
import { StackContext, use } from 'sst/constructs';

import { RemovalPolicy } from 'aws-cdk-lib';
import {
  BuildSpec,
  Cache,
  LinuxBuildImage,
  LocalCacheMode,
  Source,
} from 'aws-cdk-lib/aws-codebuild';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';

import { Suppressions } from '../prototyping/cdkNag/Suppressions';
import { CodeBuildProject } from '../prototyping/constructs/CodeBuildProject';

import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Helpers } from '../prototyping/extensions/Helpers';
import { Network } from './Network';

import * as stage from '../stages';

export function BuildImage({ stack, app }: StackContext) {
  const { networkVpc } = use(Network);

  const profile = get(stage, [stack.stage, 'profile'], 'default');

  // Main REDCap docker port
  const port = get(stage, [stack.stage, 'port']);

  // Use local redcap file as deployment
  const redCapLocalVersion = get(stage, [stack.stage, 'redCapLocalVersion']);

  // Use a remote S3 location to deploy redcap
  let redCapS3Path = get(stage, [stack.stage, 'redCapS3Path']);
  let redcapTag = get(stage, [stack.stage, 'deployTag'], Helpers.extractRedCapTag(redCapS3Path));

  const rebuild = get(stage, [stack.stage, 'rebuildImage'], false);

  // Validation check
  if (redCapS3Path && redCapLocalVersion) {
    throw new Error(
      'You must define only one REDCap install source, redCapLocalVersion (redcap<version>.zip) or an redCapS3Path (bucket_name/path/redcap<version>.zip)',
    );
  } else if (!redCapS3Path && !redCapLocalVersion) {
    throw new Error(
      'No REDCap install source found, define redCapLocalVersion or redCapS3Path in your stage file',
    );
  }

  if (redCapLocalVersion) {
    const redcapPackage = new Asset(stack, `${app.stage}-${app.name}-redcapPackage`, {
      path: `packages/REDCap/releases/${redCapLocalVersion}.zip`,
      exclude: ['.DS_Store'],
    });

    redcapTag = get(
      stage,
      [stack.stage, 'deployTag'],
      Helpers.extractRedCapTag(`${redCapLocalVersion}.zip`),
    );

    redCapS3Path = redcapPackage.s3ObjectUrl;
  } else {
    redCapS3Path = `s3://${redCapS3Path}`;
  }

  const redcapS3Arn = `arn:aws:s3:::${last(split(redCapS3Path, 's3://'))}`;

  // AWS ECR Repository creation
  const repository = new Repository(stack, `${app.stage}-${app.name}-ecr`, {
    imageScanOnPush: true,
    autoDeleteImages: true,
    encryptionKey: new Key(stack, `redcap-kms-key`, {
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    }),
    removalPolicy: RemovalPolicy.DESTROY,
    repositoryName: toLower(`${app.stage}-${app.name}-repository`),
  });

  // Language assets
  const redcapLanguages = new Asset(stack, `${app.stage}-${app.name}-redcapLanguages`, {
    path: `packages/REDCap/languages`,
    exclude: ['.DS_Store'],
  });

  // Deployment assets
  const buildAsset = new Asset(stack, `asset`, {
    path: 'containers/redcap-docker-apache',
    exclude: ['.DS_Store'],
  });

  // Codebuild project to build REDCap image and push to ECR
  const codeBuild = new CodeBuildProject(stack, `${app.stage}-${app.name}-codeBuildProject`, {
    projectName: `${app.stage}-${app.name}-build`,
    vpc: networkVpc.vpc,
    cache: Cache.local(LocalCacheMode.DOCKER_LAYER),
    source: Source.s3({
      bucket: buildAsset.bucket,
      path: buildAsset.s3ObjectKey,
    }),
    environment: {
      privileged: true,
      buildImage: LinuxBuildImage.STANDARD_7_0,
    },
    environmentVariables: {
      ECR_REPOSITORY_URI: {
        value: repository.repositoryUri,
      },
      IMAGE_TAG: {
        value: redcapTag!,
      },
      REDCAP_S3_URI: {
        value: redCapS3Path,
      },
      LANG_S3_URI: {
        value: redcapLanguages.s3ObjectUrl,
      },
      AWS_ACCOUNT_ID: {
        value: stack.account,
      },
      PORT: {
        value: port || '8080',
      },
    },
    buildSpec: BuildSpec.fromAsset('./buildspec/redcap-build.yml'),
  });

  const project = codeBuild.project;

  repository.grantPullPush(project);
  buildAsset.bucket.grantRead(project);

  project.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr-public:GetAuthorizationToken',
        'sts:GetServiceBearerToken',
      ],
      resources: ['*'],
    }),
  );

  if (redcapS3Arn)
    project.addToRolePolicy(
      new PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [redcapS3Arn],
      }),
    );

  const lambdaBuild = codeBuild.addLambdaTrigger({
    handler: 'packages/functions/src/startProjectBuild.handler',
    name: 'redcap-build',
    rebuild: rebuild,
    executeAfter: [codeBuild],
    executeBefore: [],
  });

  stack.addOutputs({
    UpdateDeploymentCommand: `aws lambda invoke --function-name ${lambdaBuild} --region ${stack.region} --profile ${profile} deployLambdaResponse.json`,
  });

  Suppressions.BuildImageSuppressions(codeBuild, app);

  return repository;
}
