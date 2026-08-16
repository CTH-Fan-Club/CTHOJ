import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 3197;
const temp = mkdtempSync(join(tmpdir(), 'cthoj-test-'));
const child = spawn(process.execPath, ['apps/api/src/server.mjs'], { env: { ...process.env, PORT: String(port), DATA_FILE: join(temp, 'db.json'), DATA_LAB_DATA_DIR: join(temp, 'data-lab'), JWT_SECRET: 'test-secret', CTHOJ_ADMIN_PASSWORD: 'Admin123!', CTHOJ_DEMO_PASSWORD: 'Demo123!', JUDGE_PROVIDER: 'mock', TEST_DATA_MAX_BYTES: '80', AI_ENABLED: 'false', AI_BASE_URL: '', AI_API_KEY: '', AI_MODEL: '', AI_TIMEOUT_MS: '1800000', AI_TEST_TIMEOUT_MS: '1800000' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://127.0.0.1:${port}/api/v1`;
let cookie = '';
let adminCookie = '';
let customProblemId = '';

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try { const response = await fetch(`${base}/health`); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('test server did not start');
}

async function waitForSubmission(submissionId, authCookie = cookie) {
  const terminal = new Set(['Accepted', 'Wrong Answer', 'Compile Error', 'System Error', 'Time Limit Exceeded', 'Memory Limit Exceeded', 'Runtime Error']);
  let submission;
  for (let attempt = 0; attempt < 100; attempt++) {
    submission = (await (await fetch(`${base}/submissions/${submissionId}`, { headers: { cookie: authCookie } })).json()).submission;
    if (terminal.has(submission.status)) return submission;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`submission ${submissionId} did not finish`);
}

async function createContest(rule, problemIds, overrides = {}) {
  const response = await fetch(`${base}/contests`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: `${rule} Test Contest`, description: `${rule} rules`, rule, startsAt: new Date(Date.now() - 60_000).toISOString(), durationMinutes: 120, freezeMinutes: 0, problemIds, ...overrides }) });
  assert.equal(response.status, 201);
  return (await response.json()).contest;
}

async function submitContest(contestId, problemId, sourceCode) {
  const response = await fetch(`${base}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ contestId, problemId, language: 'cpp17', sourceCode }) });
  assert.equal(response.status, 202);
  return waitForSubmission((await response.json()).submission.id);
}

function minimalZip(name) {
  const entry = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30 + entry.length); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(entry.length, 26); local.writeUInt16LE(0, 28); entry.copy(local, 30);
  const central = Buffer.alloc(46 + entry.length); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(entry.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt32LE(0, 38); central.writeUInt32LE(0, 42); entry.copy(central, 46);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

test.before(async () => { await waitForServer(); });
test.after(() => { child.kill(); rmSync(temp, { recursive: true, force: true }); });

test('health and seeded problems are available', async () => {
  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.service, 'CTHOJ API');
  const problems = await (await fetch(`${base}/problems`)).json();
  assert.equal(problems.items.length, 3);
});

test('login issues an HttpOnly cookie and submission completes asynchronously', async () => {
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo', password: 'Demo123!' }) });
  assert.equal(login.status, 200); cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/i);
  const problems = await (await fetch(`${base}/problems`)).json();
  const created = await fetch(`${base}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ problemId: problems.items[0].id, language: 'cpp17', sourceCode: 'int main(){ return 0; }' }) });
  assert.equal(created.status, 202); const submission = (await created.json()).submission;
  let status = submission.status;
  for (let i = 0; i < 12 && !['Accepted', 'System Error'].includes(status); i++) { await new Promise((resolve) => setTimeout(resolve, 150)); status = (await (await fetch(`${base}/submissions/${submission.id}`, { headers: { cookie } })).json()).submission.status; }
  assert.equal(status, 'Accepted');
});

