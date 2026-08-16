const content = document.querySelector('#app-content');
const authDialog = document.querySelector('#auth-dialog');
const userMenuButton = document.querySelector('#user-menu');
const userDropdown = document.querySelector('#user-dropdown');
const initialHashParts = location.hash.slice(1).split('/');
const state = { user: null, problems: [], submissions: [], notifications: [], notificationUnread: 0, view: initialHashParts[0] || 'dashboard', selectedProblem: null, selectedContest: null, selectedContestId: initialHashParts[0] === 'contest-scoreboard' ? initialHashParts[1] || null : null, activeContestId: null, health: null };
const defaultCheckerSource = String.raw`#include <bits/stdc++.h>
using namespace std;

string trimText(string value) {
  while (!value.empty() && isspace((unsigned char)value.back())) value.pop_back();
  size_t start = 0;
  while (start < value.size() && isspace((unsigned char)value[start])) start++;
  return value.substr(start);
}

bool accepted(const string& input, const string& expected, const string& actual) {
  return trimText(expected) == trimText(actual);
}

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  size_t inputSize, expectedSize, actualSize;
  if (!(cin >> inputSize >> expectedSize >> actualSize)) return 2;
  cin.get();
  string input(inputSize, '\0'), expected(expectedSize, '\0'), actual(actualSize, '\0');
  if (inputSize) cin.read(&input[0], inputSize);
  if (expectedSize) cin.read(&expected[0], expectedSize);
  if (actualSize) cin.read(&actual[0], actualSize);
  cout << (accepted(input, expected, actual) ? "AC" : "WA");
  return 0;
}
`;

const api = async (path, options = {}) => {
  const response = await fetch(`/api/v1${path}`, { credentials: 'include', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || '请求失败');
  return payload;
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function renderMath(value, display = false) {
  let html = escapeHtml(value).replace(/\\left|\\right/g, '');
  html = html.replace(/\\text\{([^{}]*)\}/g, '<span class="math-text">$1</span>');
  html = html.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="math-frac"><span>$1</span><span>$2</span></span>');
  html = html.replace(/\\sqrt\{([^{}]*)\}/g, '<span class="math-root">√<span>$1</span></span>');
  const symbols = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω', infty: '∞', le: '≤', ge: '≥', neq: '≠', approx: '≈', cdot: '·', times: '×', div: '÷', pm: '±', sum: '∑', prod: '∏', to: '→', rightarrow: '→', leftarrow: '←' };
  html = html.replace(/\\([a-zA-Z]+)/g, (match, name) => symbols[name] || match);
  html = html.replace(/\^(\{[^{}]*\}|[A-Za-z0-9+\-])/g, (_, token) => `<sup>${token.replace(/^\{|\}$/g, '')}</sup>`);
  html = html.replace(/_(\{[^{}]*\}|[A-Za-z0-9+\-])/g, (_, token) => `<sub>${token.replace(/^\{|\}$/g, '')}</sub>`);
  return display ? `<div class="math-display">${html}</div>` : `<span class="math-inline">${html}</span>`;
}

function renderInlineMarkdown(value) {
  let source = String(value);
  const tokens = [];
  const token = (html) => { const marker = `\u0000CTHOJ${tokens.length}\u0000`; tokens.push(html); return marker; };
  source = source.replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g, (_, display, inline, paren, bracket) => token(renderMath(display ?? inline ?? paren ?? bracket, Boolean(display || bracket))));
  let html = escapeHtml(source);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/_([^_\n]+)_/g, '<em>$1</em>');
  html = html.replace(/\u0000CTHOJ(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
  return html;
}

function renderRichText(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const output = []; let paragraph = []; let listItems = []; let list = null; let quote = [];
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { output.push(`<${list}>${listItems.map(renderInlineMarkdown).map(item => `<li>${item}</li>`).join('')}</${list}>`); listItems = []; list = null; } };
  const flushQuote = () => { if (quote.length) { flushParagraph(); output.push(`<blockquote>${quote.map(renderInlineMarkdown).join('<br>')}</blockquote>`); quote = []; } };
  let inCode = false; let code = [];
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; inCode = false; } else { flushParagraph(); flushList(); flushQuote(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const blockquote = line.match(/^\s*>\s?(.*)$/);
    if (heading) { flushParagraph(); flushList(); flushQuote(); output.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`); }
    else if (unordered || ordered) { flushQuote(); if (list && ((unordered && list !== 'ul') || (ordered && list !== 'ol'))) flushList(); list ||= unordered ? 'ul' : 'ol'; listItems.push((unordered || ordered)[1]); }
    else if (blockquote) { flushParagraph(); flushList(); quote.push(blockquote[1]); }
    else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flushParagraph(); flushList(); flushQuote(); output.push('<hr>'); }
    else if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); }
    else { flushQuote(); flushList(); paragraph.push(line); }
  }
  if (inCode) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushParagraph(); flushList(); flushQuote();
  return output.join('') || '<p></p>';
}

function toast(message) {
  const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2600);
}

function statusClass(status) { return String(status).split(' ')[0]; }

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><span class="eyebrow">CTH-OnlineJudge</span><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="button-row">${actions}</div></div>`;
}

async function bootstrap() {
  try {
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    document.querySelector('#account-note').textContent = localHost ? '开发账号：demo / Demo123!，管理员：admin / Admin123!' : '公网实例已禁用默认 Seed 密码，请使用服务器账号。';
    if (localHost) {
      document.querySelector('#login-form [name="username"]').value = 'demo';
      document.querySelector('#login-form [name="password"]').value = 'Demo123!';
    }
    const [me, problems, health] = await Promise.all([api('/me'), api('/problems'), api('/health')]);
    state.user = me.user; state.problems = problems.items; state.health = health;
    if (state.user) { try { state.submissions = (await api('/submissions')).items; } catch { state.submissions = []; } try { const notifications = await api('/notifications'); state.notifications = notifications.items; state.notificationUnread = notifications.unread; } catch { state.notifications = []; state.notificationUnread = 0; } }
    document.querySelector('#judge-provider').textContent = health.judgeProvider === 'judge0' ? 'Judge0 已配置' : '开发 Mock 判题';
    updateUser(); navigate(state.view);
  } catch (error) { content.innerHTML = `<div class="empty-state"><strong>CTHOJ API 暂不可用</strong>${escapeHtml(error.message)}</div>`; }
}

function updateUser() {
  const displayName = state.user?.displayName || '访客';
  const avatarText = displayName.slice(0, 1).toUpperCase();
  document.querySelector('#user-name').textContent = displayName;
  document.querySelector('#user-role').textContent = state.user ? roleLabel(state.user.role) : '点击登录';
  document.querySelector('#avatar').innerHTML = avatarMarkup(state.user, avatarText);
  document.querySelector('#menu-avatar').innerHTML = avatarMarkup(state.user, avatarText);
  document.querySelector('#menu-user-name').textContent = displayName;
  document.querySelector('#menu-user-handle').textContent = state.user ? `@${state.user.username}` : '未登录';
  userMenuButton.setAttribute('aria-label', state.user ? `账户菜单：${displayName}` : '登录');
  document.body.classList.toggle('is-admin', ['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role));
  updateNotificationBadge();
  setUserMenu(false);
}

function avatarMarkup(user, fallback = '?') { return user?.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" alt="头像">` : escapeHtml(fallback); }
async function prepareAvatar(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 8 * 1024 * 1024) throw new Error('原始图片不能超过 8MB');
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); const side = 256; const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side; const context = canvas.getContext('2d'); const scale = Math.max(side / image.width, side / image.height); const width = image.width * scale; const height = image.height * scale; context.drawImage(image, (side - width) / 2, (side - height) / 2, width, height); canvas.toBlob(blob => { if (!blob) { reject(new Error('图片处理失败')); return; } const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(blob); }, 'image/webp', 0.82); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); }; image.src = url;
  });
}
async function uploadAvatar(event) { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; try { const avatarData = await prepareAvatar(file); const result = await api('/me/avatar', { method: 'POST', body: JSON.stringify({ avatarData }) }); state.user = result.user; updateUser(); toast('头像已更新'); renderProfile(); } catch (error) { toast(error.message); } finally { input.value = ''; } }
async function resetAvatar() { try { const result = await api('/me/avatar', { method: 'POST', body: JSON.stringify({ avatarData: null }) }); state.user = result.user; updateUser(); toast('已恢复默认头像'); renderProfile(); } catch (error) { toast(error.message); } }

function updateNotificationBadge() { const dot = document.querySelector('#notification-dot'); const button = document.querySelector('#notification-button'); if (!dot || !button) return; dot.hidden = !state.user || state.notificationUnread < 1; button.setAttribute('aria-label', state.user ? `通知${state.notificationUnread ? `，${state.notificationUnread} 条未读` : ''}` : '登录后查看通知'); }
function notificationTypeLabel(type) { return ({ info: '通知', success: '完成', warning: '提醒', system: '系统' })[type] || '通知'; }
function renderNotificationItems() { if (!state.user) return '<div class="notification-empty">登录后查看通知</div>'; if (!state.notifications.length) return '<div class="notification-empty">暂无通知</div>'; return state.notifications.map(item => `<button class="notification-item ${item.readAt ? '' : 'unread'}" data-notification-id="${escapeHtml(item.id)}"><span class="notification-item-head"><strong>${escapeHtml(item.title)}</strong><small>${notificationTypeLabel(item.type)} · ${new Date(item.createdAt).toLocaleString()}</small></span><span>${escapeHtml(item.content)}</span></button>`).join(''); }
function renderNotificationDropdown() { const dropdown = document.querySelector('#notification-dropdown'); if (!dropdown) return; dropdown.innerHTML = `<div class="notification-head"><strong>通知</strong><button class="text-button" id="mark-all-notifications">全部已读</button></div><div class="notification-list">${renderNotificationItems()}</div>`; dropdown.querySelector('#mark-all-notifications')?.addEventListener('click', markAllNotificationsRead); dropdown.querySelectorAll('[data-notification-id]').forEach(item => item.addEventListener('click', () => markNotificationRead(item.dataset.notificationId))); }
function setNotificationMenu(open) { const dropdown = document.querySelector('#notification-dropdown'); const button = document.querySelector('#notification-button'); if (!dropdown || !button) return; dropdown.hidden = !open; button.setAttribute('aria-expanded', String(open)); if (open) renderNotificationDropdown(); }
async function loadNotifications() { if (!state.user) return; const result = await api('/notifications'); state.notifications = result.items; state.notificationUnread = result.unread; updateNotificationBadge(); }
async function markNotificationRead(notificationId) { try { await api(`/notifications/${notificationId}/read`, { method: 'PATCH', body: '{}' }); const item = state.notifications.find(notification => notification.id === notificationId); if (item && !item.readAt) { item.readAt = new Date().toISOString(); state.notificationUnread = Math.max(0, state.notificationUnread - 1); } updateNotificationBadge(); renderNotificationDropdown(); } catch (error) { toast(error.message); } }
async function markAllNotificationsRead(event) { event?.preventDefault(); try { await api('/notifications/read-all', { method: 'PATCH', body: '{}' }); state.notifications.forEach(item => { item.readAt ||= new Date().toISOString(); }); state.notificationUnread = 0; updateNotificationBadge(); renderNotificationDropdown(); } catch (error) { toast(error.message); } }

function roleLabel(role) { return ({ USER: '普通用户', SETTER: '出题人', ADMIN: '管理员', SUPER_ADMIN: '超级管理员' })[role] || role || '普通用户'; }
function judgeModeLabel(mode) { return ({ exact: '精确匹配', tokens: '忽略空白', float: '浮点误差', custom: 'Special Judge' })[mode] || '精确匹配'; }

function setUserMenu(open) {
  const visible = Boolean(open && state.user);
  userDropdown.hidden = !visible;
  userMenuButton.classList.toggle('open', visible);
  userMenuButton.setAttribute('aria-expanded', String(visible));
}

function navigate(view) {
  state.view = view; location.hash = view === 'contest-scoreboard' && state.selectedContestId ? `${view}/${state.selectedContestId}` : view;
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelector('.sidebar').classList.remove('open');
  setUserMenu(false);
  const views = { dashboard: renderDashboard, problems: renderProblems, submissions: renderSubmissions, contests: renderContests, 'contest-scoreboard': renderContestScoreboardPage, leaderboard: renderLeaderboard, skills: renderSkills, profile: renderProfile, 'problem-admin': renderProblemAdmin, 'contest-admin': renderContestAdmin, 'notifications-admin': renderNotificationAdmin, moderation: renderModerationAdmin, datalab: renderDataLab };
  (views[view] || renderDashboard)();
}

function personalSubmissions() { return state.user ? state.submissions.filter(item => item.userId === state.user.id) : []; }
function dateKey(value = Date.now()) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function solvedProblemCount(submissions) { return new Set(submissions.filter(item => item.status === 'Accepted' || Number(item.score) === 100).map(item => item.problemId)).size; }
function trainingStreak(submissions) { const days = new Set(submissions.map(item => dateKey(item.createdAt))); if (!days.size) return 0; let streak = 0; const cursor = new Date(); while (days.has(dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); } return streak; }

