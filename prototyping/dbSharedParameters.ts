/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

/**
 * Well-known SSM parameter names used to share volatile database cluster
 * attributes between the Database stack (producer) and the Backend / EC2Server
 * stacks (consumers).
 *
 * These values (secret ARN/name, read endpoint, cluster resource id) change
 * whenever the Aurora cluster is replaced (for example when restoring from a
 * different snapshot). Passing them via CloudFormation cross-stack exports made
 * such a replacement fail with "cannot update export ... as it is in use by ...".
 *
 * Reading them by a stable SSM parameter name instead avoids the CloudFormation
 * export/import lock: the Database stack updates the parameter value in place and
 * the consuming stacks resolve the current value at deploy time via a dynamic
 * reference, so a cluster replacement is no longer blocked.
 *
 * The parameter name only depends on the stage (a stable value), never on the
 * cluster's logical id or resource id.
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