test('users can upload, retrieve and reset their own avatar', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const unauthorized = await fetch(`${base}/me/avatar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avatarData: `data:image/png;base64,${png}` }) });
  assert.equal(unauthorized.status, 401);
  const uploaded = await fetch(`${base}/me/avatar`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ avatarData: `data:image/png;base64,${png}` }) });
  assert.equal(uploaded.status, 200);
  const user = (await uploaded.json()).user;
  assert.match(user.avatarUrl, /^\/api\/v1\/users\/usr_demo\/avatar\?/);
  const avatar = await fetch(`http://127.0.0.1:${port}${user.avatarUrl}`);
  assert.equal(avatar.status, 200);
  assert.equal(avatar.headers.get('content-type'), 'image/png');
  const invalid = await fetch(`${base}/me/avatar`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ avatarData: 'data:image/png;base64,ZmFrZQ==' }) });
  assert.equal(invalid.status, 400);
  const reset = await fetch(`${base}/me/avatar`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ avatarData: null }) });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).user.avatarUrl, undefined);
});

test('users can register with validated credentials', async () => {
  const username = `user_${Date.now().toString(36)}`;
  const email = `${username}@example.test`;
  const response = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, displayName: '新用户', email, password: 'Register123!' }) });
  assert.equal(response.status, 201);
  const registered = await response.json();
  assert.equal(registered.user.username, username);
  assert.equal(registered.user.role, 'USER');
  assert.equal(registered.user.solved, 0);
  assert.equal(registered.user.rating, 1200);
  assert.equal(registered.user.passwordHash, undefined);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
  const ownSubmissions = await (await fetch(`${base}/submissions`, { headers: { cookie: response.headers.get('set-cookie') } })).json();
  assert.deepEqual(ownSubmissions.items, []);

  const duplicate = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, email, password: 'Register123!' }) });
  assert.equal(duplicate.status, 409);
  const weak = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `${username}x`, password: 'short' }) });
  assert.equal(weak.status, 400);
});

test('data lab is protected by RBAC', async () => {
  const response = await fetch(`${base}/admin/data-lab`, { headers: { cookie } });
  assert.equal(response.status, 403);
});

test('model API connectivity check is server-side and admin-only', async () => {
  const forbidden = await fetch(`${base}/admin/ai/test`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' }); assert.equal(forbidden.status, 403);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin123!' }) }); const admin = login.headers.get('set-cookie');
  const response = await fetch(`${base}/admin/ai/test`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: '{}' }); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.result.status, 'disabled'); assert.equal(payload.result.ok, false); assert.equal(payload.result.apiKey, undefined);
});

test('admin data lab runs isolated generator validator differential and shrink pipeline', async () => {
  const admin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin123!' }) }); adminCookie = admin.headers.get('set-cookie');
  const response = await fetch(`${base}/admin/data-lab/run`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: 'Pipeline', seed: 7, count: 2, sizeMode: 'exact', minSize: 2, maxSize: 8, density: 70, caseSizes: [2, 5], caseProfiles: ['corner-min', 'corner-duplicate'], generatorSource: '// LAB_GENERATOR', validatorSource: '// LAB_VALIDATOR', referenceSource: '// LAB_REFERENCE', bruteSource: '// LAB_BRUTE LAB_BUG' }) });
  assert.equal(response.status, 201); const run = (await response.json()).run;
  assert.equal(run.status, 'Completed'); assert.equal(run.report.generated, 2); assert.equal(run.report.outputs, 2); assert.equal(run.report.validated, 2); assert.equal(run.report.conflicts, 1); assert.ok(run.conflict?.minimized); assert.ok(run.cases.every(item => !('input' in item))); assert.ok(run.cases.every(item => item.outputFile && item.outputHash));
  assert.deepEqual(run.cases.map(item => item.plannedSize), [2, 5]); assert.equal(run.cornerCaseCount, 2);
  assert.equal(run.exportReady, true);
  const exported = await fetch(`${base}/admin/data-lab/${run.id}/export`, { headers: { cookie: adminCookie } });
  assert.equal(exported.status, 200); assert.equal(exported.headers.get('content-type'), 'application/zip');
  const archive = Buffer.from(await exported.arrayBuffer()); assert.ok(archive.includes(Buffer.from('manifest.json'))); assert.ok(archive.includes(Buffer.from('cases/case-001.in'))); assert.ok(archive.includes(Buffer.from('cases/case-001.out'))); assert.ok(archive.includes(Buffer.from('cthoj-data-lab-v2')));
  const runDirectory = join(temp, 'data-lab', run.id); assert.ok(existsSync(join(runDirectory, 'case-001.in'))); assert.ok(existsSync(join(runDirectory, 'case-001.out')));
  const deleted = await fetch(`${base}/admin/data-lab/${run.id}`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.equal(deleted.status, 200); assert.equal((await deleted.json()).deleted, run.id); assert.equal(existsSync(runDirectory), false);
  const missing = await fetch(`${base}/admin/data-lab/${run.id}`, { method: 'DELETE', headers: { cookie: adminCookie } }); assert.equal(missing.status, 404);
});

