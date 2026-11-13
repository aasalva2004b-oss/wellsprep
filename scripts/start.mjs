import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['build/server.cjs'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
