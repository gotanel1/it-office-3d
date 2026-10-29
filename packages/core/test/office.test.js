import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../public/office-data.js';
import { planWork, createLead, HOME, destination, buildPath, deskState } from '../public/office-model.js';
import { createState, reduce } from '../src/state.js';
import { startServer } from '../src/server.js';

function fixture() {
  let state = createState();
  let previous = null;
  return (event, extra = {}) => {
    state = reduce(state, { event, session_id: 'test', ...extra });
    const result = planWork(previous, state);
    previous = result.memory;
    return result;
  };
}

test('real server transitions retain first-load, assign, duplicate and completion semantics', () => {
  const send = fixture();
  assert.deepEqual(send('UserPromptSubmit').events, []);
  const read = { tool: 'Read', path: '/project/main.js' };
  assert.equal(send('PreToolUse', read).events[0].role, 'SA');
  assert.deepEqual(send('PreToolUse', read).events, []);
  // Two overlapping calls still need two completion events, exactly as in the server reducer.
  assert.deepEqual(send('PostToolUse', read).events, []);
  assert.deepEqual(send('PostToolUse', read).events, []);
  assert.equal(send('SubagentStop', { role: 'SA' }).events[0].type, 'praise');
  assert.ok(send('Stop').events.some((e) => e.role === 'Writer' && e.type === 'wrapUp'));
});

test('switching sessions or starting a new turn resets presentation state', () => {
  const snap = (active, startedAt) => ({ active, sessions: { [active]: { startedAt, roles: { Dev: { state: 'working', tool: 'Edit', detail: 'a.js' } } } } });
  const first = planWork(null, snap('one', 1));
  assert.deepEqual(first.events, []);
  const switched = planWork(first.memory, snap('two', 1));
  assert.equal(switched.reset, true);
  assert.equal(switched.events[0].role, 'Dev');
  assert.equal(planWork(switched.memory, snap('two', 2)).newTask, true);
  assert.equal(planWork(switched.memory, { active: null, sessions: {} }).reset, true);
});

test('thinking is never assigned, but changed tool detail or note is', () => {
  const snap = (tool, detail, note) => ({ active: 's', sessions: { s: { startedAt: 1, roles: { Dev: { state: 'working', tool, detail, note } } } } });
  const first = planWork(null, snap('Edit', 'a.js', 'First'));
  assert.deepEqual(planWork(first.memory, snap('Thinking')).events, []);
  assert.equal(planWork(first.memory, snap('Edit', 'b.js', 'First')).events.length, 1);
  assert.equal(planWork(first.memory, snap('Edit', 'a.js', 'Second')).events.length, 1);
});

test('PM walks via aisles, hands over once after 1.3 seconds, talks for 2.8 seconds, returns home', () => {
  const lead = createLead();
  lead.enqueue({ type: 'assign', role: 'QA' });
  assert.equal(lead.mode, 'walking');
  for (let i = 0; i < 300 && lead.mode === 'walking'; i++) lead.tick(0.1);
  assert.equal(lead.mode, 'talking');
  assert.deepEqual(lead.position, destination(6));
  assert.equal(lead.tick(1.2), null);
  assert.equal(lead.tick(0.2), 'QA');
  assert.equal(lead.tick(0.2), null);
  lead.tick(1.3);
  assert.equal(lead.mode, 'walking');
  for (let i = 0; i < 300 && lead.mode !== 'idle'; i++) lead.tick(0.1);
  assert.deepEqual(lead.position, HOME);
  assert.equal(lead.mode, 'idle');
});

test('PM queue caps at three pending tasks and reset discards old-session work', () => {
  const lead = createLead();
  for (const role of ROLES) lead.enqueue({ type: 'assign', role: role.id });
  assert.equal(lead.queue.length, 3);
  assert.deepEqual(lead.queue.map((t) => t.role), ['DevOps', 'Security', 'Writer']);
  lead.reset();
  assert.equal(lead.queue.length, 0);
  assert.equal(lead.task, null);
  for (let i = 0; i < 300 && lead.mode !== 'idle'; i++) assert.equal(lead.tick(0.1), null);
  assert.deepEqual(lead.position, HOME);
  const path = buildPath(destination(0), destination(9));
  assert.equal(path[0].y, path[1].y);
  assert.deepEqual(path.at(-1), destination(9));
});


test('new scene modules and generated assets are served locally with correct content types', async () => {
  const server = await startServer();
  try {
    for (const file of ['office.js', 'office-data.js', 'office-model.js']) {
      const response = await fetch(server.url + file);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /javascript/);
    }
    for (const file of ['office-cozy-v1.png', 'team-chibi-v1.png']) {
      const response = await fetch(`${server.url}assets/${file}`);
      assert.equal(response.headers.get('content-type'), 'image/png');
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
    }
    assert.equal((await fetch(server.url + 'office.css')).status, 200);
    assert.match(await (await fetch(server.url)).text(), /office\.js/);
  } finally { await server.close(); }
});

test('a shared desk shows the AI working there, else one that failed or finished there', () => {
  const role = (state, extra = {}) => ({ state, tool: null, detail: null, done: false, ...extra });
  const snap = {
    crew: { claude: 'c', codex: 'x' },
    sessions: {
      c: { roles: { Dev: role('waiting', { done: true }), QA: role('waiting') } },
      x: { roles: { Dev: role('working', { tool: 'apply_patch' }), QA: role('waiting', { failed: true }) } },
    },
  };
  assert.deepEqual([deskState(snap, 'Dev').agent, deskState(snap, 'Dev').tool], ['codex', 'apply_patch']);
  assert.equal(deskState(snap, 'QA').agent, 'codex');
  assert.equal(deskState(snap, 'BA').state, 'waiting');
  // An older server sends only `active`, which is Claude's session.
  assert.equal(deskState({ active: 'c', sessions: snap.sessions }, 'Dev').agent, 'claude');
});
