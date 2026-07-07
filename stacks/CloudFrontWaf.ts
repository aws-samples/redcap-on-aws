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

/**
 * SSM parameter name (in us-east-1) that holds the ARN of the CLOUDFRONT-scoped
 * WAF Web ACL for the ECS Express CloudFront distribution. The Backend stack
 * reads this cross-region at deploy time.
 */
export function cloudFrontWafParamName(stageName: string) {
  return `/redcap/${stageName}/cloudfront-waf-arn`;
}

/**
 * CLOUDFRONT-scoped AWS WAF Web ACL for the ECS Express runtime.
 *
 * AWS requires WAFv2 Web ACLs with `scope: CLOUDFRONT` to be created in
 * us-east-1. Following the SST v2 multi-region pattern, this stack is only
 * registered when the app is deployed to us-east-1:
 *
 *   sst deploy --stage <stage> --region us-east-1   # this stack
 *   sst deploy --stage <stage>                       # the app (main region)
 *
 * The resulting Web ACL ARN is published to SSM so the Backend stack can read
 * it and attach it to the CloudFront distribution's `webAclId`.
 */
export function CloudFrontWaf({ stack, app }: StackContext) {
  const cronSecret = get(stage, [stack.stage, 'cronSecret'], '0');
  const allowedIps = get(stage, [stack.stage, 'allowedIps'], []);
  const allowedCountries = get(stage, [stack.stage, 'allowedCountries'], undefined);

  // Recompute the cron search string deterministically from the same stage
  // config used by the regional WAF, so the CloudFront WAF has identical rules.
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
