/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, BucketEncryption, BucketProps, StorageClass } from 'aws-cdk-lib/aws-s3';
import { App } from 'sst/constructs';
export function bucketProps(app?: App): BucketProps {
  const isProd = app?.stage === 'prod';
  return {
    removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    encryption: BucketEncryption.S3_MANAGED,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    autoDeleteObjects: !isProd,
    enforceSSL: true,
    versioned: isProd,
    serverAccessLogsPrefix: '/logs/bucket-access/',
    lifecycleRules: [
      {
        transitions: [
          {
            storageClass: StorageClass.INFREQUENT_ACCESS,
            transitionAfter: Duration.days(90),
          },
          {
            storageClass: StorageClass.INTELLIGENT_TIERING,
            transitionAfter: Duration.days(180),
          },
        ],
      },
    ],
  };
}
