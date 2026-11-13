import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const input = process.argv[2] || process.env.WELLSPREP_LOCAL_BACKUP;
if (!input) throw new Error('Provide the path of a private WellsPrep JSON backup.');
const file = resolve(input);
const checks = spawnSync(process.execPath, [
  '--require', './scripts/local-only-network.cjs', '--import', 'tsx', '--test',
  'tests/privateBackup.test.ts', 'tests/learningConsistency.test.ts', 'tests/backup.test.ts',
], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', WELLSPREP_LOCAL_BACKUP: file } });
if (checks.status !== 0) process.exit(checks.status ?? 1);
const browser = spawnSync(process.execPath, ['scripts/backup-browser.mjs', file], { stdio: 'inherit', env: process.env });
process.exitCode = browser.status ?? 1;
