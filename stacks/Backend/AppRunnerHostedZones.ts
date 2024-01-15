/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

//Source: https://docs.aws.amazon.com/general/latest/gr/apprunner.html
export function getAppRunnerHostedZone(region: string) {
  const map = new Map<string, string>([
    ['us-east-2', 'Z0224347AD7KVHMLOX31'],
    ['us-east-1', 'Z01915732ZBZKC8D32TPT'],
    ['us-west-2', 'Z02243383FTQ64HJ5772Q'],
    ['ap-southeast-1', 'Z09819469CZ3KQ8PWMCL'],
    ['ap-southeast-2', 'Z03657752RA8799S0TI5I'],
    ['ap-northeast-1', 'Z08491812XW6IPYLR6CCA'],
    ['eu-central-1', 'Z0334911C2FDI2Q9M4FZ'],
    ['eu-west-1', 'Z087551914Z2PCAU0QHMW'],
  ]);
  if (region) return map.get(region);
  return map.get('us-east-1');
}
