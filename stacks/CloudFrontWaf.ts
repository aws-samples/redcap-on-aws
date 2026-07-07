/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { get, isEmpty } from 'lodash';
import type { StackContext } from 'sst/constructs';
import Suppressions from '../prototyping/cdkNag/Suppressions';
import { Waf } from '../prototyping/constructs/Waf';
import * as stage from '../stages';
import { getCountryLimitRule, getRedcapCronRule } from './Backend/WafExtraRules';

const { createHmac } = await import('node:crypto');

/** SSM parameter name (us-east-1) holding the CLOUDFRONT-scoped WAF ARN. */
export function cloudFrontWafParamName(stageName: string) {
  return `/redcap/${stageName}/cloudfront-waf-arn`;
}

/**
 * CLOUDFRONT-scoped WAF for the ECS Express runtime. WAFv2 CLOUDFRONT ACLs must
 * be created in us-east-1, so this stack is only registered there. The ARN is
 * published to SSM for the Backend stack to attach to CloudFront's `webAclId`.
 */
export function CloudFrontWaf({ stack, app }: StackContext) {
  const cronSecret: string = get(stage, [stack.stage, 'cronSecret']);
  const allowedIps = get(stage, [stack.stage, 'allowedIps'], []);
  const allowedCountries = get(stage, [stack.stage, 'allowedCountries'], undefined);

  // Same deterministic cron search string as the regional WAF.
  const searchString = createHmac('sha256', cronSecret)
    .update(cronSecret.split('').reverse().join(''))
    .digest('hex');

  const extraRules = [getRedcapCronRule(searchString, 20)];
  if (!isEmpty(allowedCountries)) {
    const countryRules = getCountryLimitRule(allowedCountries, 10);
    if (countryRules) extraRules.push(countryRules);
  }

  const waf = new Waf(stack, `${app.stage}-${app.name}-cf-appwaf`, {
    useCloudFront: true,
    allowedIps,
    extraRules,
  });

  new StringParameter(stack, 'cloudfront-waf-arn', {
    parameterName: cloudFrontWafParamName(stack.stage),
    stringValue: waf.waf.attrArn,
  });

  Suppressions.WebWafSuppressions(waf);

  stack.addOutputs({
    CloudFrontWafArn: waf.waf.attrArn,
  });
}
