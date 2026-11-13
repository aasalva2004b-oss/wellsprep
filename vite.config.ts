import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode, command}) => {
  const env = loadEnv(mode, '.', '');
  const isolated = env.VITE_FIREBASE_MODE !== 'production';
  // Private backup replay is a development-only memory transport, never a build input.
  const backupPath = process.env.WELLSPREP_BACKUP_PATH;
  if (backupPath && (!isolated || command !== 'serve')) {
    throw new Error('Private backup replay is only available in local emulator-mode development.');
  }
  const localHeaders = isolated ? {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' http://127.0.0.1:8080 http://127.0.0.1:9099 ws://127.0.0.1:5173",
  } : {};
  return {
    plugins: [react(), tailwindcss(), {
      name: 'private-development-files',
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          let pathname: string;
          try { pathname = decodeURIComponent((req.url || '').split('?')[0]).replace(/\\/g, '/'); }
          catch { res.statusCode = 400; return res.end(); }
          if (/(?:^|\/)(?:server(?:\.[cm]?[jt]s)?|build|uploads|\.git)(?:\/|$)/i.test(pathname)
            || /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.npmrc|[^/]*(?:service-account|firebase-adminsdk|credentials)[^/]*\.json|[^/]+\.(?:pem|key|p12|pfx))$/i.test(pathname)) {
            res.statusCode = 404; return res.end();
          }
          next();
        });
      },
    }, ...(backupPath ? [{
      name: 'private-backup-replay',
      configureServer(server: any) {
        server.middlewares.use('/__test__/backup.json', (_req: any, res: any) => {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-WellsPrep-Test-Transport', 'memory');
          res.end(fs.readFileSync(backupPath));
        });
      },
    }] : []), ...(isolated ? [{
      name: 'isolated-development-api',
      configureServer(server: any) {
        server.middlewares.use('/api', (_req: any, res: any) => {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'External integrations are disabled in the synthetic environment.' }));
        });
      },
    }] : [])],
    resolve: {
      alias: [
        ...(backupPath ? [
          { find: /^firebase\/auth$/, replacement: path.resolve(__dirname, 'src/testing/replayAuth.ts') },
          { find: /^firebase\/firestore$/, replacement: path.resolve(__dirname, 'src/testing/replayFirestore.ts') },
        ] : []),
        { find: '@', replacement: path.resolve(__dirname, '.') },
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      headers: localHeaders,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx}', '**/.git/**', '**/.npmrc',
        '**/server.ts', '**/server/**', '**/build/**', '**/uploads/**', '**/api/**', '**/app/api/**',
        '**/*service-account*.json', '**/*firebase-adminsdk*.json', '**/credentials*.json'] },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    preview: { host: '127.0.0.1', port: 5173, strictPort: true, headers: localHeaders },
  };
});
