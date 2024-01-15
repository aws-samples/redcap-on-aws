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
import { Network } from './stacks/Network';
import { Route53NSRecords } from './stacks/Route53NSRecords';

export default {
  config(_input) {
    return stage[_input.stage as keyof typeof stage];
  },
  stacks(app) {
    const logger = new NagConsoleLogger();

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

    // Configure removal policy - prod env should be careful to prevent accidental deletion
    if (app.stage !== 'prod') {
      app.setDefaultRemovalPolicy('destroy');
    }

    /****** Stacks ******/
    if (app.stage === 'route53NS') {
      app.stack(Route53NSRecords);
    } else {
      app.stack(Network);
      app.stack(BuildImage);
      app.stack(Database);
      app.stack(Backend);
      // Optional - enables AWS Guard-duty
      // app.stack(Security);
    }
  },
} satisfies SSTConfig;
