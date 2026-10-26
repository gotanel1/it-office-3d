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
const { describe } = require('../extension.js');

const idle = { state: 'waiting', tool: null, detail: null, done: false };
const snapshot = (session) => ({ active: 's', sessions: { s: session } });
const DESKS = ['BA', 'SA', 'Architect', 'UX', 'Dev', 'DBA', 'QA', 'DevOps', 'Security', 'Writer'];
const roles = (overrides = {}) => ({ ...Object.fromEntries(DESKS.map((d) => [d, idle])), ...overrides });

test('no server or no task shows the plain label', () => {
  assert.equal(describe(null).text, '$(eye) Claude 3D');
  assert.equal(describe(snapshot({ roles: roles(), startedAt: null })).text, '$(eye) Claude 3D');
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
  assert.equal(describe(s).text, '$(check) Claude 3D · 25.8k in / 281 out');
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