function renderDashboard() {
  const personal = personalSubmissions(); const today = personal.filter(item => dateKey(item.createdAt) === dateKey()).length; const solved = solvedProblemCount(personal); const rating = state.user?.rating ?? 1200; const streak = trainingStreak(personal);
  content.innerHTML = `${pageHead(`欢迎回来，${escapeHtml(state.user?.displayName || '算法训练者')}`, '保持节奏，用可靠反馈积累真正的解题能力。', '<button class="primary-button" data-go="problems">开始刷题 →</button>')}
    <div class="stats-grid">
      ${stat('今日提交', state.user ? today : '—', today ? `${today} 次提交` : '暂无提交', '↗')}
      ${stat('已解决题目', solved, `题库共 ${state.problems.length} 题`, '✓')}
      ${stat('当前 Rating', rating, state.user ? (personal.length ? '根据账户表现计算' : '初始 Rating') : '登录后查看', '◇')}
      ${stat('连续训练', state.user ? `${streak} 天` : '—', streak ? '保持训练节奏' : '尚未开始训练', '◷')}
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><h2>近 7 天训练趋势</h2><button class="text-button" data-go="submissions">查看提交</button></div>${activityChart(personal)}</section>
      <section class="panel"><div class="panel-head"><h2>能力分布</h2><button class="text-button" data-go="skills">完整画像</button></div>${skillRows(personal)}</section>
      <section class="panel"><div class="panel-head"><h2>推荐练习</h2><span class="tag">规则引擎推荐</span></div>${state.problems.slice(0,3).map(problemRow).join('')}</section>
      <section class="panel"><div class="panel-head"><h2>即将开始</h2><button class="text-button" data-go="contests">全部比赛</button></div><div class="contest-list"><div><span class="status-pill Running">报名中</span><h3 style="margin:10px 0 5px">CTHOJ 春季热身赛</h3><p class="subtitle">8 月 20 日 19:00 · 120 分钟</p></div></div></section>
    </div>`;
  bindActions();
}

