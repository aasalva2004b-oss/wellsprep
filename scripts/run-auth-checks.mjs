import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, [
  '--require', './scripts/local-only-network.cjs', '--import', 'tsx', '--test', 'tests/auth.emulator.test.ts',
], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
process.exitCode = result.status ?? 1;