test('data lab exposes deterministic AI fallback, prompt versions and ZIP audit', async () => {
  const strategy = await fetch(`${base}/admin/data-lab/strategy`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: 'Fallback', statement: 'x', language: 'python3' }) });
  assert.equal(strategy.status, 200); const strategyPayload = (await strategy.json()).strategy; assert.equal(strategyPayload.available, false); assert.equal(strategyPayload.language, 'python3');
  const prompt = await fetch(`${base}/admin/data-lab/prompts`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ name: '测试版本', systemPrompt: '只返回 JSON' }) });
  assert.equal(prompt.status, 201); assert.equal((await prompt.json()).prompt.systemPrompt, undefined);
  const safe = await fetch(`${base}/admin/data-lab/zip-audit`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ zipBase64: minimalZip('cases/1.in').toString('base64') }) });
  assert.equal(safe.status, 200); assert.equal((await safe.json()).audit.safe, true);
  const unsafe = await fetch(`${base}/admin/data-lab/zip-audit`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ zipBase64: minimalZip('../escape.in').toString('base64') }) });
  assert.equal(unsafe.status, 200); assert.equal((await unsafe.json()).audit.safe, false);
});

test('only admins can create problems and hidden judge data stays private', async () => {
  const forbidden = await fetch(`${base}/problems`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'Denied', statement: 'Denied' }) });
  assert.equal(forbidden.status, 403);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin123!' }) });
  adminCookie = login.headers.get('set-cookie');
  const checkerSource = 'int main(){return 0;}';
  const created = await fetch(`${base}/problems`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: 'Custom Judge Test', slug: 'custom-judge-test', difficulty: '中等', tags: ['SPJ'], statement: 'Judge safely.', input: 'Input.', output: 'Output.', sampleInput: '1', sampleOutput: '1', judgeMode: 'custom', checkerSource, tests: [], published: false }) });
  assert.equal(created.status, 201);
  customProblemId = (await created.json()).problem.id;
  for (let index = 0; index < 11; index++) {
    const input = String(index); const expectedOutput = String(index); const body = Buffer.from(input + expectedOutput);
    const uploaded = await fetch(`${base}/problems/${customProblemId}/tests`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-cthoj-input-bytes': String(Buffer.byteLength(input)), cookie: adminCookie }, body });
    assert.equal(uploaded.status, 201);
  }
  const published = await fetch(`${base}/problems/${customProblemId}/publish`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ published: true }) });
  assert.equal(published.status, 200);
  const problem = (await published.json()).problem;
  assert.equal(problem.judgeMode, 'custom');
  assert.equal(problem.testCount, 12);
  assert.equal(problem.checkerSource, undefined);
  assert.equal(problem.tests, undefined);
  const detail = (await (await fetch(`${base}/problems/${customProblemId}`)).json()).problem;
  assert.equal(detail.checkerSource, undefined);
  assert.equal(detail.tests, undefined);
});

