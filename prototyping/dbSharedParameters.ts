/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

export function dbParameterNames(stage: string) {
  const base = `/${stage}/redcap/db`;
  return {
    secretArn: `${base}/secretArn`,
    secretName: `${base}/secretName`,
    readEndpoint: `${base}/readEndpoint`,
    clusterResourceId: `${base}/clusterResourceId`,
    securityGroupId: `${base}/securityGroupId`,
  };
}
