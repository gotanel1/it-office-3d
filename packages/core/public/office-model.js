// Presentation-only work planner. Server classification, state and hook handling stay unchanged.
import { ROLES } from './office-data.js';

export const EMPTY_ROLE = { state: 'waiting', tool: null, detail: null, done: false };
export const isFinished = (role) => role.done || role.state === 'done';
export const activeSession = (snapshot) => snapshot.active ? snapshot.sessions[snapshot.active] : null;

// Same transition rules as planLeadWork in the original scene: never replay the first snapshot,
// assign only changed work, skip Thinking, praise completed desks, and let Writer wrap up.
export function planWork(previous, next) {
  const session = activeSession(next);
  const memory = {
    active: next.active,
    startedAt: session?.startedAt ?? null,
    roles: session ? structuredClone(session.roles) : null,
  };
  const first = previous === null;
  const newTask = !first && (next.active !== previous.active || session?.startedAt !== previous.startedAt);
  const events = [];
  if (!first && session) {
    for (const { id } of ROLES) {
      const r = session.roles[id] ?? EMPTY_ROLE;
      const p = (!newTask && previous.roles?.[id]) || EMPTY_ROLE;
      if (r.state === 'working' && r.tool !== 'Thinking' &&
          (p.state !== 'working' || p.tool !== r.tool || p.detail !== r.detail || p.note !== r.note)) {
        events.push({ type: 'assign', role: id, tool: r.tool, detail: r.detail, note: r.note });
      } else if (id === 'Writer' && r.state === 'done' && p.state !== 'done') {
        events.push({ type: 'wrapUp', role: id });
      } else if (id !== 'Writer' && r.done && !p.done) {
        events.push({ type: 'praise', role: id });
      }
    }
  }
  return { first, newTask, reset: !session || newTask, events, memory };
}

// Coordinates are fractions of the generated room image; furniture positions were inspected.
export const deskPosition = (index) => ({ x: [0.222, 0.361, 0.5, 0.638, 0.777][index % 5], y: index < 5 ? 0.468 : 0.707 });
export const HOME = { x: 0.135, y: 0.554 };
const CORRIDOR_Y = 0.536;
export function destination(index) {
  const desk = deskPosition(index);
  return { x: desk.x + 0.071, y: desk.y + 0.018 };
}

export function buildPath(from, to) {
  const points = [];
  if (Math.abs(from.x - to.x) > 0.003 || Math.abs(from.y - to.y) > 0.003) {
    if (Math.abs(from.y - CORRIDOR_Y) > 0.002) points.push({ x: from.x, y: CORRIDOR_Y });
    if (Math.abs(to.y - CORRIDOR_Y) > 0.002) points.push({ x: to.x, y: CORRIDOR_Y });
  }
  points.push({ ...to });
  return points;
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function createLead() {
  const lead = { position: { ...HOME }, queue: [], path: [], task: null, mode: 'idle', talkT: 0, handedOver: false };
  const travel = (target) => { lead.path = buildPath(lead.position, target); lead.mode = 'walking'; };
  const next = () => {
    lead.task = lead.queue.shift() ?? null;
    lead.handedOver = false;
    if (lead.task) travel(destination(ROLES.find((r) => r.id === lead.task.role).index));
    else travel(HOME);
  };
  lead.enqueue = (task) => {
    lead.queue.push(task);
    while (lead.queue.length > 3) lead.queue.shift();
    if (lead.mode === 'idle' || (lead.mode === 'walking' && !lead.task)) next();
  };
  lead.reset = () => {
    lead.queue.length = 0;
    lead.task = null;
    lead.handedOver = false;
    if (lead.mode !== 'idle') travel(HOME);
  };
  lead.tick = (dt) => {
    let handed = null;
    if (lead.mode === 'walking') {
      const target = lead.path[0];
      const dx = target.x - lead.position.x;
      const dy = target.y - lead.position.y;
      const distance = Math.hypot(dx, dy);
      const step = 0.14 * dt;
      if (distance <= step) {
        lead.position = { ...target };
        lead.path.shift();
        if (!lead.path.length) {
          lead.mode = lead.task ? 'talking' : 'idle';
          lead.talkT = 0;
          if (!lead.task && lead.queue.length) next();
        }
      } else {
        lead.position.x += dx / distance * step;
        lead.position.y += dy / distance * step;
      }
    } else if (lead.mode === 'talking') {
      lead.talkT += dt;
      if (lead.task.type === 'assign' && !lead.handedOver && lead.talkT > 1.3) {
        lead.handedOver = true;
        handed = lead.task.role;
      }
      if (lead.talkT >= 2.8) next();
    }
    return handed;
  };
  return lead;
}
