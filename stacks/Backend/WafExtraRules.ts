/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import { isEmpty } from 'lodash';
import { WafRule } from '../../prototyping/constructs/Waf';

// get waf rule for REDCap cron job
export function getRedcapCronRule(searchString: string, priorityRule?: number) {
  const redcapCronRule: WafRule = {
    name: 'REDCAP-cronjob',
    rule: {
      name: 'cron-execution',
      priority: priorityRule ?? 20,
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

  return redcapCronRule;
}

// get waf rule for REDCap country limit
export function getCountryLimitRule(allowedCountries?: string[], priorityRule?: number) {
  if (!allowedCountries || isEmpty(allowedCountries)) return undefined;

  allowedCountries.forEach(country => {
    if (!country) throw new Error('Invalid country in list');
  });

  const redcapCountryRule: WafRule = {
    name: 'country-list',
    rule: {
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'country-list',
      },
      name: 'country-list',
      priority: priorityRule || 10,
      action: {
        block: {
          customResponse: {
            responseCode: 403,
            customResponseBodyKey: 'response',
          },
        },
      },
      statement: {
        andStatement: {
          statements: [
            {
              notStatement: {
                statement: {
                  geoMatchStatement: {
                    countryCodes: allowedCountries,
                  },
                },
              },
            },
            {
              notStatement: {
                statement: {
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
              },
            },
          ],
        },
      },
    },
  };
  return redcapCountryRule;
}