function stat(label, value, delta, icon) { return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="delta neutral">${delta}</div></div>`; }
function activityChart(submissions = []) {
  if (!submissions.length) return '<div class="empty-state compact"><strong>暂无训练数据</strong>完成第一次提交后显示近 7 天趋势。</div>';
  const now = new Date(); const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(now); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index)); return date; });
  const values = days.map(date => { const key = dateKey(date); const items = submissions.filter(item => dateKey(item.createdAt) === key); return [items.filter(item => item.status === 'Accepted' || Number(item.score) === 100).length, items.length]; }); const max = Math.max(1, ...values.map(item => item[1]));
  return `<div class="activity-chart">${values.map((value, index) => `<div class="bar-group"><i class="bar" style="height:${Math.max(6, Math.round(value[0] / max * 84))}%"></i><i class="bar attempt" style="height:${Math.max(6, Math.round(value[1] / max * 84))}%"></i><small>${['一','二','三','四','五','六','日'][days[index].getDay() === 0 ? 6 : days[index].getDay() - 1]}</small></div>`).join('')}</div><div class="chart-legend"><span>通过</span><span>尝试</span></div>`;
}
const skillDefinitions = [['基础算法', ['基础', '模拟', '算法']], ['数据结构', ['数组', '哈希', '数据结构']], ['动态规划', ['动态规划', 'DP']], ['图论', ['图论', '最短路', '图']], ['数学', ['数学', '数论']]];
function skillValues(submissions = []) { return skillDefinitions.map(([, tags]) => { const relevant = submissions.filter(item => { const problem = state.problems.find(candidate => candidate.id === item.problemId); return problem?.tags?.some(tag => tags.some(keyword => tag.includes(keyword))); }); const attempted = new Set(relevant.map(item => item.problemId)).size; const solved = new Set(relevant.filter(item => item.status === 'Accepted' || Number(item.score) === 100).map(item => item.problemId)).size; return attempted ? Math.round(solved / attempted * 100) : 0; }); }
function skillRows(submissions = []) { const values = skillValues(submissions); return skillDefinitions.map(([name], index) => `<div class="skill-row"><span>${name}</span><div class="meter"><i style="width:${values[index]}%"></i></div><b>${values[index]}</b></div>`).join(''); }
function problemRow(problem) { return `<div style="display:flex;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid var(--line)"><span class="difficulty ${problem.difficulty}">${problem.number}</span><div style="min-width:0;flex:1"><button class="text-button problem-title" data-problem="${problem.id}">${escapeHtml(problem.title)}</button><div>${problem.tags.map(tag=>`<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></div><span class="difficulty ${problem.difficulty}">${problem.difficulty}</span></div>`; }

function renderProblems() {
  content.innerHTML = `${pageHead('题库', '按难度和知识点筛选，选择一道题开始训练。')}
    <section class="table-panel"><div class="filters"><input id="problem-search" placeholder="搜索标题或标签"><select id="difficulty-filter"><option>全部</option><option>入门</option><option>简单</option><option>中等</option><option>困难</option></select></div><div id="problem-table"></div></section>`;
  drawProblemTable(state.problems);
  document.querySelector('#problem-search').addEventListener('input', filterProblems);
  document.querySelector('#difficulty-filter').addEventListener('change', filterProblems);
}

function filterProblems() { const q = document.querySelector('#problem-search').value.toLowerCase(); const d = document.querySelector('#difficulty-filter').value; drawProblemTable(state.problems.filter(p => (!q || p.title.toLowerCase().includes(q) || p.tags.join(' ').toLowerCase().includes(q)) && (d === '全部' || p.difficulty === d))); }
function drawProblemTable(problems) { const admin = ['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role); document.querySelector('#problem-table').innerHTML = problems.length ? `<table><thead><tr><th>编号</th><th>题目</th><th>难度</th><th>通过率</th><th>限制</th>${admin ? '<th>普通用户可见</th>' : ''}</tr></thead><tbody>${problems.map(p=>`<tr><td>${p.number}</td><td><button class="text-button problem-title" data-problem="${p.id}">${escapeHtml(p.title)}</button><div>${p.tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}${!p.published ? '<span class="tag">草稿</span>' : ''}</div></td><td><span class="difficulty ${p.difficulty}">${p.difficulty}</span></td><td>${p.acceptance}%</td><td>${p.timeLimit} ms / ${p.memoryLimit} MB</td>${admin ? `<td><button class="text-button toggle-problem-visibility" data-problem-id="${escapeHtml(p.id)}" data-visible="${p.visibleToUsers !== false}">${p.visibleToUsers !== false ? '可见' : '隐藏'}</button></td>` : ''}</tr>`).join('')}</tbody></table>` : '<div class="empty-state"><strong>没有匹配的题目</strong>调整筛选条件后重试。</div>'; bindActions(); document.querySelectorAll('.toggle-problem-visibility').forEach(button => button.addEventListener('click', toggleProblemVisibility)); }

async function toggleProblemVisibility(event) { const button = event.currentTarget; button.disabled = true; try { const { problem } = await api(`/problems/${button.dataset.problemId}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibleToUsers: button.dataset.visible !== 'true' }) }); const target = state.problems.find(item => item.id === problem.id); if (target) Object.assign(target, problem); toast(problem.visibleToUsers ? '题目已对普通用户开放' : '题目已对普通用户隐藏'); if (state.view === 'problems') drawProblemTable(state.problems); else renderProblemAdmin(); } catch (error) { toast(error.message); button.disabled = false; } }

function commentCard(comment) { const canDelete = state.user && (state.user.id === comment.userId || ['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user.role)); return `<article class="comment-card"><div class="comment-head"><div><strong>${escapeHtml(comment.displayName || comment.username)}</strong><small>@${escapeHtml(comment.username)} · ${new Date(comment.createdAt).toLocaleString()}</small></div>${canDelete ? `<button class="text-button comment-delete" data-delete-comment="${escapeHtml(comment.id)}">删除</button>` : ''}</div><div class="comment-body rich-text">${renderRichText(comment.content)}</div></article>`; }
function commentsSection(problemId, comments) { const composer = state.user ? '<form id="comment-form" class="comment-form"><label class="form-field"><span>发表评论</span><textarea name="content" rows="5" maxlength="5000" placeholder="支持 Markdown 和 LaTeX"></textarea></label><div class="comment-preview rich-text" id="comment-preview"><span class="subtitle">输入内容后预览</span></div><div class="problem-form-actions"><span class="form-error" id="comment-error"></span><button class="primary-button" type="submit">发布评论</button></div></form>' : '<div class="empty-state compact"><strong>登录后参与讨论</strong><button class="primary-button" data-login>登录</button></div>'; return `<section class="table-panel comments-panel"><div class="section-heading"><div><h2>题目讨论</h2><p>${comments.length} 条公开评论</p></div></div>${composer}<div class="comments-list">${comments.length ? comments.map(commentCard).join('') : '<div class="empty-state compact"><strong>暂无评论</strong>成为第一个参与讨论的人。</div>'}</div></section>`; }

async function postComment(problemId, event) { event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); const error = form.querySelector('#comment-error'); button.disabled = true; error.textContent = ''; try { await api(`/problems/${problemId}/comments`, { method: 'POST', body: JSON.stringify({ content: form.elements.content.value }) }); toast('评论已发布'); await openProblem(problemId, state.activeContestId); } catch (submitError) { error.textContent = submitError.message; button.disabled = false; } }
async function deleteComment(commentId, problemId) { try { await api(`/comments/${commentId}`, { method: 'DELETE' }); toast('评论已删除'); await openProblem(problemId, state.activeContestId); } catch (error) { toast(error.message); } }

async function openProblem(problemId, contestId = null) {
  const [{ problem }, { items: comments }] = await Promise.all([api(`/problems/${problemId}`), api(`/problems/${problemId}/comments`)]); state.selectedProblem = problem; state.activeContestId = contestId;
  const backAction = contestId ? `<button class="secondary-button" data-contest="${escapeHtml(contestId)}">← 返回比赛</button>` : '<button class="secondary-button" data-go="problems">← 返回题库</button>';
  content.innerHTML = `${pageHead(`${problem.number}. ${escapeHtml(problem.title)}`, `${problem.difficulty} · ${problem.tags.map(escapeHtml).join(' / ')} · ${judgeModeLabel(problem.judgeMode)} · ${problem.testCount || 1} 个测试点`, backAction)}
    <div class="split-view"><article class="panel statement rich-text">${renderRichText(problem.statement)}<div class="statement-section"><h3>输入格式</h3>${renderRichText(problem.input)}</div><div class="statement-section"><h3>输出格式</h3>${renderRichText(problem.output)}</div><div class="statement-section"><h3>样例输入</h3><div class="sample">${escapeHtml(problem.sampleInput)}</div><h3 style="margin-top:14px">样例输出</h3><div class="sample">${escapeHtml(problem.sampleOutput)}</div></div></article>
    <section class="editor-shell"><div class="editor-toolbar"><select id="language"><option value="cpp17">C++ 17</option><option value="cpp20">C++ 20</option><option value="python3">Python 3</option><option value="java17">Java 17</option></select><div class="button-row"><button class="secondary-button" id="reset-code">重置</button><button class="primary-button" id="submit-code">提交评测</button></div></div><textarea id="source-code" spellcheck="false">${escapeHtml(defaultCode('cpp17', problem))}</textarea><div class="editor-foot"><span id="editor-status">未提交</span><span>${problem.timeLimit} ms · ${problem.memoryLimit} MB</span></div></section></div>${commentsSection(problem.id, comments)}`;
  bindActions();
  document.querySelector('#language').addEventListener('change', (event) => { document.querySelector('#source-code').value = defaultCode(event.target.value, problem); });
  document.querySelector('#reset-code').addEventListener('click', () => { document.querySelector('#source-code').value = defaultCode(document.querySelector('#language').value, problem); });
  document.querySelector('#submit-code').addEventListener('click', submitCode);
  document.querySelector('#comment-form')?.addEventListener('submit', event => postComment(problem.id, event));
  document.querySelector('#comment-form textarea')?.addEventListener('input', event => { document.querySelector('#comment-preview').innerHTML = event.target.value.trim() ? renderRichText(event.target.value) : '<span class="subtitle">输入内容后预览</span>'; });
  document.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', () => deleteComment(button.dataset.deleteComment, problem.id)));
}

function defaultCode(language, problem) { if (language === 'python3') return `# ${problem.title}\na, b = map(int, input().split())\nprint(a + b)\n`; if (language === 'java17') return `import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    System.out.println(in.nextLong() + in.nextLong());\n  }\n}\n`; return `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  ios::sync_with_stdio(false);\n  cin.tie(nullptr);\n  long long a, b;\n  cin >> a >> b;\n  cout << a + b << '\\n';\n  return 0;\n}\n`; }

async function submitCode() {
  if (!state.user) { authDialog.showModal(); return; }
  const button = document.querySelector('#submit-code'); button.disabled = true; button.textContent = '排队中…';
  try {
    const payload = await api('/submissions', { method: 'POST', body: JSON.stringify({ problemId: state.selectedProblem.id, contestId: state.activeContestId, language: document.querySelector('#language').value, sourceCode: document.querySelector('#source-code').value }) });
    const submission = payload.submission; document.querySelector('#editor-status').textContent = `#${submission.id.slice(-8)} · ${submission.status}`;
    pollSubmission(submission.id);
  } catch (error) { toast(error.message); button.disabled = false; button.textContent = '提交评测'; }
}

async function pollSubmission(id) { let finished = false; while (!finished) { await new Promise(r=>setTimeout(r,500)); try { const { submission } = await api(`/submissions/${id}`); const existing = state.submissions.findIndex(item => item.id === id); if (existing >= 0) state.submissions[existing] = submission; else state.submissions.unshift(submission); const progress = submission.testCount ? `${submission.passedCount || 0}/${submission.testCount} 测试点 · ` : ''; document.querySelector('#editor-status').textContent = `${submission.status} · ${progress}${submission.time || 0} ms`; finished = ['Accepted','Wrong Answer','Compile Error','System Error','Time Limit Exceeded','Memory Limit Exceeded','Runtime Error'].includes(submission.status); if (finished) { toast(`评测完成：${submission.status}`); const button = document.querySelector('#submit-code'); if (button) { button.disabled = false; button.textContent = '再次提交'; } } } catch { finished = true; } } }

async function renderSubmissions() {
  content.innerHTML = pageHead('提交记录', '实时追踪编译、运行和评测结果。') + '<section class="table-panel"><div class="empty-state">正在加载…</div></section>';
  try { const { items } = await api('/submissions'); state.submissions = items; document.querySelector('.table-panel').innerHTML = items.length ? `<table><thead><tr><th>提交</th><th>题目</th><th>用户</th><th>语言</th><th>状态</th><th>测试点</th><th>时间 / 内存</th><th>提交时间</th></tr></thead><tbody>${items.map(s=>`<tr><td>${s.id.slice(-8)}</td><td>${escapeHtml(s.problemTitle)}</td><td>${escapeHtml(s.username)}</td><td>${s.language}</td><td><span class="status-pill ${statusClass(s.status)}">${s.status}</span></td><td>${s.testCount ? `${s.passedCount || 0} / ${s.testCount}` : '—'}</td><td>${s.time || 0} ms / ${Math.round((s.memory || 0)/1024)} MB</td><td>${new Date(s.createdAt).toLocaleString()}</td></tr>`).join('')}</tbody></table>` : '<div class="empty-state"><strong>暂无提交</strong>从题库选择一道题开始。</div>'; } catch (error) { document.querySelector('.table-panel').innerHTML = `<div class="empty-state"><strong>无法加载</strong>${escapeHtml(error.message)}</div>`; }
}

function contestStatusLabel(status) { return ({ Upcoming: '即将开始', Running: '进行中', Ended: '已结束' })[status] || status; }
function contestStatusClass(status) { return status === 'Ended' ? 'Completed' : 'Running'; }
function contestRuleLabel(rule) { return ({ ACM: 'ACM 赛制', OI: 'OI 赛制', IOI: 'IOI 赛制' })[rule] || rule; }
function contestTimeText(contest) { return `${new Date(contest.startsAt).toLocaleString()} - ${new Date(contest.endsAt).toLocaleString()} · ${contest.durationMinutes} 分钟`; }
function dateTimeLocalValue(value) { const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }

async function renderContests() {
  const { items } = await api('/contests');
  const actions = ['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role) ? '<button class="primary-button" data-go="contest-admin">管理比赛</button>' : '';
  content.innerHTML = `${pageHead('比赛', '参加定时比赛并查看实时排名。', actions)}<div class="contest-list">${items.length ? items.map(contest => `<article class="contest-row"><div><div class="button-row"><span class="status-pill ${contestStatusClass(contest.status)}">${contestStatusLabel(contest.status)}</span><span class="tag">${contestRuleLabel(contest.rule)}</span>${contest.scoreboardMode === 'frozen' || contest.scoreboardMode === 'rolling' ? '<span class="tag freeze-tag">榜单已封</span>' : ''}</div><h3>${escapeHtml(contest.title)}</h3><p>${contestTimeText(contest)} · ${contest.problemCount} 题</p></div><strong>${contest.participantCount}<small>参赛人数</small></strong><div class="button-row"><button class="secondary-button" data-contest-scoreboard="${escapeHtml(contest.id)}">查看榜单</button><button class="secondary-button" data-contest="${escapeHtml(contest.id)}">进入比赛</button></div></article>`).join('') : '<div class="empty-state"><strong>暂无比赛</strong>等待管理员发布比赛。</div>'}</div>`;
  bindActions();
}

function scoreboardCell(cell, rule) {
  if (rule === 'ACM') {
    if (cell.solved) return `<span class="score-cell solved">+${cell.wrongAttempts || ''}</span>`;
    if (cell.pending) return '<span class="score-cell pending">?</span>';
    return cell.wrongAttempts ? `<span class="score-cell failed">-${cell.wrongAttempts}</span>` : '<span class="score-cell">·</span>';
  }
  if (cell.pending) return `<span class="score-cell pending">${cell.score || 0}?</span>`;
  return `<span class="score-cell ${cell.score === 100 ? 'solved' : cell.score ? 'partial' : ''}">${cell.submitted ? cell.score : '·'}</span>`;
}

function renderContestScoreboard(scoreboard) {
  const totalTitle = scoreboard.rule === 'ACM' ? '解题' : '总分';
  return `<div class="scoreboard-meta"><span class="tag">${contestRuleLabel(scoreboard.rule)}</span>${scoreboard.frozen ? `<span class="tag freeze-tag">封榜中 · ${scoreboard.pendingCount} 条待滚</span>` : '<span class="tag">榜单公开</span>'}</div><div class="profile-table-wrap"><table class="scoreboard-table"><thead><tr><th>排名</th><th>参赛者</th>${scoreboard.problems.map(problem => `<th${problem.title ? ` title="${escapeHtml(problem.title)}"` : ''}>${problem.label}</th>`).join('')}<th>${totalTitle}</th><th>罚时/用时</th></tr></thead><tbody>${scoreboard.rows.length ? scoreboard.rows.map(row => `<tr><td><strong>${row.rank}</strong></td><td><strong>${escapeHtml(row.displayName)}</strong><small>@${escapeHtml(row.username)}</small></td>${row.cells.map(cell => `<td>${scoreboardCell(cell, scoreboard.rule)}</td>`).join('')}<td><strong>${scoreboard.rule === 'ACM' ? row.solved : row.score}</strong></td><td>${row.penalty} 分钟</td></tr>`).join('') : `<tr><td colspan="${scoreboard.problems.length + 4}">暂无排名数据</td></tr>`}</tbody></table></div>`;
}

async function openContest(contestId) {
  try {
    const [{ contest, problems }, { scoreboard }] = await Promise.all([api(`/contests/${contestId}`), api(`/contests/${contestId}/scoreboard`)]);
    state.selectedContest = contest;
    const admin = ['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role);
    let primaryAction = '';
    if (!state.user) primaryAction = '<button class="primary-button" data-login>登录后报名</button>';
    else if (!contest.registered && contest.canRegister && !admin) primaryAction = `<button class="primary-button" id="register-contest">报名比赛</button>`;
    else if (contest.registered) primaryAction = '<span class="status-pill Accepted">已报名</span>';
    const adminActions = admin ? `<button class="secondary-button" data-go="contest-admin">管理设置</button>${contest.scoreboardMode === 'live' ? '<button class="secondary-button" id="contest-freeze">立即封榜</button>' : '<button class="secondary-button" id="contest-unfreeze">解除封榜</button>'}${['frozen', 'rolling'].includes(contest.scoreboardMode) ? '<button class="primary-button" id="contest-roll">滚榜下一条</button>' : ''}` : '';
    const myRow = scoreboard.rows.find(row => row.userId === state.user?.id);
    const problemsSection = contest.problemsVisible
      ? `<section class="table-panel contest-problems"><div class="section-heading"><div><h2>比赛题目</h2><p>${contest.canSubmit ? '比赛进行中' : contest.status === 'Upcoming' ? '比赛开始后可提交' : '比赛已结束'}</p></div></div><div class="profile-table-wrap"><table><thead><tr><th>题号</th><th>题目</th><th>状态/得分</th><th></th></tr></thead><tbody>${problems.map((problem, index) => { const cell = myRow?.cells.find(item => item.problemId === problem.id); return `<tr><td><strong>${contestProblemLabelClient(index)}</strong></td><td>${escapeHtml(problem.title)}</td><td>${cell ? scoreboardCell(cell, contest.rule) : '—'}</td><td>${contest.canSubmit ? `<button class="text-button" data-contest-problem="${problem.id}">打开题目</button>` : '<span class="tag">不可提交</span>'}</td></tr>`; }).join('')}</tbody></table></div></section>`
      : `<section class="table-panel contest-problems"><div class="section-heading"><div><h2>比赛题目</h2><p>比赛开始后向已报名用户公布</p></div></div><div class="empty-state compact"><strong>题目暂未公布</strong>管理员可以提前查看和管理比赛题目。</div></section>`;
    content.innerHTML = `${pageHead(escapeHtml(contest.title), `${contestRuleLabel(contest.rule)} · ${contestTimeText(contest)}`, `<button class="secondary-button" data-go="contests">← 比赛列表</button><button class="secondary-button" data-contest-scoreboard="${escapeHtml(contest.id)}">独立榜单</button>`)}
      <section class="contest-hero"><div><div class="button-row"><span class="status-pill ${contestStatusClass(contest.status)}">${contestStatusLabel(contest.status)}</span><span class="tag">${contest.problemCount} 题</span><span class="tag">${contest.participantCount} 人</span>${contest.freezeAt ? `<span class="tag">封榜 ${new Date(contest.freezeAt).toLocaleTimeString()}</span>` : ''}</div><p>${escapeHtml(contest.description || '暂无比赛说明')}</p></div><div class="button-row">${primaryAction}${adminActions}</div></section>
      <div class="contest-summary">${stat(contest.rule === 'ACM' ? '我的解题数' : '我的得分', myRow ? (contest.rule === 'ACM' ? myRow.solved : myRow.score) : '—', myRow ? `当前排名 #${myRow.rank}` : '尚无比赛提交', '◎')}${stat('比赛状态', contestStatusLabel(contest.status), contest.scoreboardMode === 'frozen' || contest.scoreboardMode === 'rolling' ? '榜单已封' : '榜单公开', '◷')}${stat('结束时间', new Date(contest.endsAt).toLocaleTimeString(), `${contest.durationMinutes} 分钟`, '⌛')}</div>
      ${problemsSection}
      <section class="table-panel contest-scoreboard"><div class="section-heading"><div><h2>比赛榜单</h2><p>${scoreboard.frozen ? '封榜后的提交将在滚榜时依次公开' : '排名随完成评测的提交更新'}</p></div><button class="text-button" id="refresh-scoreboard">刷新榜单</button></div><div id="contest-scoreboard-body">${renderContestScoreboard(scoreboard)}</div></section>`;
    bindActions();
    document.querySelectorAll('[data-contest-problem]').forEach(button => button.addEventListener('click', () => openProblem(button.dataset.contestProblem, contest.id)));
    document.querySelector('#register-contest')?.addEventListener('click', async () => { await api(`/contests/${contest.id}/register`, { method: 'POST' }); toast('报名成功'); await openContest(contest.id); });
    document.querySelector('#refresh-scoreboard')?.addEventListener('click', () => openContest(contest.id));
    document.querySelector('#contest-freeze')?.addEventListener('click', async () => { await api(`/contests/${contest.id}/freeze`, { method: 'POST', body: JSON.stringify({ frozen: true }) }); toast('榜单已封'); await openContest(contest.id); });
    document.querySelector('#contest-unfreeze')?.addEventListener('click', async () => { await api(`/contests/${contest.id}/freeze`, { method: 'POST', body: JSON.stringify({ frozen: false }) }); toast('榜单已公开'); await openContest(contest.id); });
    document.querySelector('#contest-roll')?.addEventListener('click', async () => { const result = await api(`/contests/${contest.id}/roll`, { method: 'POST' }); toast(result.reveal ? `${result.reveal.username} · ${result.reveal.problemTitle} · ${result.reveal.status}` : '滚榜完成'); await openContest(contest.id); });
  } catch (error) { content.innerHTML = `${pageHead('比赛', '无法加载比赛详情。')}<div class="empty-state"><strong>加载失败</strong>${escapeHtml(error.message)}</div>`; }
}

async function openContestScoreboard(contestId) { state.selectedContestId = contestId; navigate('contest-scoreboard'); }

async function renderContestScoreboardPage() {
  const contestId = state.selectedContestId;
  if (!contestId) { await renderContests(); return; }
  content.innerHTML = `${pageHead('比赛排行榜', '独立查看比赛排名、封榜和滚榜状态。', '<button class="secondary-button" data-go="contests">← 比赛列表</button>')}<div class="empty-state compact">正在加载排行榜…</div>`;
  try {
    const [{ contest }, { scoreboard }] = await Promise.all([api(`/contests/${contestId}`), api(`/contests/${contestId}/scoreboard`)]);
    state.selectedContest = contest;
    content.innerHTML = `${pageHead(escapeHtml(contest.title), `${contestRuleLabel(contest.rule)} · ${contestTimeText(contest)}`, `<button class="secondary-button" data-contest="${escapeHtml(contest.id)}">← 比赛详情</button><button class="text-button" id="refresh-independent-scoreboard">刷新榜单</button>`)}<section class="table-panel contest-scoreboard standalone-scoreboard"><div class="section-heading"><div><h2>排行榜</h2><p>${scoreboard.frozen ? '封榜后的提交将在滚榜时依次公开' : '排名随完成评测的提交更新'} · ${contestStatusLabel(contest.status)}</p></div><div class="button-row"><span class="tag">${contestRuleLabel(contest.rule)}</span>${scoreboard.frozen ? `<span class="tag freeze-tag">待滚 ${scoreboard.pendingCount} 条</span>` : '<span class="tag">公开</span>'}</div></div>${renderContestScoreboard(scoreboard)}</section>`;
    bindActions();
    document.querySelector('#refresh-independent-scoreboard')?.addEventListener('click', () => renderContestScoreboardPage());
  } catch (error) { content.innerHTML = `${pageHead('比赛排行榜', '无法加载排行榜。', '<button class="secondary-button" data-go="contests">← 比赛列表</button>')}<div class="empty-state"><strong>加载失败</strong>${escapeHtml(error.message)}</div>`; bindActions(); }
}
async function renderLeaderboard() { const { items } = await api('/leaderboard'); content.innerHTML = `${pageHead('排行榜', '基于竞赛 Rating 的公开排名。')}<section class="table-panel"><table><thead><tr><th>排名</th><th>用户</th><th>角色</th><th>已解决</th><th>Rating</th></tr></thead><tbody>${items.map(u=>`<tr><td><strong>${u.rank}</strong></td><td>${escapeHtml(u.displayName)} <span class="tag">@${escapeHtml(u.username)}</span></td><td>${u.role}</td><td>${u.solved}</td><td><strong>${u.rating}</strong></td></tr>`).join('')}</tbody></table></section>`; }

async function renderProfile() {
  if (!state.user) {
    content.innerHTML = `${pageHead('用户中心', '登录后查看个人数据与训练记录。')}<div class="empty-state"><strong>尚未登录</strong><button class="primary-button" data-login>登录账号</button></div>`;
    bindActions(); return;
  }
  content.innerHTML = `${pageHead('用户中心', '汇总账户状态、评测表现和最近训练记录。')}<div class="profile-loading skeleton"></div>`;
  try {
    const [{ items: submissions }, { items: leaderboard }] = await Promise.all([api('/submissions'), api('/leaderboard')]);
    state.submissions = submissions;
    const personal = submissions.filter(item => item.userId === state.user.id);
    const accepted = personal.filter(item => item.status === 'Accepted').length;
    const acceptance = personal.length ? Math.round((accepted / personal.length) * 100) : 0;
    const solved = solvedProblemCount(personal);
    const rank = leaderboard.find(item => item.id === state.user.id)?.rank || '—';
    const joinedAt = state.user.createdAt ? new Date(state.user.createdAt).toLocaleDateString('zh-CN') : '—';
    const recent = personal.slice(0, 6);
    content.innerHTML = `<section class="profile-hero">
        <div class="profile-avatar-wrap"><span class="profile-avatar">${avatarMarkup(state.user, (state.user.displayName || '?').slice(0, 1).toUpperCase())}</span><label class="secondary-button avatar-upload"><span>更换头像</span><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>${state.user.avatarUrl ? '<button class="text-button avatar-reset" id="reset-avatar" type="button">恢复默认</button>' : ''}</div>
        <div class="profile-identity"><div class="profile-name-row"><h1>${escapeHtml(state.user.displayName)}</h1><span class="role-badge">${escapeHtml(roleLabel(state.user.role))}</span></div><p>@${escapeHtml(state.user.username)} · 加入于 ${joinedAt}</p></div>
        <div class="button-row profile-actions"><button class="secondary-button" data-go="skills">能力画像</button><button class="primary-button" data-go="problems">继续刷题</button></div>
      </section>
      <div class="profile-stats">
        ${stat('当前 Rating', state.user.rating, `全站排名 #${rank}`, '◇')}
        ${stat('已解决题目', solved, `题库共 ${state.problems.length} 题`, '✓')}
        ${stat('评测通过率', `${acceptance}%`, `${accepted} / ${personal.length} 次提交`, '◎')}
        ${stat('累计提交', personal.length, '最近记录实时同步', '↗')}
      </div>
      <div class="profile-layout">
        <section class="table-panel profile-recent"><div class="section-heading"><div><h2>最近提交</h2><p>查看最近 6 次评测结果</p></div><button class="text-button" data-go="submissions">全部记录</button></div>${recent.length ? `<div class="profile-table-wrap"><table><thead><tr><th>题目</th><th>语言</th><th>状态</th><th>时间</th></tr></thead><tbody>${recent.map(item => `<tr><td>${escapeHtml(item.problemTitle)}</td><td>${escapeHtml(item.language)}</td><td><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td><td>${item.time || 0} ms</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state compact"><strong>暂无提交</strong>从题库完成第一道题。</div>'}</section>
        <div class="profile-side">
          <section class="panel account-panel"><div class="section-heading"><div><h2>账户信息</h2><p>当前登录身份</p></div></div><dl class="account-list"><div><dt>用户名</dt><dd>@${escapeHtml(state.user.username)}</dd></div><div><dt>邮箱</dt><dd>${escapeHtml(state.user.email || '未设置')}</dd></div><div><dt>角色</dt><dd>${escapeHtml(roleLabel(state.user.role))}</dd></div><div><dt>账户状态</dt><dd><span class="account-active">正常</span></dd></div></dl></section>
          <section class="panel goal-panel"><div class="section-heading"><div><h2>训练进度</h2><p>当前题库完成度</p></div><strong>${Math.min(100, Math.round((solved / Math.max(1, state.problems.length)) * 100))}%</strong></div><div class="goal-meter"><i style="width:${Math.min(100, Math.round((solved / Math.max(1, state.problems.length)) * 100))}%"></i></div><button class="secondary-button full-button" data-go="problems">查看未完成题目</button></section>
        </div>
      </div>`;
    bindActions(); document.querySelector('#avatar-file')?.addEventListener('change', uploadAvatar); document.querySelector('#reset-avatar')?.addEventListener('click', resetAvatar);
  } catch (error) {
    content.innerHTML = `${pageHead('用户中心', '汇总账户状态、评测表现和最近训练记录。')}<div class="empty-state"><strong>无法加载用户数据</strong>${escapeHtml(error.message)}</div>`;
  }
}

function renderSkills() { const personal = personalSubmissions(); const values = skillValues(personal); const average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; const recommendation = personal.length ? '继续训练动态规划的状态设计与图论边界处理，系统会根据你的提交更新掌握度。' : '完成第一道题后，这里会根据你的真实提交生成知识点掌握度和训练建议。'; content.innerHTML = `${pageHead('能力画像', '评分由可解释规则计算，AI 仅用于解释与推荐。')}<div class="dashboard-grid"><section class="panel"><div class="radar"><span>${state.user ? average : '--'}</span></div></section><section class="panel"><div class="panel-head"><h2>知识点掌握度</h2><span class="tag">最近 30 天</span></div><div class="skill-list">${skillRows(personal)}</div></section><section class="panel"><h2>下一步建议</h2><p class="subtitle">${recommendation}</p><div class="button-row" style="margin-top:18px"><button class="primary-button" data-go="problems">查看推荐题目</button></div></section></div>`; bindActions(); }

function testCaseTemplate(index) {
  return `<article class="test-case-row">
    <div class="test-case-head"><strong>隐藏测试点 <span class="test-index">${index}</span></strong><button class="icon-button remove-test" type="button" title="删除测试点">×</button></div>
    <div class="test-case-fields"><label class="form-field"><span>输入</span><textarea name="testInput" rows="4" required placeholder="测试输入"></textarea></label><label class="form-field"><span>标准输出</span><textarea name="testOutput" rows="4" required placeholder="标准输出"></textarea></label></div>
  </article>`;
}

function renderProblemAdmin() {
  if (!['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role)) {
    content.innerHTML = `${pageHead('新增题目', '该工作区仅向出题人和管理员开放。')}<div class="empty-state"><strong>需要管理员权限</strong>请使用管理员账号登录。</div>`; return;
  }
  content.innerHTML = `${pageHead('新增题目', '配置题面、测试数据与隔离评测规则。')}
    <form id="problem-form" class="problem-form">
      <section class="panel admin-form-section span-all">
        <div class="section-heading"><div><h2>基本信息</h2><p>题目标识与资源限制</p></div></div>
        <div class="form-grid"><label class="form-field span-2"><span>题目名称</span><input name="title" required maxlength="120" placeholder="例如：A + B Problem"></label><label class="form-field"><span>Slug</span><input name="slug" required pattern="[a-z0-9][a-z0-9-]{2,63}" placeholder="a-plus-b"></label><label class="form-field"><span>难度</span><select name="difficulty"><option>入门</option><option>简单</option><option>中等</option><option>困难</option></select></label><label class="form-field span-2"><span>标签</span><input name="tags" placeholder="基础, 模拟, 数学"></label><label class="form-field"><span>时间限制（ms）</span><input name="timeLimit" type="number" min="100" max="10000" step="100" value="1000" required></label><label class="form-field"><span>内存限制（MB）</span><input name="memoryLimit" type="number" min="16" max="1024" step="16" value="256" required></label></div>
      </section>
      <section class="panel admin-form-section span-all">
        <div class="section-heading"><div><h2>题面</h2><p>支持 Markdown 与 LaTeX 数学表达式</p></div></div>
        <div class="form-grid"><label class="form-field span-all"><span>题目描述</span><textarea name="statement" rows="6" required placeholder="题目描述"></textarea></label><label class="form-field"><span>输入格式</span><textarea name="input" rows="4" required placeholder="输入格式"></textarea></label><label class="form-field"><span>输出格式</span><textarea name="output" rows="4" required placeholder="输出格式"></textarea></label></div>
      </section>
      <section class="panel admin-form-section">
        <div class="section-heading"><div><h2>公开样例</h2><p>题面展示并参与评测</p></div></div>
        <div class="form-grid one-column"><label class="form-field"><span>样例输入</span><textarea name="sampleInput" rows="5" required placeholder="样例输入"></textarea></label><label class="form-field"><span>样例输出</span><textarea name="sampleOutput" rows="5" required placeholder="样例输出"></textarea></label></div>
      </section>
      <section class="panel admin-form-section">
        <div class="section-heading"><div><h2>判题方式</h2><p>输出比较与 Checker</p></div></div>
        <div class="form-grid one-column"><label class="form-field"><span>评测模式</span><select name="judgeMode" id="judge-mode"><option value="exact">精确匹配</option><option value="tokens">忽略空白</option><option value="float">浮点误差</option><option value="custom">Special Judge</option></select></label><label class="form-field" id="float-settings" hidden><span>相对/绝对误差</span><input name="floatEpsilon" type="number" min="0.000000000001" max="1" step="0.000001" value="0.000001"></label><label class="toggle-field"><input name="published" type="checkbox" checked><span>立即发布到题库</span></label><label class="toggle-field"><input name="visibleToUsers" type="checkbox" checked><span>对普通用户开放（取消后仅管理员/出题人可见）</span></label></div>
      </section>
      <section class="panel admin-form-section span-all" id="checker-settings" hidden>
        <div class="section-heading"><div><h2>Special Judge Checker</h2><p>C++17 · 输出 AC 表示通过</p></div><span class="tag">Judge0 隔离执行</span></div>
        <label class="form-field"><span>Checker 源码</span><textarea class="checker-editor" name="checkerSource" rows="18" spellcheck="false">${escapeHtml(defaultCheckerSource)}</textarea></label>
      </section>
      <section class="panel admin-form-section span-all">
        <div class="section-heading"><div><h2>隐藏测试点</h2><p>组数不限，总大小不超过 2GB</p></div><button class="secondary-button" id="add-test" type="button">＋ 添加测试点</button></div>
        <div class="test-case-list" id="test-case-list">${testCaseTemplate(1)}</div>
      </section>
      <div class="problem-form-actions span-all"><span class="form-error" id="problem-form-error"></span><button class="primary-button" id="create-problem" type="submit">创建题目</button></div>
    </form>
    <section class="table-panel created-problems"><div class="section-heading"><div><h2>题库题目</h2><p>当前题库 ${state.problems.length} 题；可直接切换普通用户可见状态</p></div><button class="text-button" data-go="problems">查看题库</button></div><div class="profile-table-wrap"><table><thead><tr><th>编号</th><th>题目</th><th>判题方式</th><th>测试点</th><th>限制</th><th>普通用户</th></tr></thead><tbody>${state.problems.map(problem => `<tr><td>${problem.number}</td><td><strong>${escapeHtml(problem.title)}</strong><div><span class="tag">${escapeHtml(problem.difficulty)}</span>${!problem.published ? '<span class="tag">草稿</span>' : ''}</div></td><td>${escapeHtml(judgeModeLabel(problem.judgeMode))}</td><td>${problem.testCount || 1}</td><td>${problem.timeLimit} ms / ${problem.memoryLimit} MB</td><td><button class="text-button toggle-problem-visibility" data-problem-id="${escapeHtml(problem.id)}" data-visible="${problem.visibleToUsers !== false}">${problem.visibleToUsers !== false ? '可见' : '隐藏'}</button></td></tr>`).join('')}</tbody></table></div></section>`;
  bindProblemAdmin(); bindActions(); document.querySelectorAll('.toggle-problem-visibility').forEach(button => button.addEventListener('click', toggleProblemVisibility));
}

function renumberTestCases() { document.querySelectorAll('.test-case-row .test-index').forEach((node, index) => { node.textContent = String(index + 1); }); }

function updateJudgeSettings() {
  const mode = document.querySelector('#judge-mode').value;
  document.querySelector('#float-settings').hidden = mode !== 'float';
  document.querySelector('#checker-settings').hidden = mode !== 'custom';
}

function bindProblemAdmin() {
  document.querySelector('#judge-mode').addEventListener('change', updateJudgeSettings);
  document.querySelector('#add-test').addEventListener('click', () => {
    const list = document.querySelector('#test-case-list');
    list.insertAdjacentHTML('beforeend', testCaseTemplate(list.children.length + 1));
  });
  document.querySelector('#test-case-list').addEventListener('click', event => { if (event.target.closest('.remove-test')) { event.target.closest('.test-case-row').remove(); renumberTestCases(); } });
  document.querySelector('#problem-form').addEventListener('submit', createProblem);
  updateJudgeSettings();
}

async function createProblem(event) {
  event.preventDefault();
  const form = event.currentTarget; const data = new FormData(form); const button = document.querySelector('#create-problem'); const errorNode = document.querySelector('#problem-form-error');
  const tests = [...document.querySelectorAll('.test-case-row')].map(row => ({ input: row.querySelector('[name="testInput"]').value, expectedOutput: row.querySelector('[name="testOutput"]').value }));
  const testDataBytes = new Blob([data.get('sampleInput'), data.get('sampleOutput'), ...tests.flatMap(test => [test.input, test.expectedOutput])]).size;
  if (testDataBytes > 2 * 1024 * 1024 * 1024) { errorNode.textContent = '测试数据总大小不能超过 2GB'; return; }
  const shouldPublish = form.elements.published.checked;
  const payload = { title: data.get('title'), slug: data.get('slug'), difficulty: data.get('difficulty'), tags: String(data.get('tags') || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean), timeLimit: Number(data.get('timeLimit')), memoryLimit: Number(data.get('memoryLimit')), statement: data.get('statement'), input: data.get('input'), output: data.get('output'), sampleInput: data.get('sampleInput'), sampleOutput: data.get('sampleOutput'), judgeMode: data.get('judgeMode'), floatEpsilon: Number(data.get('floatEpsilon') || 1e-6), checkerSource: data.get('judgeMode') === 'custom' ? data.get('checkerSource') : '', tests: [], published: false, visibleToUsers: form.elements.visibleToUsers.checked };
  button.disabled = true; button.textContent = '创建中…'; errorNode.textContent = '';
  let draftId = '';
  try {
    const created = await api('/problems', { method: 'POST', body: JSON.stringify(payload) });
    draftId = created.problem.id;
    for (let index = 0; index < tests.length; index++) {
      button.textContent = `上传测试点 ${index + 1}/${tests.length}…`;
      const test = tests[index]; const inputBytes = new Blob([test.input]).size;
      await api(`/problems/${draftId}/tests`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-cthoj-input-bytes': String(inputBytes) }, body: new Blob([test.input, test.expectedOutput]) });
    }
    const { problem } = await api(`/problems/${draftId}/publish`, { method: 'PATCH', body: JSON.stringify({ published: shouldPublish }) });
    draftId = '';
    if (problem.published) { const refreshed = await api('/problems'); state.problems = refreshed.items; }
    toast(`题目 ${problem.number} 创建成功`); renderProblemAdmin();
  } catch (error) {
    if (draftId) { try { await api(`/problems/${draftId}/discard`, { method: 'DELETE' }); } catch {} }
    errorNode.textContent = error.message; button.disabled = false; button.textContent = '创建题目';
  }
}

async function renderContestAdmin() {
  if (!['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role)) {
    content.innerHTML = `${pageHead('比赛管理', '仅管理员和出题人可以访问。')}<div class="empty-state"><strong>需要管理员权限</strong>请使用管理员账号登录。</div>`; return;
  }
  const { items } = await api('/contests');
  const defaultStart = dateTimeLocalValue(Date.now() + 60 * 60_000);
  content.innerHTML = `${pageHead('比赛管理', '创建比赛并控制比赛榜单。', '<button class="secondary-button" data-go="contests">查看比赛</button>')}
    <form id="contest-form" class="problem-form">
      <input type="hidden" name="contestId">
      <section class="panel admin-form-section span-all"><div class="section-heading"><div><h2>比赛设置</h2><p>时间与赛制</p></div><button class="text-button" id="reset-contest-form" type="button">新建比赛</button></div><div class="form-grid"><label class="form-field span-2"><span>比赛名称</span><input name="title" required maxlength="120" placeholder="例如：CTHOJ 周赛 01"></label><label class="form-field span-2"><span>比赛说明</span><textarea name="description" rows="3" maxlength="1000"></textarea></label><label class="form-field"><span>赛制</span><select name="rule"><option value="ACM">ACM 赛制</option><option value="OI">OI 赛制</option><option value="IOI">IOI 赛制</option></select></label><label class="form-field"><span>开始时间</span><input name="startsAt" type="datetime-local" value="${defaultStart}" required></label><label class="form-field"><span>比赛时长（分钟）</span><input name="durationMinutes" type="number" min="1" max="10080" value="180" required></label><label class="form-field"><span>结束前封榜（分钟）</span><input name="freezeMinutes" type="number" min="0" max="10080" value="60" required></label></div></section>
      <section class="panel admin-form-section span-all"><div class="section-heading"><div><h2>比赛题目</h2><p>选择 1-50 道已发布题目</p></div></div><div class="contest-problem-picker">${state.problems.filter(problem => problem.published).map((problem, index) => `<label><input type="checkbox" name="problemIds" value="${problem.id}"><span><strong>${contestProblemLabelClient(index)} · ${escapeHtml(problem.title)}</strong><small>${problem.number} · ${escapeHtml(problem.difficulty)}</small></span></label>`).join('')}</div></section>
      <div class="problem-form-actions span-all"><span class="form-error" id="contest-form-error"></span><button class="primary-button" id="save-contest" type="submit">创建比赛</button></div>
    </form>
    <section class="table-panel contest-admin-list"><div class="section-heading"><div><h2>现有比赛</h2><p>${items.length} 场比赛</p></div></div><div class="profile-table-wrap"><table><thead><tr><th>比赛</th><th>赛制</th><th>时间</th><th>榜单</th><th>操作</th></tr></thead><tbody>${items.map(contest => `<tr><td><strong>${escapeHtml(contest.title)}</strong><small>${contestStatusLabel(contest.status)} · ${contest.problemCount} 题</small></td><td>${contestRuleLabel(contest.rule)}</td><td>${new Date(contest.startsAt).toLocaleString()}<small>${contest.durationMinutes} 分钟</small></td><td><span class="tag ${contest.scoreboardMode === 'frozen' || contest.scoreboardMode === 'rolling' ? 'freeze-tag' : ''}">${escapeHtml(contest.scoreboardMode)}</span></td><td><div class="button-row"><button class="text-button edit-contest" data-id="${contest.id}">编辑</button><button class="text-button toggle-contest-freeze" data-id="${contest.id}" data-frozen="${contest.scoreboardMode === 'frozen' || contest.scoreboardMode === 'rolling'}">${contest.scoreboardMode === 'frozen' || contest.scoreboardMode === 'rolling' ? '解封' : '封榜'}</button>${contest.scoreboardMode === 'frozen' || contest.scoreboardMode === 'rolling' ? `<button class="text-button roll-contest" data-id="${contest.id}">滚榜</button>` : ''}<button class="text-button" data-contest="${contest.id}">查看</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
  bindActions(); bindContestAdmin();
}

function contestProblemLabelClient(index) {
  let value = index + 1; let label = '';
  while (value > 0) { value -= 1; label = String.fromCharCode(65 + value % 26) + label; value = Math.floor(value / 26); }
  return label;
}

function resetContestForm() {
  const form = document.querySelector('#contest-form'); form.reset(); form.elements.contestId.value = ''; form.elements.startsAt.value = dateTimeLocalValue(Date.now() + 60 * 60_000); form.elements.durationMinutes.value = '180'; form.elements.freezeMinutes.value = '60'; document.querySelector('#save-contest').textContent = '创建比赛'; document.querySelector('#contest-form-error').textContent = '';
}

function bindContestAdmin() {
  document.querySelector('#reset-contest-form').addEventListener('click', resetContestForm);
  document.querySelector('#contest-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const button = document.querySelector('#save-contest'); const error = document.querySelector('#contest-form-error');
    const startsAt = new Date(String(data.get('startsAt'))); const payload = { title: data.get('title'), description: data.get('description'), rule: data.get('rule'), startsAt: startsAt.toISOString(), durationMinutes: Number(data.get('durationMinutes')), freezeMinutes: Number(data.get('freezeMinutes')), problemIds: data.getAll('problemIds') };
    button.disabled = true; error.textContent = '';
    try { const contestId = data.get('contestId'); await api(contestId ? `/contests/${contestId}` : '/contests', { method: contestId ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); toast(contestId ? '比赛已更新' : '比赛已创建'); await renderContestAdmin(); }
    catch (submitError) { error.textContent = submitError.message; button.disabled = false; }
  });
  document.querySelectorAll('.edit-contest').forEach(button => button.addEventListener('click', async () => {
    const { contest } = await api(`/contests/${button.dataset.id}`); const form = document.querySelector('#contest-form'); form.elements.contestId.value = contest.id; form.elements.title.value = contest.title; form.elements.description.value = contest.description; form.elements.rule.value = contest.rule; form.elements.startsAt.value = dateTimeLocalValue(contest.startsAt); form.elements.durationMinutes.value = String(contest.durationMinutes); form.elements.freezeMinutes.value = String(contest.freezeMinutes); form.querySelectorAll('[name="problemIds"]').forEach(input => { input.checked = contest.problemIds.includes(input.value); }); document.querySelector('#save-contest').textContent = '保存修改'; form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.querySelectorAll('.toggle-contest-freeze').forEach(button => button.addEventListener('click', async () => { await api(`/contests/${button.dataset.id}/freeze`, { method: 'POST', body: JSON.stringify({ frozen: button.dataset.frozen !== 'true' }) }); toast(button.dataset.frozen === 'true' ? '榜单已解封' : '榜单已封'); await renderContestAdmin(); }));
  document.querySelectorAll('.roll-contest').forEach(button => button.addEventListener('click', async () => { const result = await api(`/contests/${button.dataset.id}/roll`, { method: 'POST' }); toast(result.reveal ? `${result.reveal.username} · ${result.reveal.problemTitle}` : '滚榜完成'); await renderContestAdmin(); }));
}

async function renderNotificationAdmin() {
  if (!['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role)) { content.innerHTML = pageHead('通知管理', '仅管理员可以访问。') + '<div class="empty-state"><strong>需要管理员权限</strong>请使用管理员账号登录。</div>'; return; }
  const { items: users } = await api('/admin/users');
  content.innerHTML = `${pageHead('通知管理', '向全部用户或指定用户发送站内通知。')}<form id="notification-form" class="problem-form"><section class="panel admin-form-section"><div class="section-heading"><div><h2>通知内容</h2><p>通知会保存在站内消息中心</p></div></div><div class="form-grid one-column"><label class="form-field"><span>标题</span><input name="title" maxlength="120" required placeholder="例如：系统维护通知"></label><label class="form-field"><span>类型</span><select name="type"><option value="info">普通通知</option><option value="success">成功提示</option><option value="warning">重要提醒</option><option value="system">系统消息</option></select></label><label class="form-field"><span>正文</span><textarea name="content" rows="8" maxlength="5000" required placeholder="输入要发送的通知内容"></textarea></label></div></section><section class="panel admin-form-section"><div class="section-heading"><div><h2>发送对象</h2><p>选择全部用户或指定账号</p></div></div><div class="form-grid one-column"><label class="form-field"><span>对象范围</span><select name="audience" id="notification-audience"><option value="all">全部用户（${users.length}）</option><option value="users">指定用户</option></select></label><div id="notification-recipient-picker" class="notification-recipient-picker" hidden><div class="button-row"><button class="text-button" type="button" id="select-all-notification-users">全选</button><button class="text-button" type="button" id="clear-notification-users">清空</button><span class="subtitle" id="notification-recipient-count">已选 0 人</span></div><div class="notification-user-list">${users.map(item => `<label><input type="checkbox" name="recipientIds" value="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.displayName)}</strong><small>@${escapeHtml(item.username)} · ${escapeHtml(roleLabel(item.role))}</small></span></label>`).join('')}</div></div></div></section><div class="problem-form-actions span-all"><span class="form-error" id="notification-form-error"></span><button class="primary-button" id="send-notification" type="submit">发送通知</button></div></form>`;
  const form = document.querySelector('#notification-form'); const audience = document.querySelector('#notification-audience'); const picker = document.querySelector('#notification-recipient-picker'); const count = document.querySelector('#notification-recipient-count');
  const updateRecipients = () => { picker.hidden = audience.value !== 'users'; count.textContent = `已选 ${form.querySelectorAll('[name="recipientIds"]:checked').length} 人`; };
  audience.addEventListener('change', updateRecipients); form.querySelectorAll('[name="recipientIds"]').forEach(input => input.addEventListener('change', updateRecipients));
  document.querySelector('#select-all-notification-users').addEventListener('click', () => { form.querySelectorAll('[name="recipientIds"]').forEach(input => { input.checked = true; }); updateRecipients(); });
  document.querySelector('#clear-notification-users').addEventListener('click', () => { form.querySelectorAll('[name="recipientIds"]').forEach(input => { input.checked = false; }); updateRecipients(); });
  form.addEventListener('submit', async event => { event.preventDefault(); const button = document.querySelector('#send-notification'); const error = document.querySelector('#notification-form-error'); const data = new FormData(form); const selected = data.getAll('recipientIds'); button.disabled = true; error.textContent = ''; try { const result = await api('/admin/notifications', { method: 'POST', body: JSON.stringify({ title: data.get('title'), content: data.get('content'), type: data.get('type'), audience: data.get('audience'), userIds: selected }) }); toast(`通知已发送给 ${result.notification.recipientCount} 人`); form.reset(); updateRecipients(); } catch (submitError) { error.textContent = submitError.message; } finally { button.disabled = false; } });
  updateRecipients();
}

function moderationBanLabel(user) { if (!user.bannedUntil) return '<span class="status-pill Accepted">正常</span>'; return `<span class="status-pill Error">${user.bannedUntil === 'permanent' ? '永久封禁' : `封禁至 ${new Date(user.bannedUntil).toLocaleString()}`}</span>`; }
function moderationRoleActions(user) { if (user.id === state.user?.id) return ''; if (user.role === 'USER') return `<button class="text-button grant-admin" data-user-id="${escapeHtml(user.id)}">授予管理员</button>`; if ((state.user?.username === 'admin' || state.user?.role === 'SUPER_ADMIN')) return `<button class="text-button revoke-admin" data-user-id="${escapeHtml(user.id)}">撤销管理员</button>`; return ''; }
async function renderModerationAdmin() {
  if (!['ADMIN', 'SUPER_ADMIN', 'SETTER'].includes(state.user?.role)) { content.innerHTML = pageHead('内容管理', '仅管理员可以访问。') + '<div class="empty-state"><strong>需要管理员权限</strong>请使用管理员账号登录。</div>'; return; }
  const [{ settings }, { items: users }, { items: comments }] = await Promise.all([api('/admin/moderation'), api('/admin/users'), api('/admin/comments')]);
  content.innerHTML = `${pageHead('内容管理', '管理评论审核、用户封禁和管理员权限。')}<form id="moderation-form" class="problem-form"><section class="panel admin-form-section"><div class="section-heading"><div><h2>违禁词</h2><p>每行或逗号分隔一个词</p></div></div><label class="form-field"><span>评论违禁词</span><textarea name="bannedWords" rows="8">${escapeHtml(settings.bannedWords.join('\n'))}</textarea></label></section><section class="panel admin-form-section"><div class="section-heading"><div><h2>AI 评论审核</h2><p>AI 凭据仅在服务端使用</p></div></div><label class="toggle-field"><input type="checkbox" name="aiEnabled" ${settings.aiEnabled ? 'checked' : ''}>启用 AI 自动审核</label><label class="form-field"><span>AI 额外关注关键词</span><textarea name="aiBanKeywords" rows="6">${escapeHtml(settings.aiBanKeywords.join('\n'))}</textarea></label></section><div class="problem-form-actions span-all"><span class="form-error" id="moderation-error"></span><button class="primary-button" type="submit">保存审核设置</button></div></form><section class="table-panel moderation-users"><div class="section-heading"><div><h2>用户与权限</h2><p>${users.length} 个账号；撤销管理员权限需要 admin 用户或超级管理员</p></div></div><div class="profile-table-wrap"><table><thead><tr><th>用户</th><th>角色</th><th>封禁状态</th><th>权限</th><th>封禁</th></tr></thead><tbody>${users.map(item => `<tr><td><strong>${escapeHtml(item.displayName)}</strong><small>@${escapeHtml(item.username)}</small></td><td>${escapeHtml(roleLabel(item.role))}</td><td>${moderationBanLabel(item)}</td><td>${moderationRoleActions(item)}</td><td>${item.id === state.user?.id ? '<span class="tag">当前账号</span>' : `<select class="ban-duration" data-ban-duration="${escapeHtml(item.id)}"><option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="permanent">永久</option></select><button class="text-button ban-user" data-user-id="${escapeHtml(item.id)}">封禁</button>${item.bannedUntil ? `<button class="text-button unban-user" data-user-id="${escapeHtml(item.id)}">解封</button>` : ''}`}</td></tr>`).join('')}</tbody></table></div></section><section class="table-panel moderation-comments"><div class="section-heading"><div><h2>评论审核</h2><p>${comments.length} 条未删除评论</p></div><button class="secondary-button" id="scan-comments" type="button">AI 扫描全部</button></div><div class="profile-table-wrap"><table><thead><tr><th>评论</th><th>用户</th><th>时间</th><th>操作</th></tr></thead><tbody>${comments.length ? comments.map(comment => `<tr><td><div class="moderation-comment-preview rich-text">${renderRichText(comment.content)}</div></td><td>${escapeHtml(comment.displayName || comment.username)}</td><td>${new Date(comment.createdAt).toLocaleString()}</td><td><button class="text-button admin-delete-comment" data-comment-id="${escapeHtml(comment.id)}" data-problem-id="${escapeHtml(comment.problemId)}">删除</button></td></tr>`).join('') : '<tr><td colspan="4">暂无待审核评论</td></tr>'}</tbody></table></div></section>`;
  document.querySelector('#moderation-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const error = document.querySelector('#moderation-error'); error.textContent = ''; try { await api('/admin/moderation', { method: 'PATCH', body: JSON.stringify({ bannedWords: form.elements.bannedWords.value, aiBanKeywords: form.elements.aiBanKeywords.value, aiEnabled: form.elements.aiEnabled.checked }) }); toast('审核设置已保存'); } catch (submitError) { error.textContent = submitError.message; } });
  document.querySelector('#scan-comments').addEventListener('click', async event => { event.currentTarget.disabled = true; try { const result = await api('/admin/comments/scan', { method: 'POST', body: '{}' }); toast(`扫描 ${result.scanned} 条，删除 ${result.deleted} 条`); await renderModerationAdmin(); } catch (error) { toast(error.message); event.currentTarget.disabled = false; } });
  document.querySelectorAll('.grant-admin').forEach(button => button.addEventListener('click', async () => { try { await api(`/admin/users/${button.dataset.userId}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'ADMIN' }) }); toast('已授予管理员权限'); await renderModerationAdmin(); } catch (error) { toast(error.message); } }));
  document.querySelectorAll('.revoke-admin').forEach(button => button.addEventListener('click', async () => { try { await api(`/admin/users/${button.dataset.userId}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'USER' }) }); toast('已撤销管理员权限'); await renderModerationAdmin(); } catch (error) { toast(error.message); } }));
  document.querySelectorAll('.ban-user').forEach(button => button.addEventListener('click', async () => { const duration = document.querySelector(`[data-ban-duration="${button.dataset.userId}"]`).value; try { await api(`/admin/users/${button.dataset.userId}/ban`, { method: 'PATCH', body: JSON.stringify(duration === 'permanent' ? { permanent: true } : { durationDays: Number(duration) }) }); toast('账号已封禁'); await renderModerationAdmin(); } catch (error) { toast(error.message); } }));
  document.querySelectorAll('.unban-user').forEach(button => button.addEventListener('click', async () => { try { await api(`/admin/users/${button.dataset.userId}/ban`, { method: 'DELETE' }); toast('账号已解封'); await renderModerationAdmin(); } catch (error) { toast(error.message); } }));
  document.querySelectorAll('.admin-delete-comment').forEach(button => button.addEventListener('click', async () => { try { await api(`/comments/${button.dataset.commentId}`, { method: 'DELETE' }); toast('评论已删除'); await renderModerationAdmin(); } catch (error) { toast(error.message); } }));
}


const labTemplates = {
  cpp17: {
    generator: `#include <bits/stdc++.h>
using namespace std;
int main() {
  long long seed; int requestedSize = 0, density = 55; string profile = "random";
  if (!(cin >> seed)) return 1;
  cin >> requestedSize >> density >> profile;
  int n = requestedSize > 0 ? min(requestedSize, 100000) : 3 + (int)llabs(seed % 5);
  mt19937_64 rng((uint64_t)seed ^ 0xC7A5ULL);
  cout << n << " 0\\n";
  for (int i = 0; i < n; ++i) {
    long long value = profile == "corner-duplicate" ? 7 : profile == "corner-skewed" && i * 100 >= n * density ? 1000000000LL : (long long)(rng() % 2000000001ULL) - 1000000000LL;
    cout << value << (i + 1 == n ? '\\n' : ' ');
  }
  return 0;
}`,
    validator: `#include <bits/stdc++.h>
using namespace std;
int main() {
  long long n, target, value;
  if (!(cin >> n >> target) || n < 1 || n > 100000) return 1;
  for (long long i = 0; i < n; ++i) if (!(cin >> value)) return 1;
  string extra;
  if (cin >> extra) return 1;
  cout << "VALID\\n";
  return 0;
}`,
    reference: `#include <bits/stdc++.h>
using namespace std;
int main() {
  int n;
  long long target;
  if (!(cin >> n >> target) || n < 1 || n > 100000) return 1;
  vector<long long> values(n);
  for (long long &value : values) if (!(cin >> value)) return 1;
  long long answer = 0;
  for (int i = 0; i < n; ++i)
    for (int j = i + 1; j < n; ++j)
      answer += values[i] + values[j] == target;
  cout << answer << "\\n";
  return 0;
}`,
    brute: `#include <bits/stdc++.h>
using namespace std;
int main() {
  int n;
  long long target;
  if (!(cin >> n >> target) || n < 1 || n > 100000) return 1;
  vector<long long> values(n);
  for (long long &value : values) if (!(cin >> value)) return 1;
  long long answer = 0;
  for (int i = 0; i < n; ++i)
    for (int j = i + 1; j < n; ++j)
      answer += values[i] + values[j] == target;
  cout << answer << "\\n";
  return 0;
}`
  },
  python3: {
    generator: `import random
import sys

fields = sys.stdin.buffer.read().split()
if not fields:
    raise SystemExit(1)
seed = int(fields[0])
size = int(fields[1]) if len(fields) > 1 else 3 + abs(seed % 5)
density = int(fields[2]) if len(fields) > 2 else 55
profile = fields[3].decode() if len(fields) > 3 else "random"
rng = random.Random(seed ^ 0xC7A5)
n = max(1, min(size, 100000))
values = [7 if profile == "corner-duplicate" else 10**9 if profile == "corner-skewed" and i * 100 >= n * density else rng.randint(-10**9, 10**9) for i in range(n)]
print(n, 0)
print(*values)
`,
    validator: `import sys

data = sys.stdin.buffer.read().split()
if not data:
    raise SystemExit(1)
try:
    values = list(map(int, data))
    n, target = values[:2]
    numbers = values[2:]
except (ValueError, IndexError):
    raise SystemExit(1)
if n < 1 or n > 100000 or len(numbers) != n:
    raise SystemExit(1)
print("VALID")
`,
    reference: `import sys

data = list(map(int, sys.stdin.buffer.read().split()))
if len(data) < 2:
    raise SystemExit(1)
n, target = data[:2]
values = data[2:]
if n < 1 or len(values) != n:
    raise SystemExit(1)
answer = sum(values[i] + values[j] == target for i in range(n) for j in range(i + 1, n))
print(answer)
`,
    brute: `import sys

data = list(map(int, sys.stdin.buffer.read().split()))
if len(data) < 2:
    raise SystemExit(1)
n, target = data[:2]
values = data[2:]
if n < 1 or len(values) != n:
    raise SystemExit(1)
answer = sum(values[i] + values[j] == target for i in range(n) for j in range(i + 1, n))
print(answer)
`
  },
  java17: {
    generator: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    if (!in.hasNextLong()) return;
    long seed = in.nextLong();
    int n = in.hasNextInt() ? Math.max(1, Math.min(100000, in.nextInt())) : 3 + (int)Math.abs(seed % 5);
    int density = in.hasNextInt() ? in.nextInt() : 55;
    String profile = in.hasNext() ? in.next() : "random";
    Random rng = new Random(seed ^ 0xC7A5L);
    System.out.println(n + " 0");
    for (int i = 0; i < n; ++i) {
      long value = profile.equals("corner-duplicate") ? 7 : profile.equals("corner-skewed") && i * 100 >= n * density ? 1000000000L : rng.nextInt(2000000001) - 1000000000L;
      System.out.print(value);
      System.out.print(i + 1 == n ? '\\n' : ' ');
    }
  }
}`,
    validator: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    if (!in.hasNextLong()) { System.exit(1); return; }
    long n = in.nextLong();
    if (!in.hasNextLong() || n < 1 || n > 100000) { System.exit(1); return; }
    in.nextLong();
    for (long i = 0; i < n; ++i) {
      if (!in.hasNextLong()) { System.exit(1); return; }
      in.nextLong();
    }
    if (in.hasNext()) { System.exit(1); return; }
    System.out.println("VALID");
  }
}`,
    reference: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    if (!in.hasNextInt()) { System.exit(1); return; }
    int n = in.nextInt();
    if (!in.hasNextLong() || n < 1 || n > 100000) { System.exit(1); return; }
    long target = in.nextLong();
    long[] values = new long[n];
    for (int i = 0; i < n; ++i) {
      if (!in.hasNextLong()) { System.exit(1); return; }
      values[i] = in.nextLong();
    }
    long answer = 0;
    for (int i = 0; i < n; ++i)
      for (int j = i + 1; j < n; ++j)
        if (values[i] + values[j] == target) ++answer;
    System.out.println(answer);
  }
}`,
    brute: `import java.util.*;

public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    if (!in.hasNextInt()) { System.exit(1); return; }
    int n = in.nextInt();
    if (!in.hasNextLong() || n < 1 || n > 100000) { System.exit(1); return; }
    long target = in.nextLong();
    long[] values = new long[n];
    for (int i = 0; i < n; ++i) {
      if (!in.hasNextLong()) { System.exit(1); return; }
      values[i] = in.nextLong();
    }
    long answer = 0;
    for (int i = 0; i < n; ++i)
      for (int j = i + 1; j < n; ++j)
        if (values[i] + values[j] == target) ++answer;
    System.out.println(answer);
  }
}`
  }
};
labTemplates.cpp20 = labTemplates.cpp17;
function labTemplateSet(language) { return labTemplates[language] || labTemplates.cpp17; }
function ensureLabPlan(form) {
  if (form.querySelector('#lab-density-bars')) return;
  form.insertAdjacentHTML('afterbegin', labPlanSection());
  bindLabPlan(form);
}
function applyLabTemplates(form, language) {
  ensureLabPlan(form);
  const templates = labTemplateSet(language);
  form.elements.generatorSource.value = templates.generator;
  form.elements.validatorSource.value = templates.validator;
  form.elements.referenceSource.value = templates.reference;
  form.elements.bruteSource.value = templates.brute;
  form.dataset.labTemplateLanguage = language;
}
function labSourcesEdited(form, language) {
  const templates = labTemplateSet(language);
  return ['generatorSource', 'validatorSource', 'referenceSource', 'bruteSource'].some(name => form.elements[name].value.trim() && form.elements[name].value !== templates[name]);
}
function labPlanState(form) {
  const count = Math.max(1, Math.min(100, Number(form.elements.count.value || 1)));
  const minSize = Math.max(1, Number(form.elements.minSize?.value || 3));
  const maxSize = Math.max(minSize, Number(form.elements.maxSize?.value || 1000));
  const mode = form.elements.sizeMode?.value || 'approximate';
  const density = Math.max(0, Math.min(100, Number(form.elements.density?.value || 55)));
  let randomState = ((Number(form.elements.seed?.value || 0) >>> 0) ^ 0x9e3779b9) >>> 0;
  const sizes = Array.from({ length: count }, (_, index) => {
    const input = form.querySelector(`[data-case-size="${index}"]`);
    if (mode === 'exact' && input) return Math.max(1, Math.min(100000, Number(input.value || 1)));
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    const random = Math.abs(randomState % 2000000001 - 1000000000) / 1000000000;
    const wave = (Math.sin((index + 1) * 2.17 + density / 19) + 1) / 2;
    const mixed = Math.max(0, Math.min(1, random * density / 100 + wave * (1 - density / 100)));
    return Math.round(minSize + (maxSize - minSize) * mixed);
  });
  const profiles = Array.from({ length: count }, (_, index) => form.querySelector(`[data-case-profile="${index}"]`)?.value || (index === 0 ? 'corner-min' : index === 1 ? 'corner-max' : 'random'));
  if (mode === 'approximate' && profiles[0] === 'corner-min') sizes[0] = minSize;
  if (mode === 'approximate' && profiles[1] === 'corner-max') sizes[1] = maxSize;
  return { count, minSize, maxSize, mode, density, sizes, profiles };
}
function renderLabPlan(form) {
  const state = labPlanState(form); const bars = document.querySelector('#lab-density-bars'); const rows = document.querySelector('#lab-case-rows');
  if (form.elements.densityValue) form.elements.densityValue.value = `${state.density}%`;
  if (bars) bars.innerHTML = state.sizes.map((size, index) => `<button type="button" class="lab-density-bar ${state.profiles[index] !== 'random' ? 'corner' : ''}" data-case-select="${index}" style="height:${Math.max(8, Math.round(12 + 80 * (size / Math.max(state.maxSize, 1))))}%" title="第${index + 1}组 · 规模 ${size} · ${state.profiles[index]}"><span>${index + 1}</span></button>`).join('');
  if (rows) rows.innerHTML = state.sizes.map((size, index) => `<div class="lab-case-row"><strong>第 ${index + 1} 组</strong><label>规模<input type="number" min="1" max="100000" data-case-size="${index}" value="${size}"></label><label>类型<select data-case-profile="${index}"><option value="random" ${state.profiles[index] === 'random' ? 'selected' : ''}>随机</option><option value="corner-min" ${state.profiles[index] === 'corner-min' ? 'selected' : ''}>Corner 最小</option><option value="corner-max" ${state.profiles[index] === 'corner-max' ? 'selected' : ''}>Corner 最大</option><option value="corner-duplicate" ${state.profiles[index] === 'corner-duplicate' ? 'selected' : ''}>重复值</option><option value="corner-skewed" ${state.profiles[index] === 'corner-skewed' ? 'selected' : ''}>偏斜分布</option></select></label></div>`).join('');
  form.elements.caseSizes.value = JSON.stringify(state.sizes); form.elements.caseProfiles.value = JSON.stringify(state.profiles);
}
function bindLabPlan(form) {
  ['count', 'seed', 'minSize', 'maxSize', 'sizeMode', 'density'].forEach(name => form.elements[name]?.addEventListener('input', () => renderLabPlan(form)));
  form.addEventListener('change', event => { if (event.target.matches('[data-case-size], [data-case-profile]')) renderLabPlan(form); });
  document.querySelector('#lab-density-bars')?.addEventListener('click', event => { const index = event.target.closest('[data-case-select]')?.dataset.caseSelect; if (index !== undefined) document.querySelector(`[data-case-size="${index}"]`)?.focus(); });
  renderLabPlan(form);
}
function labPlanSection() { return '<section class="panel admin-form-section span-all"><div class="section-heading"><div><h2>数据规模与密度</h2><p>每根柱表示一组数据；警示色表示 Corner Case。点击柱可定位对应数据组。</p></div><span class="lab-plan-legend"><i></i>Corner Case</span></div><input type="hidden" name="caseSizes"><input type="hidden" name="caseProfiles"><div class="form-grid lab-plan-controls"><label class="form-field"><span>规模模式</span><select name="sizeMode"><option value="approximate">大概规模</option><option value="exact">精确指定每组</option></select></label><label class="form-field"><span>最小规模</span><input name="minSize" type="number" min="1" max="100000" value="3" required></label><label class="form-field"><span>最大规模</span><input name="maxSize" type="number" min="1" max="100000" value="1000" required></label><label class="form-field"><span>数据密度 <output name="densityValue">55%</output></span><input name="density" type="range" min="0" max="100" value="55"></label></div><div class="lab-density-chart" id="lab-density-bars" role="img" aria-label="各组计划数据规模分布"></div><div class="lab-case-rows" id="lab-case-rows"></div></section>'; }
function labSourceSection(name, title, hint, value) { return '<section class="panel admin-form-section"><div class="section-heading"><div><h2>' + title + '</h2><p>' + hint + '</p></div></div><label class="form-field"><textarea class="checker-editor" name="' + name + '" rows="12" spellcheck="false">' + escapeHtml(value) + '</textarea></label></section>'; }
function labRunCard(run) { const report = run.report || {}; const conflict = run.conflict; let html = '<article><div class="panel-head"><div><span class="status-pill ' + escapeHtml(run.status) + '">' + escapeHtml(run.status) + '</span><h2 style="margin:10px 0 3px">' + escapeHtml(run.title) + '</h2><p class="subtitle">' + new Date(run.startedAt).toLocaleString() + ' · Seed ' + escapeHtml(run.seed) + ' · ' + run.count + ' 组 · ' + escapeHtml(run.stage || '') + '</p></div><strong>' + (run.progress || 0) + '%</strong>' + (run.exportReady ? '<button type="button" class="text-button lab-export" data-export-lab="' + escapeHtml(run.id) + '">导出数据</button>' : '') + '<button type="button" class="text-button lab-delete" data-delete-lab="' + escapeHtml(run.id) + '">删除</button></div><div class="report-grid"><div class="report-metric"><strong>' + (report.validity ?? 0) + '%</strong><small>输入合法性</small></div><div class="report-metric"><strong>' + (report.boundaryCoverage ?? 0) + '%</strong><small>边界覆盖</small></div><div class="report-metric"><strong>' + (report.mutationKillRate == null ? '—' : report.mutationKillRate + '%') + '</strong><small>差异击杀率</small></div><div class="report-metric"><strong>' + (report.conflicts ?? 0) + '</strong><small>对拍冲突</small></div></div>'; if (run.error) html += '<div class="form-error">' + escapeHtml(run.error) + '</div>'; if (conflict) html += '<div class="conflict-box"><strong>已缩小反例</strong><code>' + escapeHtml(conflict.input) + '</code><small>标程 ' + escapeHtml(conflict.standardOutput) + ' · 暴力 ' + escapeHtml(conflict.bruteOutput) + ' · Seed ' + escapeHtml(conflict.seed) + '</small></div>'; else html += '<div class="empty-state compact">未发现标程与暴力程序差异。</div>'; return html + '<p class="subtitle">' + escapeHtml(report.recommendation || '') + '</p></article>'; }
async function renderDataLab() { if (!['ADMIN','SUPER_ADMIN','SETTER'].includes(state.user?.role)) { content.innerHTML = pageHead('AI 数据实验室', '该工作区仅向出题人和管理员开放。') + '<div class="empty-state"><strong>需要管理员权限</strong>请使用管理员账号登录。</div>'; return; } const steps = ['题意结构化','测试策略','数据生成','对拍验证','反例缩小','质量报告'].map(step => '<div class="pipeline-step">' + step + '</div>').join(''); const templates = labTemplateSet('cpp17'); content.innerHTML = pageHead('CTHOJ AI 数据实验室', '生成、校验、对拍、缩小和审计测试数据；结论来自隔离执行服务。') + '<div class="lab-pipeline">' + steps + '</div><form id="lab-form" class="problem-form"><section class="panel admin-form-section span-all"><div class="section-heading"><div><h2>运行参数</h2><p>每组生成器接收一个 Seed，输出一组测试输入</p></div><span class="tag" id="lab-usage">AI 配额加载中</span></div><div class="form-grid"><label class="form-field"><span>运行名称</span><input name="title" value="配对之和数据审计" required></label><label class="form-field"><span>题面（供 AI 分析）</span><textarea name="statement" rows="3"></textarea></label><label class="form-field"><span>初始 Seed</span><input name="seed" type="number" value="20260815" required></label><label class="form-field"><span>生成组数</span><input name="count" type="number" min="1" max="100" value="5" required></label><label class="form-field"><span>语言</span><select name="language"><option value="cpp17">C++17</option><option value="cpp20">C++20</option><option value="python3">Python 3</option><option value="java17">Java 17</option></select></label><label class="form-field"><span>提示词版本</span><select name="promptVersionId" id="lab-prompt-version"></select></label></div></section><section class="panel admin-form-section span-all"><div class="section-heading"><div><h2>AI 测试策略</h2><p>AI 关闭时自动使用确定性建议</p></div><button class="secondary-button" id="lab-strategy" type="button">生成策略</button></div><div id="lab-strategy-result" class="empty-state compact">尚未生成策略。</div></section>' + labSourceSection('generatorSource','生成器','stdin: seed · stdout: 单组输入',templates.generator) + labSourceSection('validatorSource','Validator','stdin: 测试输入 · stdout: VALID',templates.validator) + labSourceSection('referenceSource','标程','stdin: 测试输入 · stdout: 结果',templates.reference) + labSourceSection('bruteSource','暴力程序','用于差分对拍，可留空跳过',templates.brute) + '<div class="problem-form-actions span-all"><span class="form-error" id="lab-form-error"></span><button class="primary-button" id="run-lab" type="submit">运行数据实验室</button></div></form><section class="panel" id="lab-zip"><div class="section-heading"><div><h2>ZIP 测试数据安全审计</h2><p>只解析中央目录，不解压、不执行文件。</p></div></div><div class="button-row"><input id="lab-zip-file" type="file" accept=".zip,application/zip"><button class="secondary-button" id="audit-zip" type="button">审计 ZIP</button></div><div id="lab-zip-result" class="empty-state compact">尚未选择 ZIP 文件。</div></section><section class="panel" id="lab-results"><div class="empty-state">正在加载运行记录…</div></section>'; const form = document.querySelector('#lab-form'); applyLabTemplates(form, 'cpp17'); let previousLanguage = 'cpp17'; form.elements.language.addEventListener('change', () => { const nextLanguage = form.elements.language.value; if (labSourcesEdited(form, previousLanguage) && !window.confirm('切换语言会替换四段模板，是否继续？')) { form.elements.language.value = previousLanguage; return; } applyLabTemplates(form, nextLanguage); previousLanguage = nextLanguage; }); document.querySelector('#lab-strategy').insertAdjacentHTML('afterend', '<button class="secondary-button" id="lab-new-prompt" type="button">新建提示词版本</button><button class="secondary-button" id="lab-test-ai" type="button">测试模型 API</button><span class="subtitle" id="lab-ai-test-result"></span>'); document.querySelector('#lab-new-prompt').addEventListener('click', createLabPromptVersion); document.querySelector('#lab-test-ai').addEventListener('click', testLabAiApi); document.querySelector('#lab-results').addEventListener('click', event => { const button = event.target.closest('[data-delete-lab]'); if (button) deleteLabRun(button.dataset.deleteLab); }); form.addEventListener('submit', runLab); document.querySelector('#lab-strategy').addEventListener('click', generateLabStrategy); document.querySelector('#audit-zip').addEventListener('click', auditLabZip); await loadLabRuns(); }
async function loadLabRuns() { const result = await api('/admin/data-lab'); const usage = document.querySelector('#lab-usage'); if (usage) usage.textContent = 'AI 今日 ' + (result.usage?.count || 0) + ' / ' + (result.usage?.quota || '—'); const prompt = document.querySelector('#lab-prompt-version'); if (prompt) prompt.innerHTML = (result.prompts || []).map(item => '<option value="' + escapeHtml(item.id) + '">v' + item.version + ' · ' + escapeHtml(item.name) + '</option>').join(''); const host = document.querySelector('#lab-results'); host.innerHTML = result.items?.length ? result.items.map(labRunCard).join('<hr style="border:0;border-top:1px solid var(--line);margin:20px 0">') : '<div class="empty-state"><strong>暂无运行记录</strong>配置执行程序后运行一次审计。</div>'; }
async function deleteLabRun(runId) { if (!window.confirm('确认删除这条审计运行及其关联记录吗？')) return; try { await api('/admin/data-lab/' + encodeURIComponent(runId), { method: 'DELETE' }); toast('审计运行已删除'); await loadLabRuns(); } catch (error) { toast(error.message); } }
async function exportLabRun(runId) { try { const response = await fetch('/api/v1/admin/data-lab/' + encodeURIComponent(runId) + '/export', { credentials: 'include' }); if (!response.ok) { const payload = await response.json(); throw new Error(payload.error?.message || '导出失败'); } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'cthoj-data-lab-' + runId + '.zip'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('完整测试数据已开始下载'); } catch (error) { toast(error.message); } }
document.addEventListener('click', event => { const button = event.target.closest('[data-export-lab]'); if (button) exportLabRun(button.dataset.exportLab); });
async function runLab(event) { event.preventDefault(); const form = event.currentTarget; const button = document.querySelector('#run-lab'); const error = document.querySelector('#lab-form-error'); button.disabled = true; button.textContent = '隔离执行中…'; error.textContent = ''; try { await api('/admin/data-lab/run', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); toast('数据实验室运行完成'); await loadLabRuns(); } catch (submitError) { error.textContent = submitError.message; } finally { button.disabled = false; button.textContent = '运行数据实验室'; } }
async function generateLabStrategy() { const form = document.querySelector('#lab-form'); const button = document.querySelector('#lab-strategy'); const result = document.querySelector('#lab-strategy-result'); button.disabled = true; button.textContent = '分析中…'; try { const data = new FormData(form); const language = data.get('language'); const response = await api('/admin/data-lab/strategy', { method: 'POST', body: JSON.stringify({ title: data.get('title'), statement: data.get('statement'), language, promptVersionId: data.get('promptVersionId') }) }); const strategy = response.strategy; result.innerHTML = '<strong>' + escapeHtml(strategy.title || '测试策略') + '</strong><ul>' + (strategy.strategy || []).map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul><small>' + escapeHtml(strategy.notes || '') + '</small>'; if (strategy.generatorTemplate && strategy.available && strategy.language === language) form.elements.generatorSource.value = strategy.generatorTemplate; if (strategy.validatorTemplate && strategy.available && strategy.language === language) form.elements.validatorSource.value = strategy.validatorTemplate; toast(strategy.available ? 'AI 策略已生成' : '已使用确定性策略'); } catch (error) { result.textContent = error.message; } finally { button.disabled = false; button.textContent = '生成策略'; } }
async function auditLabZip() { const file = document.querySelector('#lab-zip-file').files[0]; const result = document.querySelector('#lab-zip-result'); if (!file) { result.textContent = '请先选择 ZIP 文件'; return; } if (file.size > 40 * 1024 * 1024) { result.textContent = 'ZIP 不能超过 40MB'; return; } const button = document.querySelector('#audit-zip'); button.disabled = true; button.textContent = '审计中…'; try { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); const response = await api('/admin/data-lab/zip-audit', { method: 'POST', body: JSON.stringify({ zipBase64: btoa(binary) }) }); const audit = response.audit; result.innerHTML = '<strong>' + (audit.safe ? '审计通过' : '拒绝导入') + '</strong><p>' + audit.fileCount + ' 个条目 · 解压后 ' + audit.uncompressedBytes + ' 字节</p>' + (audit.findings.length ? '<ul>' + audit.findings.map(item => '<li><span class="tag">' + escapeHtml(item.severity) + '</span> ' + escapeHtml(item.path) + '：' + escapeHtml(item.reason) + '</li>').join('') + '</ul>' : '<small>未发现结构性问题。</small>') + '<p class="subtitle">' + escapeHtml(audit.recommendation) + '</p>'; } catch (error) { result.textContent = error.message; } finally { button.disabled = false; button.textContent = '审计 ZIP'; } }
async function testLabAiApi() { const button = document.querySelector('#lab-test-ai'); const result = document.querySelector('#lab-ai-test-result'); button.disabled = true; button.textContent = '测试中…'; result.textContent = ''; try { const response = await api('/admin/ai/test', { method: 'POST', body: '{}' }); const check = response.result; result.textContent = (check.ok ? '✓ ' : '✕ ') + check.message + (check.latencyMs ? ` · ${check.latencyMs} ms` : ''); result.style.color = check.ok ? 'var(--success)' : 'var(--danger)'; } catch (error) { result.textContent = error.message; result.style.color = 'var(--danger)'; } finally { button.disabled = false; button.textContent = '测试模型 API'; } }
async function createLabPromptVersion() { const name = window.prompt('提示词版本名称'); if (!name) return; const systemPrompt = window.prompt('系统提示词（仅存储在服务器）'); if (!systemPrompt) return; try { await api('/admin/data-lab/prompts', { method: 'POST', body: JSON.stringify({ name, systemPrompt }) }); toast('提示词版本已创建'); await loadLabRuns(); } catch (error) { toast(error.message); } }
function setAuthMode(mode) {
  const form = document.querySelector('#login-form');
  const register = mode === 'register';
  form.dataset.authMode = mode;
  document.querySelector('#auth-title').textContent = register ? '创建 CTHOJ 账号' : '登录到 CTHOJ';
  document.querySelector('#auth-submit').textContent = register ? '注册并登录' : '登录';
  document.querySelector('#auth-switch').textContent = register ? '已有账号？返回登录' : '没有账号？立即注册';
  document.querySelector('#account-note').textContent = register ? '用户名仅支持字母、数字和下划线，密码至少 8 位。' : '公网实例已禁用默认 Seed 密码，请使用服务器账号。';
  document.querySelectorAll('[data-register-field]').forEach(field => { field.hidden = !register; field.querySelector('input').required = register && field.querySelector('input').name === 'confirmPassword'; });
  form.elements.password.autocomplete = register ? 'new-password' : 'current-password';
  document.querySelector('#login-error').textContent = '';
}

function showAuth(mode = 'login') { setAuthMode(mode); if (!authDialog.open) authDialog.showModal(); }

function bindActions() { document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go))); document.querySelectorAll('[data-problem]').forEach(button => button.addEventListener('click', () => openProblem(button.dataset.problem))); document.querySelectorAll('[data-contest]').forEach(button => button.addEventListener('click', () => openContest(button.dataset.contest))); document.querySelectorAll('[data-contest-scoreboard]').forEach(button => button.addEventListener('click', () => openContestScoreboard(button.dataset.contestScoreboard))); document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => showAuth())); }

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  state.user = null; state.notifications = []; state.notificationUnread = 0; updateUser(); setNotificationMenu(false); toast('已退出登录'); navigate('dashboard');
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
document.querySelector('#theme-toggle').addEventListener('click', () => { const dark = document.documentElement.dataset.theme === 'dark'; document.documentElement.dataset.theme = dark ? '' : 'dark'; localStorage.setItem('cthoj-theme', dark ? 'light' : 'dark'); });
document.documentElement.dataset.theme = localStorage.getItem('cthoj-theme') === 'dark' ? 'dark' : '';
document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
document.querySelector('#notification-button').addEventListener('click', async (event) => { event.stopPropagation(); if (!state.user) { showAuth(); return; } setNotificationMenu(document.querySelector('#notification-dropdown').hidden); if (!document.querySelector('#notification-dropdown').hidden) { try { await loadNotifications(); renderNotificationDropdown(); } catch (error) { toast(error.message); } } });
 userMenuButton.addEventListener('click', (event) => { event.stopPropagation(); if (!state.user) showAuth(); else setUserMenu(userDropdown.hidden); });
userDropdown.addEventListener('click', async (event) => { const action = event.target.closest('[data-user-action]')?.dataset.userAction; if (action === 'profile') navigate('profile'); if (action === 'logout') { try { await logout(); } catch (error) { toast(error.message); } } });
document.addEventListener('click', (event) => { if (!event.target.closest('.user-menu-wrap')) setUserMenu(false); if (!event.target.closest('.notification-wrap')) setNotificationMenu(false); });
document.querySelector('#auth-switch').addEventListener('click', () => showAuth(document.querySelector('#login-form').dataset.authMode === 'register' ? 'login' : 'register'));
document.querySelector('#login-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const mode = form.dataset.authMode || 'login'; if (mode === 'register' && values.password !== values.confirmPassword) { document.querySelector('#login-error').textContent = '两次输入的密码不一致'; return; } try { const payload = mode === 'register' ? { username: values.username, displayName: values.displayName, email: values.email, password: values.password } : { username: values.username, password: values.password }; const result = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload) }); state.user = result.user; try { state.submissions = (await api('/submissions')).items; } catch { state.submissions = []; } try { const notifications = await api('/notifications'); state.notifications = notifications.items; state.notificationUnread = notifications.unread; } catch { state.notifications = []; state.notificationUnread = 0; } updateUser(); authDialog.close(); toast(mode === 'register' ? '注册成功，已自动登录' : '登录成功'); navigate(state.view); } catch (error) { document.querySelector('#login-error').textContent = error.message; } });
document.querySelector('#global-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { navigate('problems'); setTimeout(()=>{ const input = document.querySelector('#problem-search'); if (input) { input.value = event.target.value; filterProblems(); } }, 0); } });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') setUserMenu(false); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#global-search').focus(); } });
window.addEventListener('hashchange', () => { const [view, contestId] = location.hash.slice(1).split('/'); if (view === 'contest-scoreboard' && contestId) state.selectedContestId = contestId; if (view && view !== state.view) navigate(view); });

bootstrap();
