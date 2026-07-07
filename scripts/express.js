/*
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: LicenseRef-.amazon.com.-AmznSL-1.0
 *  Licensed under the Amazon Software License  http://aws.amazon.com/asl/
 */

/**
 * Cross-platform orchestrator for ECS Express Mode deploy/remove/diff.
 *
 * The CLOUDFRONT-scoped WAF must live in us-east-1, so order matters:
 *   - deploy: WAF (us-east-1) first, then the app.
 *   - remove: app first, then the WAF.
 *   - diff:   both regions, read-only.
 *
 * Usage:
 *   node scripts/express.js deploy --stage <stage>
 *   node scripts/express.js remove --stage <stage>
 *   node scripts/express.js diff --stage <stage>
 */

import { spawnSync } from 'node:child_process';

const USEAST1 = 'us-east-1';

/** @param {string} msg */
function fail(msg) {
  console.error(`\n[express] ${msg}\n`);
  process.exit(1);
}

const action = process.argv[2];
const ACTIONS = ['deploy', 'remove', 'diff'];
if (!ACTIONS.includes(action)) {
  fail(`Unknown action "${action ?? ''}". Use one of: ${ACTIONS.join(', ')}.`);
}

const rest = process.argv.slice(3);

/** Read an `sst`-style flag: supports `--flag value` and `--flag=value`. */
function readFlag(flag) {
  const i = rest.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (i === -1) return undefined;
  const arg = rest[i];
  if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
  return rest[i + 1];
}

const stage = (readFlag('--stage') ?? '').trim();
if (!stage) {
  fail(`No stage provided. Use: yarn ${action}:express --stage <stage>`);
}
if (stage === 'route53NS') {
  fail('"route53NS" is a reserved stage and cannot be used for ECS Express.');
}

/** Run `sst <args>`, aborting the sequence on failure (deploy path). */
function sst(args) {
  if (!sstTry(args)) {
    fail(`Command failed: ${['sst', ...args].join(' ')}`);
  }
}

/** Run `sst <args>` without aborting; returns success (remove/diff paths). */
function sstTry(args) {
  const printable = ['sst', ...args].join(' ');
  console.log(`\n[express] > ${printable}\n`);
  // Single command string with shell:true works on both POSIX and Windows
  // (resolves sst / sst.cmd from node_modules/.bin on PATH under yarn).
  const result = spawnSync(printable, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(
      `\n[express] Command failed (exit ${result.status ?? 'unknown'}): ${printable}\n`,
    );
    return false;
  }
  return true;
}

if (action === 'deploy') {
  // WAF (us-east-1) first, then the app; abort if the WAF step fails.
  sst(['deploy', '--stage', stage, '--region', USEAST1]);
  sst(['deploy', '--stage', stage]);
} else if (action === 'diff') {
  // Read-only; diff both regions, best-effort.
  const wafOk = sstTry(['diff', '--stage', stage, '--region', USEAST1]);
  const appOk = sstTry(['diff', '--stage', stage]);
  if (!wafOk || !appOk) {
    fail('One or more diff steps failed; review the output above.');
  }
} else {
  // App first (CloudFront depends on the WAF), then the WAF. Best-effort so a
  // failed app teardown doesn't strand the us-east-1 WAF.
  const appOk = sstTry(['remove', '--stage', stage]);
  const wafOk = sstTry(['remove', '--stage', stage, '--region', USEAST1]);
  if (!appOk || !wafOk) {
    fail(
      'One or more remove steps failed; review the output above and clean up manually if needed.',
    );
  }
}

console.log(`\n[express] ${action} complete for stage "${stage}".\n`);
