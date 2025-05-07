/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

import chalk from 'chalk';
import * as fs from 'fs';
import path from 'path';

import {
  INagLogger,
  NagLoggerErrorData,
  NagLoggerNonComplianceData,
  NagLoggerSuppressedData,
  NagLoggerSuppressedErrorData,
} from 'cdk-nag';
import { parse } from 'csv-parse/sync';
import { filter, size } from 'lodash';

export class NagConsoleLogger implements INagLogger {
  private nagFiles = {
    total: 0,
    warning: 0,
    error: 0,
  };

  private sstPath = '.sst/dist';
  private logSuppressed = false;

  public hasErrors = false;

  showSuppressed() {
    this.logSuppressed = true;
  }

  onCompliance(): void {}
  onNonCompliance(data: NagLoggerNonComplianceData): void {
    if (data.ruleLevel === 'Warning')
      console.log(
        chalk.yellow(
          `\n[${data.ruleLevel} ${data.ruleId}] - (${data.resource.cfnResourceType}) ${data.resource.node.path}`,
        ),
      );
    else {
      console.log(
        chalk.red(
          `\n[NonCompliance ${data.ruleLevel} ${data.ruleId}] - (${data.resource.cfnResourceType}) ${data.resource.node.path} ${data.ruleInfo}`,
        ),
      );
      this.hasErrors = true;
      process.exit();
    }
  }
  onSuppressed(data: NagLoggerSuppressedData): void {
    if (this.logSuppressed) {
      console.log(
        chalk.cyan(
          `\n[Suppressed ${data.ruleLevel} ${data.ruleId}] - (${data.resource.cfnResourceType}) ${data.resource.node.path} - ${data.suppressionReason}`,
        ),
      );
    }
  }
  onError(data: NagLoggerErrorData): void {
    console.log(
      chalk.red(
        `\n[${data.ruleLevel} ${data.ruleId}] - (${data.resource.cfnResourceType}) ${data.resource.node.path}`,
      ),
    );
    this.hasErrors = true;
    process.exit();
  }
  onSuppressedError(data: NagLoggerSuppressedErrorData): void {
    if (this.logSuppressed) {
      console.log(
        chalk.cyan(
          `\n[Suppressed ${data.ruleLevel} ${data.ruleId}] - (${data.resource.cfnResourceType}) ${data.resource.node.path} - ${data.errorSuppressionReason}`,
        ),
      );
    }
  }
  onNotApplicable(): void {}

  // Logs to a console table the offenses found with RuleId and RuleInfo by category.
  nagFilesToConsoleTable(stage: string = '') {
    const files = this.findCsvFilesInDirectory(`./${this.sstPath}/`, '.csv', stage);
    const log = console.table;
    const headers = {
      RuleID: '',
      ResourceID: '',
      Compliance: '',
      ExceptionReason: '',
      RuleLevel: '',
      RuleInfo: '',
    };

    files.forEach(file => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offenses: any[] = [];

      const csv = fs.readFileSync(`./${file}`);

      const rows = parse(csv.toString(), {
        delimiter: ',',
        fromLine: 2,
        autoParse: true,
      });

      rows.forEach((row: Array<string>) => {
        const entry = {};
        Object.keys(headers).forEach((header, idx) => {
          Object.assign(entry, { [header]: row[idx].trim() });
        });
        offenses.push(entry);
      });

      const nonComplianceError = filter(offenses, {
        Compliance: 'Non-Compliant',
        RuleLevel: 'Error',
      });

      const nonComplianceWarn = filter(offenses, {
        Compliance: 'Non-Compliant',
        RuleLevel: 'Warning',
      });

      this.nagFiles.error += size(nonComplianceError) > 0 ? 1 : 0;
      this.nagFiles.warning += size(nonComplianceWarn) > 0 ? 1 : 0;

      if (size(nonComplianceError) > 0) {
        this.hasErrors = true;
        console.log(chalk.bgRed(`Error: ${file} `));
        log(nonComplianceError, ['RuleID', 'RuleInfo', 'ResourceID']);
      }

      if (size(nonComplianceWarn) > 0) {
        console.log(chalk.bgYellow(`Warnings: ${file}: `));
        log(nonComplianceWarn, ['RuleID', 'RuleInfo', 'ResourceID']);
      }
    });

    console.log(
      chalk.cyan(`cdk-nag files found: ${this.nagFiles.total}, `),
      chalk.red(`w/Error: ${this.nagFiles.error}, `),
      chalk.yellow(`w/Warning: ${this.nagFiles.warning}`),
    );
  }

  // Returns an array of all cdk-nag csv files in a given directory
  findCsvFilesInDirectory(startPath: string, filter: string, stage: string): Array<string> {
    if (!fs.existsSync(startPath)) {
      console.log('no dir ', startPath);
      return [];
    }
    const files = fs.readdirSync(startPath);
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const filename = path.join(startPath, files[i]);
      const stat = fs.lstatSync(filename);
      const regexp = new RegExp(`^${this.sstPath}/AwsSolutions-${stage}-`);
      if (stat.isDirectory()) {
        this.findCsvFilesInDirectory(filename, filter, stage);
      } else if (regexp.test(filename) && filename.endsWith(filter)) {
        results.push(filename);
      }
    }
    this.nagFiles.total = results.length;
    return results;
  }
}
