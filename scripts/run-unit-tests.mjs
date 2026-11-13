import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Emulator integration and the explicitly supplied private backup have their
// own commands. The default suite is wholly synthetic and blocks remote I/O.
const files = readdirSync('tests').filter(name => name.endsWith('.test.ts')
  && !name.endsWith('.emulator.test.ts') && name !== 'privateBackup.test.ts').sort();
const result = spawnSync(process.execPath, ['--require', './scripts/local-only-network.cjs',
  '--import', 'tsx', '--test', '--test-reporter=tap', ...files.map(name => `tests/${name}`)], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', WELLSPREP_LOCAL_HTTP_TESTS: 'true' },
});
process.exitCode = result.status ?? 1;
