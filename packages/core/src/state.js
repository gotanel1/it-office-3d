import { AGENTS, ROLES, roleForTool, roleForAgentType } from './rules.js';

// The reducer turns generic events into a state snapshot.
// Hook payloads are mapped to this shape by adapter.js.
//
// event: SessionStart | UserPromptSubmit | ModelCall | PreToolUse | PostToolUse | PermissionRequest | Notification | SubagentStop | Stop
// fields: session_id, agent, cwd, tool, command, path, file, note, failed, notification_type, subagent_type, agent_type, role

// `failed`: the last call of this desk in the current task failed (cleared when the desk starts again).
const idleRole = () => ({ state: 'waiting', tool: null, detail: null, note: null, done: false, failed: false, running: 0 });

// `waiting`: Claude asked the user for permission and has not had an answer yet.
function newSession() {
  const roles = Object.fromEntries(ROLES.map((role) => [role, idleRole()]));
  return { roles, agent: 'claude', startedAt: null, endedAt: null, tokens: null, cwd: null, waiting: null, updatedAt: 0 };
}

// `logs` holds what each desk did in the current task (sessionId -> role -> entries). It is served on
// request by /activity instead of with every snapshot, which keeps the live updates small.
export function createState() {
  return { active: null, sessions: {}, logs: {} };
}

const LOG_LIMIT = 15;

function logCall(state, id, role, ev, now) {
  const desks = (state.logs[id] ??= {});
  const log = (desks[role] ??= []);
  log.push({ at: now, tool: ev.tool ?? null, detail: ev.command ?? ev.path ?? null, note: ev.note ?? null, file: ev.file ?? null, failed: false });
  if (log.length > LOG_LIMIT) log.shift();
}

function markFailed(state, id, role, ev) {
  const log = state.logs[id]?.[role] ?? [];
  const detail = ev.command ?? ev.path ?? null;
  const entry = [...log].reverse().find((e) => e.tool === ev.tool && e.detail === detail && !e.failed);
  if (entry) entry.failed = true;
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
  for (const id of ids.slice(keep)) {
    delete state.sessions[id];
    delete state.logs?.[id];
  }
  if (state.active && !state.sessions[state.active]) state.active = ids[0] ?? null;
}

// The session a viewer sees: the one it picked, else the newest session working inside its folders (a VS
// Code window passes its workspace), else the newest session overall.
export function activeFor(state, sessionId, roots = []) {
  if (sessionId && state.sessions[sessionId]) return sessionId;
  if (roots.length === 0) return state.active;
  return newest(state, roots);
}

// The session each AI shows in the shared office: only the picked one, else each AI's newest session
// (inside the viewer's folders when it passes any).
export function crewFor(state, sessionId, roots = []) {
  if (sessionId && state.sessions[sessionId]) return { [state.sessions[sessionId].agent ?? 'claude']: sessionId };
  const crew = {};
  for (const agent of AGENTS) {
    const id = newest(state, roots, (s) => (s.agent ?? 'claude') === agent);
    if (id) crew[agent] = id;
  }
  return crew;
}

function newest(state, roots, keep = () => true) {
  // Case is ignored because Windows reports the same folder with different drive-letter case.
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const wanted = roots.map(norm);
  const inside = (cwd) => !wanted.length || (cwd && wanted.some((root) => norm(cwd) === root || norm(cwd).startsWith(`${root}/`)));
  let best = null;
  for (const [id, session] of Object.entries(state.sessions)) {
    if (keep(session) && inside(session.cwd) && (!best || session.updatedAt > state.sessions[best].updatedAt)) best = id;
  }
  return best;
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
    case 'ModelCall':
      // Only the first model call of a turn starts a task; the others are steps inside it.
      if (session.startedAt && !session.endedAt) break;
    // falls through
    case 'UserPromptSubmit': {
      const fresh = newSession();
      fresh.cwd = session.cwd;
      fresh.agent = session.agent;
      fresh.startedAt = now;
      fresh.roles.BA = { ...idleRole(), state: 'working', tool: 'Reading prompt', running: 1 };
      session = fresh;
      if (state.logs) delete state.logs[id];
      break;
    }
    case 'PreToolUse': {
      const role = roleForTool(ev.tool, ev.command, ev.subagent_type, ev.path);
      clearPlaceholders(session);
      // A new call means an earlier permission question was answered.
      session.waiting = null;
      if (!role) keepSomeoneBusy(session);
      if (role) {
        const r = session.roles[role];
        session.roles[role] = {
          ...r,
          state: 'working',
          tool: ev.tool,
          detail: ev.command ?? ev.path ?? null,
          note: ev.note ?? null,
          failed: false,
          running: (r.running ?? 0) + 1,
        };
        if (state.logs) logCall(state, id, role, ev, now);
      }
      break;
    }
    case 'PermissionRequest':
      session.waiting = { tool: ev.tool ?? null, detail: ev.command ?? ev.path ?? null, note: ev.note ?? null, since: now };
      break;
    case 'Notification':
      // Older Claude Code versions only send the notification, not PermissionRequest.
      if (ev.notification_type === 'permission_prompt' && !session.waiting) session.waiting = { tool: null, detail: null, note: null, since: now };
      break;
    case 'PostToolUse': {
      const role = roleForTool(ev.tool, ev.command, ev.subagent_type, ev.path);
      session.waiting = null;
      if (role && session.roles[role].state === 'working') {
        const r = session.roles[role];
        const running = Math.max(0, (r.running ?? 1) - 1);
        const failed = r.failed || Boolean(ev.failed);
        // Several tools of one role can overlap: stay busy until the last one reports back.
        session.roles[role] = running > 0 ? { ...r, running, failed } : { ...r, state: 'waiting', tool: null, detail: null, note: null, failed, running: 0 };
      }
      if (role && ev.failed && state.logs) markFailed(state, id, role, ev);
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
      session.roles.Writer = { ...session.roles.Writer, state: 'done', tool: null, detail: null, note: null, done: true, running: 0 };
      session.endedAt = now;
      session.waiting = null;
      break;
    }
    default:
      return state;
  }

  if (ev.cwd) session.cwd = ev.cwd;
  if (ev.agent) session.agent = ev.agent;
  session.updatedAt = now;
  state.sessions[id] = session;
  state.active = id;
  return state;
}
