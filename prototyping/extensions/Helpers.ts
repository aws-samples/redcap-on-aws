/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

export class Helpers {
  static extractRedCapTag(s: string): string | null {
    try {
      const match = s.match(/redcap(\d+\.\d+\.\d+)\.zip/);
      return match ? match[1] : null;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}
