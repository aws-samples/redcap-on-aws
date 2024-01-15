/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { WafRule } from '../../prototyping/constructs/Waf';

// get waf rule for REDCap cron job with ip filter
export function getRedcapCronRuleIpFilter(searchString: string, priorityRule?: number) {
  const redcapCronRule: WafRule = {
    name: 'REDCAP-cronjob',
    rule: {
      name: 'redcap-cron-execution-ip-filter',
      priority: priorityRule ?? 10,
      statement: {
        andStatement: {
          statements: [
            {
              byteMatchStatement: {
                searchString: 'cron.php',
                fieldToMatch: {
                  uriPath: {},
                },
                textTransformations: [
                  {
                    priority: 0,
                    type: 'NONE',
                  },
                ],
                positionalConstraint: 'ENDS_WITH',
              },
            },
            {
              byteMatchStatement: {
                searchString,
                fieldToMatch: {
                  singleQueryArgument: {
                    Name: 'secret',
                  },
                },
                textTransformations: [
                  {
                    priority: 0,
                    type: 'NONE',
                  },
                ],
                positionalConstraint: 'EXACTLY',
              },
            },
          ],
        },
      },
      action: {
        allow: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'redcap-cron-exec',
      },
    },
  };

  return { searchString, redcapCronRule };
}

// get waf rule for REDCap cron job without ip filter
export function getRedcapCronRuleNoIpFilter(searchString: string, priorityRule?: number) {
  const redcapCronRule: WafRule = {
    name: 'REDCAP-cronjob',
    rule: {
      name: 'redcap-cron-execution-no-ip',
      priority: priorityRule ?? 10,
      statement: {
        andStatement: {
          statements: [
            {
              byteMatchStatement: {
                searchString: 'cron.php',
                fieldToMatch: {
                  uriPath: {},
                },
                textTransformations: [
                  {
                    priority: 0,
                    type: 'NONE',
                  },
                ],
                positionalConstraint: 'ENDS_WITH',
              },
            },
            {
              notStatement: {
                statement: {
                  byteMatchStatement: {
                    searchString,
                    fieldToMatch: {
                      singleQueryArgument: {
                        Name: 'secret',
                      },
                    },
                    textTransformations: [
                      {
                        priority: 0,
                        type: 'NONE',
                      },
                    ],
                    positionalConstraint: 'EXACTLY',
                  },
                },
              },
            },
          ],
        },
      },
      action: {
        block: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'redcap-cron-exec',
      },
    },
  };

  return { searchString, redcapCronRule };
}