test('admins can control ordinary-user problem visibility', async () => {
  const slug = `visibility-${Date.now().toString(36)}`;
  const created = await fetch(`${base}/problems`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: 'Visibility Control Test', slug, statement: 'Hidden from ordinary users.', sampleInput: '1', sampleOutput: '1', tests: [], published: true, visibleToUsers: false }) });
  assert.equal(created.status, 201);
  const problem = (await created.json()).problem;
  assert.equal(problem.visibleToUsers, false);

  const ordinaryList = await (await fetch(`${base}/problems`, { headers: { cookie } })).json();
  assert.equal(ordinaryList.items.some(item => item.id === problem.id), false);
  const adminList = await (await fetch(`${base}/problems`, { headers: { cookie: adminCookie } })).json();
  assert.equal(adminList.items.some(item => item.id === problem.id), true);
  assert.equal((await fetch(`${base}/problems/${problem.id}`, { headers: { cookie } })).status, 404);
  assert.equal((await fetch(`${base}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ problemId: problem.id, language: 'cpp17', sourceCode: 'int main(){}' }) })).status, 404);

  const toggled = await fetch(`${base}/problems/${problem.id}/visibility`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ visibleToUsers: true }) });
  assert.equal(toggled.status, 200);
  assert.equal((await toggled.json()).problem.visibleToUsers, true);
  assert.equal((await fetch(`${base}/problems/${problem.id}`, { headers: { cookie } })).status, 200);
});

test('admins can send notifications to all or selected users', async () => {
  const forbidden = await fetch(`${base}/admin/notifications`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'Denied', content: 'Denied', audience: 'all' }) });
  assert.equal(forbidden.status, 403);

  const selected = await fetch(`${base}/admin/notifications`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: '指定通知', content: '只发给 demo', type: 'warning', audience: 'users', userIds: ['usr_demo'] }) });
  assert.equal(selected.status, 201);
  const selectedPayload = (await selected.json()).notification;
  assert.equal(selectedPayload.recipientCount, 1);
  let notifications = await (await fetch(`${base}/notifications`, { headers: { cookie } })).json();
  assert.equal(notifications.items.some(item => item.id === selectedPayload.id && item.title === '指定通知'), true);

  const all = await fetch(`${base}/admin/notifications`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: '全站通知', content: '所有用户可见', audience: 'all' }) });
  assert.equal(all.status, 201);
  const allPayload = (await all.json()).notification;
  notifications = await (await fetch(`${base}/notifications`, { headers: { cookie } })).json();
  assert.equal(notifications.items.some(item => item.id === allPayload.id), true);
  assert.ok(notifications.unread >= 2);

  const marked = await fetch(`${base}/notifications/${selectedPayload.id}/read`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
  assert.equal(marked.status, 200);
  assert.ok((await marked.json()).notification.readAt);
  const readAll = await fetch(`${base}/notifications/read-all`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
  assert.equal(readAll.status, 200);
  notifications = await (await fetch(`${base}/notifications`, { headers: { cookie } })).json();
  assert.equal(notifications.unread, 0);
});

test('hidden test data has a hard aggregate byte limit', async () => {
  const created = await fetch(`${base}/problems`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: 'Oversize Test', slug: 'oversize-test', statement: 'Limit.', sampleInput: '1', sampleOutput: '1', tests: [], published: false }) });
  const problem = (await created.json()).problem;
  const rejected = await fetch(`${base}/problems/${problem.id}/tests`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-cthoj-input-bytes': '1', cookie: adminCookie }, body: Buffer.alloc(79, 49) });
  assert.equal(rejected.status, 413);
  const discarded = await fetch(`${base}/problems/${problem.id}/discard`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.equal(discarded.status, 200);
});

test('multi-case special judge submissions report aggregate progress', async () => {
  const created = await fetch(`${base}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ problemId: customProblemId, language: 'cpp17', sourceCode: 'int main(){ return 0; }' }) });
  assert.equal(created.status, 202);
  const submission = (await created.json()).submission;
  let result = submission;
  for (let i = 0; i < 80 && !['Accepted', 'System Error'].includes(result.status); i++) { await new Promise((resolve) => setTimeout(resolve, 150)); result = (await (await fetch(`${base}/submissions/${submission.id}`, { headers: { cookie } })).json()).submission; }
  assert.equal(result.status, 'Accepted');
  assert.equal(result.testCount, 12);
  assert.equal(result.passedCount, 12);
  assert.equal(result.judgeMode, 'custom');
});

