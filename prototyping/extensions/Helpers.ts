/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { get } from 'lodash';
import { Stack } from 'sst/constructs';

export class Helpers {
  static extractRedCapVersionFromStack(stack: Stack, stage: any): string | null {
    try {
      const redCapS3Path = get(stage, [stack.stage, 'redCapS3Path']);
      const redCapLocalVersion = get(stage, [stack.stage, 'redCapLocalVersion']);
      const redcap = redCapLocalVersion ?? redCapS3Path;
      return this.extractRedCapTag(redcap);
    } catch (e) {
      return null;
    }
  }

  static extractRedCapTag(s: string): string | null {
    try {
      const match = s.match(/redcap(\d+\.\d+\.\d+)\.zip/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }
}
