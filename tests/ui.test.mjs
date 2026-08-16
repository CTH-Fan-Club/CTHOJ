import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('login dialog close button bypasses validation and closes the dialog', () => {
  const html = readFileSync('apps/web/public/index.html', 'utf8');
  const script = readFileSync('apps/web/public/app.js', 'utf8');

  const closeButton = html.match(/<button[^>]*id="auth-close"[^>]*>/)?.[0] || '';
  assert.match(closeButton, /type="button"/);
  assert.doesNotMatch(closeButton, /type="submit"/);
  assert.match(script, /#auth-close[^\n]+authDialog\.close\(\)/);
});
