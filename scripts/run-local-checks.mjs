import { spawnSync } from 'node:child_process';
const pure = spawnSync(process.execPath, ['scripts/run-unit-tests.mjs'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
if (pure.status !== 0) process.exit(pure.status ?? 1);
const result = spawnSync(process.execPath, [
  '--require', './scripts/local-only-network.cjs', '--import', 'tsx', '--test',
  'tests/auth.emulator.test.ts', 'tests/firestore.emulator.test.ts', 'tests/backend.emulator.test.ts',
], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', WELLSPREP_LOCAL_HTTP_TESTS: 'true' } });
if (result.status !== 0) process.exit(result.status ?? 1);
const seed = spawnSync(process.execPath, [
  '--require', './scripts/local-only-network.cjs', '--import', 'tsx', 'scripts/seed-emulator.ts',
], { stdio: 'inherit', env: process.env });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const browser = spawnSync(process.execPath, ['scripts/browser-isolation.mjs', '--with-emulators'], {
  stdio: 'inherit', env: process.env,
});
process.exitCode = browser.status ?? 1;
