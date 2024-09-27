/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

// Read stages from stages.ts -- use yarn sst deploy --stage <your_stage_variable>
import * as stage from './stages';

import { Aspects, Tags } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { SSTConfig } from 'sst';
import { NagConsoleLogger } from './prototyping/cdkNag/NagConsoleLogger';
import { Backend } from './stacks/Backend';
import { BuildImage } from './stacks/BuildImage';
import { Database } from './stacks/Database';
import { EC2Server } from './stacks/EC2Server';
import { Network } from './stacks/Network';
import { Route53NSRecords } from './stacks/Route53NSRecords';
import { get } from 'lodash';

export default {
  config(_input) {
    return stage[_input.stage as keyof typeof stage];
  },
  stacks(app) {
    const logger = new NagConsoleLogger();
    const ec2ServerStack = get(stage, [app.stage, 'ec2ServerStack']);

    if (app.mode === 'deploy') logger.showSuppressed();

    if (app.mode !== 'remove')
      Aspects.of(app).add(
        new AwsSolutionsChecks({
          verbose: true,
          additionalLoggers: [logger],
        }),
      );

    // Enable tags
    Tags.of(app).add('deployment', `${app.stage}-${app.region}`);

    // Assets removal policy: for dev stage and mode is destroy, prod is retain
    if (app.stage === 'dev' || app.mode === 'dev') {
      app.setDefaultRemovalPolicy('destroy');
    } else if (app.stage === 'prod' && app.mode === 'deploy')
      app.setDefaultRemovalPolicy('retain');

    /****** Stacks ******/
    if (app.stage === 'route53NS') {
      app.stack(Route53NSRecords);
    } else {
      app.stack(Network);
      app.stack(BuildImage);
      app.stack(Database);
      app.stack(Backend);
      if (ec2ServerStack) app.stack(EC2Server);
    }
  },
} satisfies SSTConfig;
