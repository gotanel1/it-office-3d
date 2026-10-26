import { ROLES, roleForTool, roleForAgentType } from './rules.js';

// The reducer turns generic events into a state snapshot.
// Hook payloads are mapped to this shape by adapter.js.
//
// event: SessionStart | UserPromptSubmit | PreToolUse | PostToolUse | SubagentStop | Stop
// fields: session_id, cwd, tool, command, path, subagent_type, agent_type, role

const idleRole = () => ({ state: 'waiting', tool: null, detail: null, note: null, done: false, running: 0 });

function newSession() {
  const roles = Object.fromEntries(ROLES.map((role) => [role, idleRole()]));
  return { roles, startedAt: null, endedAt: null, tokens: null, cwd: null, updatedAt: 0 };
}

export function createState() {
  return { active: null, sessions: {} };
}

// Roles that stay "working" after a lost PostToolUse (for example an interrupted turn) are released after this long.
export const STALE_WORKING_MS = 10 * 60 * 1000;

// Drops stale "working" states. Returns true when something changed.
export function expireStale(state, now = Date.now()) {
  let changed = false;
  for (const session of Object.values(state.sessions)) {
    if (!session.updatedAt || now - session.updatedAt < STALE_WORKING_MS) continue;
    for (const role of ROLES) {
      const r = session.roles[role];
      if (r.state === 'working') {
        session.roles[role] = { ...r, state: 'waiting', tool: null, detail: null, note: null, running: 0 };
        changed = true;
      }
    }
  }
  return changed;
}

// Keeps the newest sessions only, so a long-lived server does not grow without bound.
export function pruneSessions(state, keep = 12) {
  const ids = Object.keys(state.sessions);
  if (ids.length <= keep) return;
  ids.sort((a, b) => state.sessions[b].updatedAt - state.sessions[a].updatedAt);
  for (const id of ids.slice(keep)) delete state.sessions[id];
  if (state.active && !state.sessions[state.active]) state.active = ids[0] ?? null;
}

// Placeholder work: the BA reads each new prompt, and the architect "thinks" while a turn is running and
// no tool is busy (the model is reasoning or writing). Nothing reports those phases, so without this the
// scene would look idle during the longest part of a turn.
const PLACEHOLDERS = { 'Reading prompt': 'BA', Thinking: 'Architect' };

function keepSomeoneBusy(session) {
  if (!session.startedAt || session.endedAt) return;
  if (Object.values(session.roles).some((r) => r.state === 'working')) return;
  const a = session.roles.Architect;
  session.roles.Architect = { state: 'working', tool: 'Thinking', detail: null, note: null, done: a.done, running: 0 };
}

// A real tool ends the placeholders: the BA has read the prompt, the architect stops thinking.
function clearPlaceholders(session) {
  for (const [tool, role] of Object.entries(PLACEHOLDERS)) {
    if (session.roles[role].tool === tool) session.roles[role] = { ...idleRole(), done: session.roles[role].done };
  }
}

export function reduce(state, ev) {
  const id = ev.session_id ?? 'default';
  const now = Date.now();
  let session = state.sessions[id] ?? newSession();

  switch (ev.event) {
    case 'SessionStart':
      break;
    case 'UserPromptSubmit': {
      const fresh = newSession();
      fresh.cwd = session.cwd;
      fresh.startedAt = now;
      fresh.roles.BA = { state: 'working', tool: 'Reading prompt', detail: null, note: null, done: false, running: 1 };
      session = fresh;
      break;
    }
    case 'PreToolUse': {
      const role = roleForTool(ev.tool, ev.command, ev.subagent_type, ev.path);
      clearPlaceholders(session);
      if (!role) keepSomeoneBusy(session);
      if (role) {
        const r = session.roles[role];
        session.roles[role] = {
          ...r,
          state: 'working',
          tool: ev.tool,
          detail: ev.command ?? ev.path ?? null,
          note: ev.note ?? null,
          running: (r.running ?? 0) + 1,
        };
      }
      break;
    }
    case 'PostToolUse': {
      const role = roleForTool(ev.tool, ev.command, ev.subagent_type, ev.path);
      if (role && session.roles[role].state === 'working') {
        const r = session.roles[role];
        const running = Math.max(0, (r.running ?? 1) - 1);
        // Several tools of one role can overlap: stay busy until the last one reports back.
        session.roles[role] = running > 0 ? { ...r, running } : { ...r, state: 'waiting', tool: null, detail: null, note: null, running: 0 };
      }
      keepSomeoneBusy(session);
      break;
    }
    case 'SubagentStop': {
      const role = ev.role ?? roleForAgentType(ev.agent_type);
      session.roles[role] = { ...session.roles[role], state: 'waiting', tool: null, detail: null, note: null, done: true, running: 0 };
      keepSomeoneBusy(session);
      break;
    }
    case 'Stop': {
      // The turn is over: nobody is working any more, and the writer has delivered the answer.
      for (const role of ROLES) {
        const r = session.roles[role];
        session.roles[role] = { ...r, state: 'waiting', tool: null, detail: null, note: null, running: 0 };
      }
      session.roles.Writer = { state: 'done', tool: null, detail: null, note: null, done: true, running: 0 };
      session.endedAt = now;
      break;
    }
    default:
      return state;
  }

  if (ev.cwd) session.cwd = ev.cwd;
  session.updatedAt = now;
  state.sessions[id] = session;
  state.active = id;
  return state;
}
