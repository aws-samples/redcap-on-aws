/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { CfnDetector } from 'aws-cdk-lib/aws-guardduty';

import { StackContext } from 'sst/constructs';
import { Suppressions } from '../prototyping/cdkNag/Suppressions';

export function Security({ stack }: StackContext) {
  const detector = new CfnDetector(stack, `guard-duty`, {
    enable: true,
    dataSources: {
      s3Logs: {
        enable: true,
      },
    },
  });
  Suppressions.SecurityDetectorSuppressions(detector);
}
