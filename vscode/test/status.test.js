// Checks the status bar line built from server snapshots. Run with `npm test` in this folder.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// The extension needs the `vscode` module, which only exists inside VS Code: give it the one class it uses here.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return { MarkdownString: class { constructor(value) { this.value = value; } } };
  return load.call(this, request, ...rest);
};
const { describe, pluginInstalled, pluginVersion, sceneQuery, sceneLanguage, formatDiagnostics } = require('../extension.js');

const idle = { state: 'waiting', tool: null, detail: null, done: false };
const snapshot = (session) => ({ active: 's', sessions: { s: session } });
const DESKS = ['BA', 'SA', 'Architect', 'UX', 'Dev', 'DBA', 'QA', 'DevOps', 'Security', 'Writer'];
const roles = (overrides = {}) => ({ ...Object.fromEntries(DESKS.map((d) => [d, idle])), ...overrides });

test('no server or no task shows the plain label', () => {
  assert.equal(describe(null).text, '$(eye) IT-Office-3D');
  assert.equal(describe(snapshot({ roles: roles(), startedAt: null })).text, '$(eye) IT-Office-3D');
});

test('a running tool shows its role and tool', () => {
  const s = snapshot({ roles: roles({ Dev: { state: 'working', tool: 'Edit', detail: 'src/a.js', done: false } }), startedAt: Date.now() - 3000, endedAt: null, tokens: null });
  const { text, tooltip } = describe(s);
  assert.equal(text, '$(loading~spin) Dev · Edit');
  assert.match(tooltip.value, /Dev: Edit · src\/a\.js/);
  // Idle desks are left out of the tooltip.
  assert.doesNotMatch(tooltip.value, /QA/);
});

test('a finished turn shows the token total', () => {
  const s = snapshot({
    roles: roles({ Writer: { state: 'done', tool: null, detail: null, done: true } }),
    startedAt: 1000,
    endedAt: 8000,
    tokens: { input: 18, output: 281, cacheRead: 64456, cacheWrite: 25756 },
  });
  assert.equal(describe(s).text, '$(check) IT-Office-3D · 25.8k in / 281 out');
  assert.match(describe(s).tooltip.value, /7s/);
});

test('paths in the tooltip cannot inject markdown', () => {
  const s = snapshot({ roles: roles({ SA: { state: 'working', tool: 'Read', detail: '[x](command:evil)', done: false } }), startedAt: Date.now(), endedAt: null });
  assert.doesNotMatch(describe(s).tooltip.value, /\[x\]\(command/);
});

test("Claude's summary of a call replaces the tool name", () => {
  const working = { state: 'working', tool: 'Bash', detail: 'npm test', note: 'Run the core test suite', done: false };
  const s = snapshot({ roles: roles({ QA: working }), startedAt: Date.now(), endedAt: null });
  assert.equal(describe(s).text, '$(loading~spin) QA · Run the core test suite');
  assert.match(describe(s).tooltip.value, /QA: Run the core test suite \(Bash · npm test\)/);
  const long = snapshot({ roles: roles({ QA: { ...working, note: 'x'.repeat(60) } }), startedAt: Date.now(), endedAt: null });
  assert.equal(describe(long).text.length, '$(loading~spin) QA · '.length + 40);
});

test('a missing plugin is flagged until Claude starts working', () => {
  assert.equal(describe(null, false).text, '$(warning) IT-Office-3D');
  assert.match(describe(null, false).tooltip, /claude plugin install it-office-3d@it-office-3d/);
  // Unknown (no Claude Code plugin list) never warns.
  assert.equal(describe(null, null).text, '$(eye) IT-Office-3D');
  const s = snapshot({ roles: roles(), startedAt: 1000, endedAt: 2000, tokens: null });
  assert.equal(describe(s, false).text, '$(check) IT-Office-3D · tokens —');
});

test('the plugin is found in Claude Code\'s plugin list', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ito3d-')), 'installed_plugins.json');
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: { 'it-office-3d@it-office-3d': [{}] } }));
  assert.equal(pluginInstalled(file), true);
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: { 'other@x': [{}] } }));
  assert.equal(pluginInstalled(file), false);
  assert.equal(pluginInstalled(file + '.missing'), null);
});

test('the scene URL carries the chosen session and the workspace folders', () => {
  const q = new URLSearchParams(sceneQuery('', ['C:\\work\\shop', '/home/me/api']));
  assert.equal(q.get('session'), '');
  assert.deepEqual(q.getAll('cwd'), ['C:\\work\\shop', '/home/me/api']);
  assert.equal(new URLSearchParams(sceneQuery('abc', [])).get('session'), 'abc');
});

test('the scene language follows the setting, else VS Code', () => {
  assert.equal(sceneLanguage('auto', 'th'), 'th');
  assert.equal(sceneLanguage('auto', 'en-us'), 'en');
  assert.equal(sceneLanguage('auto', 'ja'), 'en');
  assert.equal(sceneLanguage('th', 'en'), 'th');
  assert.equal(sceneLanguage('en', 'th'), 'en');
});

test('diagnostics flag a missing plugin and an outdated server', () => {
  const base = { extension: '0.4.0', vscode: '1.99.0', platform: 'win32-x64', language: 'th', api: 2, roots: ['C:/work/shop'], follow: '', sessions: {}, active: null, events: [], now: 10_000 };
  const bad = formatDiagnostics({ ...base, plugin: null, health: { pid: 7, port: 3737 } });
  assert.match(bad, /Plugin\s+NOT FOUND/);
  assert.match(bad, /api 1 \(OUTDATED: needs 2\)/);
  const good = formatDiagnostics({
    ...base,
    plugin: '0.3.0',
    health: { pid: 8, port: 3737, api: 2 },
    sessions: { abcdef123456: { cwd: 'C:/work/shop', updatedAt: 4_000 } },
    active: 'abcdef123456',
    events: [{ at: 't', event: 'PreToolUse', tool: 'Bash', session: 'abcdef12' }],
  });
  assert.doesNotMatch(good, /OUTDATED|NOT FOUND/);
  assert.match(good, /Showing\s+abcdef12 in C:\/work\/shop/);
  assert.match(good, /last active 6s ago/);
  assert.match(good, /PreToolUse Bash/);
});

test("the plugin version is read from Claude Code's plugin list", () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ito3d-')), 'installed_plugins.json');
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: { 'it-office-3d@it-office-3d': [{ version: '0.3.0' }] } }));
  assert.equal(pluginVersion(file), '0.3.0');
  assert.equal(pluginVersion(file + '.missing'), null);
});
