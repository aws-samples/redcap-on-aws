/*
 *  Copyright 2026 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { Arn, ArnFormat, Stack } from 'aws-cdk-lib';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface CrossRegionSsmParameterProps {
  /** Region the parameter lives in, e.g. `us-east-1`. */
  readonly region: string;
  /** Parameter name, e.g. `/redcap/dev/cloudfront-waf-arn`. */
  readonly parameterName: string;
}

/**
 * Reads an SSM parameter from another Region at deploy time via an
 * `AwsCustomResource` (`ssm:GetParameter`). CDK's native SSM readers are
 * region-locked to the consuming stack, so a cross-region read needs this.
 * Synthesis stays offline.
 */
export class CrossRegionSsmParameter extends Construct {
  private readonly reader: AwsCustomResource;

  constructor(scope: Construct, id: string, props: CrossRegionSsmParameterProps) {
    super(scope, id);

    const stack = Stack.of(this);

    // Scope IAM to the exact parameter ARN in the target region.
    const parameterArn = Arn.format(
      {
        service: 'ssm',
        region: props.region,
        resource: 'parameter',
        resourceName: props.parameterName.replace(/^\//, ''),
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      },
      stack,
    );

    const physicalId = PhysicalResourceId.of(`${props.region}:${props.parameterName}`);

    this.reader = new AwsCustomResource(this, 'reader', {
      resourceType: 'Custom::CrossRegionSsmParameter',
      onCreate: {
        service: 'SSM',
        action: 'GetParameter',
        region: props.region,
        parameters: { Name: props.parameterName },
        physicalResourceId: physicalId,
      },
      onUpdate: {
        service: 'SSM',
        action: 'GetParameter',
        region: props.region,
        parameters: { Name: props.parameterName },
        physicalResourceId: physicalId,
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: [parameterArn] }),
    });
  }

  /** Resolved parameter value, as a deploy-time token. */
  public get value(): string {
    return this.reader.getResponseField('Parameter.Value');
  }
}
