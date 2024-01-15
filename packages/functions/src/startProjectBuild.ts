/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import {
  BatchGetBuildsCommand,
  CodeBuildClient,
  ListBuildsForProjectCommand,
  StartBuildCommand,
} from '@aws-sdk/client-codebuild';
import { Handler } from 'aws-lambda';
import { filter, isEmpty, size } from 'lodash';

async function getBuilds(client: CodeBuildClient) {
  // Get the list builds
  const props = {
    projectName: process.env.CODEBUILD_PROJECT_NAME,
    nextToken: undefined as string | undefined,
  };
  const listProjectBuildCommand = new ListBuildsForProjectCommand(props);

  const ids = [];

  // Get the details of each build
  const listBuildResponse = await client.send(listProjectBuildCommand);
  ids.push(listBuildResponse.ids);

  while (listBuildResponse.nextToken) {
    props.nextToken = listBuildResponse.nextToken;
    const listProjectBuildCommand = new ListBuildsForProjectCommand(props);
    const nextListBuildResponse = await client.send(listProjectBuildCommand);
    ids.push(nextListBuildResponse.ids);
  }

  const batchBuildCommand = new BatchGetBuildsCommand({
    ids: listBuildResponse.ids,
  });

  if (isEmpty(listBuildResponse.ids)) {
    return [];
  }

  const batchBuildResponse = await client.send(batchBuildCommand);
  return batchBuildResponse.builds || [];
}

export const handler: Handler = async () => {
  try {
    let buildStartedId: string | undefined = undefined;
    let buildFinished = false;
    let canStartBuild = true;

    const client = new CodeBuildClient({ region: process.env.AWS_REGION });

    const startBuildCommand = new StartBuildCommand({
      projectName: process.env.CODEBUILD_PROJECT_NAME,
    });

    const builds = await getBuilds(client);
    // We can start the build if no builds are found, first deploy.
    if (isEmpty(builds)) {
      const buildCommandResponse = await client.send(startBuildCommand);
      if (buildCommandResponse.$metadata.httpStatusCode === 200)
        buildStartedId = buildCommandResponse.build?.id;
    } else {
      // Check if we can start the build
      builds.forEach((build) => {
        if (build.buildStatus === 'IN_PROGRESS') {
          canStartBuild = false;
          buildStartedId = build.id;
        }
      });

      if (canStartBuild) {
        const buildCommandResponse = await client.send(startBuildCommand);
        if (buildCommandResponse.$metadata.httpStatusCode === 200)
          buildStartedId = buildCommandResponse.build?.id;
      }
    }

    if (buildStartedId) {
      while (buildFinished === false) {
        await new Promise((r) => setTimeout(r, 10000));
        const builds = await getBuilds(client);

        const hasBuildJob = size(filter(builds, (b) => b.id === buildStartedId));

        if (hasBuildJob <= 0) {
          return new Error('Build is no longer in scope');
        }

        builds.forEach((build) => {
          if (build.id === buildStartedId) {
            if (build.buildStatus === 'IN_PROGRESS') {
              buildFinished = false;
            } else {
              buildFinished = true;
              return true;
            }
          }
        });
      }
    }
  } catch (e) {
    return new Error('Lambda build had an error');
  }
};