test('ACM contests apply 20-minute penalties and support freeze rollout', async () => {
  const problemId = (await (await fetch(`${base}/problems`)).json()).items[0].id;
  const forbiddenCreate = await fetch(`${base}/contests`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: 'Denied Contest' }) });
  assert.equal(forbiddenCreate.status, 403);
  const futureContest = await createContest('ACM', [problemId], { title: 'Future Contest', startsAt: new Date(Date.now() + 60 * 60_000).toISOString() });
  const futureDetailResponse = await fetch(`${base}/contests/${futureContest.id}`, { headers: { cookie } });
  assert.equal(futureDetailResponse.status, 200);
  const futureDetail = await futureDetailResponse.json();
  assert.equal(futureDetail.contest.problemsVisible, false);
  assert.equal(futureDetail.contest.problemIds, undefined);
  assert.deepEqual(futureDetail.problems, []);
  const hiddenScoreboard = await (await fetch(`${base}/contests/${futureContest.id}/scoreboard`, { headers: { cookie } })).json();
  assert.equal(hiddenScoreboard.scoreboard.problems[0].title, undefined);
  assert.equal(hiddenScoreboard.scoreboard.problems[0].id, undefined);
  const adminDetail = await (await fetch(`${base}/contests/${futureContest.id}`, { headers: { cookie: adminCookie } })).json();
  assert.equal(adminDetail.contest.problemsVisible, true);
  assert.deepEqual(adminDetail.contest.problemIds, [problemId]);
  assert.equal(adminDetail.problems[0].id, problemId);
  const earlySubmission = await fetch(`${base}/submissions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ contestId: futureContest.id, problemId, language: 'cpp17', sourceCode: 'int main(){return 0;}' }) });
  assert.equal(earlySubmission.status, 409);
  const contest = await createContest('ACM', [problemId]);
  const registered = await fetch(`${base}/contests/${contest.id}/register`, { method: 'POST', headers: { cookie } });
  assert.equal(registered.status, 200);
  const runningDetail = await (await fetch(`${base}/contests/${contest.id}`, { headers: { cookie } })).json();
  assert.equal(runningDetail.contest.problemsVisible, true);
  assert.deepEqual(runningDetail.contest.problemIds, [problemId]);
  assert.equal(runningDetail.problems[0].id, problemId);
  await submitContest(contest.id, problemId, 'wrong_answer');
  await submitContest(contest.id, problemId, 'int main(){return 0;}');
  let scoreboard = (await (await fetch(`${base}/contests/${contest.id}/scoreboard`)).json()).scoreboard;
  const row = scoreboard.rows.find((item) => item.username === 'demo');
  assert.equal(row.solved, 1);
  assert.equal(row.cells[0].wrongAttempts, 1);
  assert.ok(row.penalty >= 20);

  const frozen = await fetch(`${base}/contests/${contest.id}/freeze`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ frozen: true }) });
  assert.equal(frozen.status, 200);
  await submitContest(contest.id, problemId, 'wrong_answer after freeze');
  scoreboard = (await (await fetch(`${base}/contests/${contest.id}/scoreboard`)).json()).scoreboard;
  assert.equal(scoreboard.frozen, true);
  assert.equal(scoreboard.pendingCount, 1);
  assert.equal(scoreboard.rows[0].cells[0].pending, true);
  const rolled = await fetch(`${base}/contests/${contest.id}/roll`, { method: 'POST', headers: { cookie: adminCookie } });
  assert.equal(rolled.status, 200);
  const rollResult = await rolled.json();
  assert.ok(rollResult.reveal);
  assert.equal(rollResult.scoreboard.pendingCount, 0);
  assert.equal(rollResult.scoreboard.mode, 'final');
});

test('OI uses latest score while IOI keeps the best score', async () => {
  const createdProblem = await fetch(`${base}/problems`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ title: 'Partial Score Problem', slug: 'partial-score-problem', statement: 'Partial score.', sampleInput: 'pass', sampleOutput: 'ok', tests: [{ input: 'partial-fail', expectedOutput: 'bad' }], published: true }) });
  assert.equal(createdProblem.status, 201);
  const problemId = (await createdProblem.json()).problem.id;

  const oi = await createContest('OI', [problemId]);
  await fetch(`${base}/contests/${oi.id}/register`, { method: 'POST', headers: { cookie } });
  const oiFull = await submitContest(oi.id, problemId, 'int main(){return 0;}');
  const oiPartial = await submitContest(oi.id, problemId, 'partial_answer');
  assert.equal(oiFull.score, 100);
  assert.equal(oiPartial.score, 50);
  const oiBoard = (await (await fetch(`${base}/contests/${oi.id}/scoreboard`)).json()).scoreboard;
  assert.equal(oiBoard.rows.find((item) => item.username === 'demo').score, 50);

  const ioi = await createContest('IOI', [problemId]);
  await fetch(`${base}/contests/${ioi.id}/register`, { method: 'POST', headers: { cookie } });
  await submitContest(ioi.id, problemId, 'int main(){return 0;}');
  await submitContest(ioi.id, problemId, 'partial_answer');
  const ioiBoard = (await (await fetch(`${base}/contests/${ioi.id}/scoreboard`)).json()).scoreboard;
  assert.equal(ioiBoard.rows.find((item) => item.username === 'demo').score, 100);
});

test('malformed JSON returns a client error', async () => {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
});

test('problem comments support markdown, keyword moderation, AI scan controls, bans and role management', async () => {
  const problemId = (await (await fetch(`${base}/problems`)).json()).items[0].id;
  const posted = await fetch(`${base}/problems/${problemId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ content: '**有效讨论**：$a+b$ 的复杂度是 `O(1)`。\n\n- 支持 Markdown' }) });
  assert.equal(posted.status, 201);
  const comment = (await posted.json()).comment;
  assert.equal(comment.problemId, problemId);
  const listed = await (await fetch(`${base}/problems/${problemId}/comments`)).json();
  assert.ok(listed.items.some(item => item.id === comment.id));

  const moderationUpdate = await fetch(`${base}/admin/moderation`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ bannedWords: ['禁止词', 'scanbad'], aiBanKeywords: ['诈骗'], aiEnabled: false }) });
  assert.equal(moderationUpdate.status, 200);
  const blocked = await fetch(`${base}/problems/${problemId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ content: '这条包含禁止词，不应发布' }) });
  assert.equal(blocked.status, 422);
  const scanCandidate = await fetch(`${base}/problems/${problemId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ content: 'scanbad' }) });
  assert.equal(scanCandidate.status, 422);

  const settingsReset = await fetch(`${base}/admin/moderation`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ bannedWords: [], aiBanKeywords: ['诈骗'], aiEnabled: false }) });
  assert.equal(settingsReset.status, 200);
  const scanCandidateAllowed = await fetch(`${base}/problems/${problemId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ content: 'scanbad' }) });
  assert.equal(scanCandidateAllowed.status, 201);
  const scanCandidateId = (await scanCandidateAllowed.json()).comment.id;
  const settingsScan = await fetch(`${base}/admin/moderation`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ bannedWords: ['scanbad'], aiBanKeywords: [], aiEnabled: false }) });
  assert.equal(settingsScan.status, 200);
  const scan = await fetch(`${base}/admin/comments/scan`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: '{}' });
  assert.equal(scan.status, 200);
  assert.ok((await scan.json()).deleted >= 1);
  const deletedComments = await (await fetch(`${base}/admin/comments?includeDeleted=1`, { headers: { cookie: adminCookie } })).json();
  assert.ok(deletedComments.items.some(item => item.id === scanCandidateId && item.deletedAt));

  const username = `role_${Date.now().toString(36)}`;
  const targetRegistration = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'RoleTest123!' }) });
  assert.equal(targetRegistration.status, 201);
  const targetId = (await targetRegistration.json()).user.id;
  const granted = await fetch(`${base}/admin/users/${targetId}/role`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ role: 'ADMIN' }) });
  assert.equal(granted.status, 200);
  const deniedRevoke = await fetch(`${base}/admin/users/${targetId}/role`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ role: 'USER' }) });
  assert.equal(deniedRevoke.status, 403);
  const banned = await fetch(`${base}/admin/users/${targetId}/ban`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ durationDays: 1, reason: '测试封禁' }) });
  assert.equal(banned.status, 200);
  const bannedLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'RoleTest123!' }) });
  assert.equal(bannedLogin.status, 403);
  const unbanned = await fetch(`${base}/admin/users/${targetId}/ban`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.equal(unbanned.status, 200);
  const revoked = await fetch(`${base}/admin/users/${targetId}/role`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ role: 'USER' }) });
  assert.equal(revoked.status, 200);
  const deleted = await fetch(`${base}/comments/${comment.id}`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.equal(deleted.status, 200);
  await fetch(`${base}/admin/moderation`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ bannedWords: [], aiBanKeywords: [], aiEnabled: true }) });
});
