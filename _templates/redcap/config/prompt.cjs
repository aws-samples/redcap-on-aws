/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

module.exports = [
  {
    type: 'password',
    name: 'password',
    message: 'REDCap site-admin temp-password?',
  },
  {
    type: 'input',
    name: 'siteadmin_firstname',
    message: 'REDCap site-admin first name?',
  },
  {
    type: 'input',
    name: 'siteadmin_lastname',
    message: 'REDCap site-admin last name?',
  },
  {
    type: 'input',
    name: 'siteadmin_email',
    message: 'REDCap site-admin email?',
  },
  {
    type: 'select',
    name: 'enable_api',
    message: 'Enable REDCap API?',
    initial: '0',
    choices: [
      { name: '1', message: 'Yes', value: '1' },
      { name: '0', message: 'No', value: '0' },
    ],
  },
  {
    type: 'select',
    name: 'language',
    message: 'REDCap global language?',
    initial: 'English',
    choices: [
      { name: 'English', message: 'English', value: 'English' },
      { name: 'Japanese', message: 'Japanese', value: 'Japanese' },
    ],
  },
  {
    type: 'select',
    name: 'auto_report_stats',
    message: 'Enable REDCap Report stats?',
    initial: '0',
    choices: [
      { name: '1', message: 'Yes', value: '1' },
      { name: '0', message: 'No', value: '0' },
    ],
  },
  {
    type: 'select',
    name: 'use_s3',
    message: 'Use S3 bucket as storage for REDCap?',
    initial: '1',
    choices: [
      { name: '1', message: 'Yes', value: '1' },
      { name: '0', message: 'No', value: '0' },
    ],
  },
  {
    type: 'input',
    name: 'contact_email',
    message: 'REDCap from/homepage contact email?',
  },
  {
    type: 'input',
    name: 'base_url',
    message: 'REDCap base URL (example: redcap.subdomain.com)?',
  },
];
