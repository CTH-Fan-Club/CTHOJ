import { spawnSync } from 'node:child_process';
const files = ['apps/api/src/server.mjs', 'apps/web/public/app.js', 'apps/worker/src/worker.mjs'];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('CTHOJ syntax/type boundary checks passed.');
