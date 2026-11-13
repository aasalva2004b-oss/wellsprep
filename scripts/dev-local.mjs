import { spawn, spawnSync } from 'node:child_process';
const seed = spawnSync(process.execPath, [
  '--require', './scripts/local-only-network.cjs', '--import', 'tsx', 'scripts/seed-emulator.ts',
], { stdio: 'inherit', env: process.env });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const child = spawn(process.execPath, ['--import','tsx','server.ts'], {
  stdio: 'inherit', env: { ...process.env, VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep', FIREBASE_SERVER_MODE: 'emulator', NODE_ENV: 'development', PORT: '5173' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => { process.exitCode = code ?? 1; });
