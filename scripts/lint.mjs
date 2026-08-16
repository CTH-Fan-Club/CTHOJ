import { readFileSync } from 'node:fs';
const files = ['apps/api/src/server.mjs', 'apps/web/public/app.js'];
const forbidden = [/console\.log\([^)]*password/i, /localStorage\.setItem\([^)]*token/i, /AI_API_KEY\s*=\s*['\"][^'\"]+/];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) if (rule.test(source)) throw new Error(`${file}: security lint rule failed: ${rule}`);
}
console.log('CTHOJ lint checks passed.');
