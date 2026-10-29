import { eventsUrl } from './chrome.js';
import { ROLES, messages } from './office-data.js';
import { EMPTY_ROLE, activeSession, crewOf, deskState, isFinished, planWork, deskPosition, createLead, HOMES } from './office-model.js';

const LANG = (new URLSearchParams(location.search).get('lang') || navigator.language || 'en').toLowerCase().startsWith('th') ? 'th' : 'en';
const TEXT = messages(LANG);
const tr = (en, th) => LANG === 'th' ? th : en;
document.documentElement.lang = LANG;
const ui = {
  waiting: tr('Idle', 'พร้อมรับงาน'), working: tr('Working', 'กำลังทำงาน'), done: tr('Done', 'เสร็จแล้ว'),
  failed: tr('Failed', 'ไม่ผ่าน'),
};
const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const button = (className, text, action) => {
  const el = node('button', className, text);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
};
function sprite(index, sheet = '') {
  const el = node('span', `sprite ${sheet}`.trim());
  el.style.backgroundPosition = `${index % 4 * 100 / 3}% ${Math.floor(index / 4) * 50}%`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
const truncate = (text, max) => String(text ?? '').length > max ? `${String(text).slice(0, max - 1)}…` : String(text ?? '');
const roleById = (id) => ROLES.find((r) => r.id === id);
let snapshot = { active: null, sessions: {} };
const roleState = (id) => deskState(snapshot, id);
// The AIs share one office. Each lead briefs only its own AI's work; Claude keeps the original PM art.
const LEADS = [
  { agent: 'claude', label: 'Claude', sprite: () => sprite(10), color: '#c96442' },
  { agent: 'codex', label: 'GPT', sprite: () => sprite(0, 'lead-sheet'), color: '#2f8f74' },
  { agent: 'antigravity', label: 'Antigravity', sprite: () => sprite(1, 'lead-sheet'), color: '#2f6fdb' },
].map((l) => ({ ...l, lead: createLead(HOMES[l.agent]), previous: null, handed: new Set() }));
const leadOf = (agent) => LEADS.find((l) => l.agent === agent);
const sessionOf = (agent) => snapshot.sessions[crewOf(snapshot)[agent]] ?? null;

// Real controls and status remain HTML, independent of the generated room artwork.

const pipeline = document.getElementById('pipeline');
pipeline.setAttribute('aria-label', tr('IT team', 'ทีมไอที'));
const rosterHead = node('div', 'roster-head');
const count = node('span', 'team-count', '0 / 10');
rosterHead.append(node('strong', '', tr('THE TEAM', 'ทีมงาน')), count);
const rosterList = node('div', 'roster-list');
pipeline.replaceChildren(rosterHead, rosterList, node('p', 'roster-hint', tr('Select a teammate to see their activity.', 'เลือกพนักงานเพื่อดูรายละเอียดงาน')));

const scene = document.getElementById('scene');
const room = node('div', 'office-room');
room.setAttribute('aria-label', tr('Office with ten workstations and a project manager', 'ออฟฟิศ 10 โต๊ะทำงานและผู้จัดการโครงการ'));
const backdrop = node('img', 'room-art');
backdrop.src = '/assets/office-cozy-v1.png';
backdrop.alt = '';
backdrop.draggable = false;
const assetError = node('p', 'asset-error', tr('Office artwork could not load. Reload to try again.', 'โหลดภาพออฟฟิศไม่สำเร็จ กรุณารีโหลดเพื่อลองใหม่'));
assetError.hidden = true;
backdrop.addEventListener('error', () => { assetError.hidden = false; });
room.append(backdrop);
scene.replaceChildren(room, assetError);
const sceneCaption = node('div', 'scene-caption');
sceneCaption.append(node('span', '', tr('THE WORKSPACE', 'พื้นที่ทำงาน')), node('span', '', tr('SCROLL TO ZOOM · DRAG TO MOVE · DOUBLE-CLICK TO RESET', 'เลื่อนลูกกลิ้งเพื่อซูม · ลากเพื่อเลื่อน · ดับเบิลคลิกเพื่อรีเซ็ต')));
scene.append(sceneCaption);

// Zoom and pan the room with a CSS transform; workers are inside it, so they follow.
const view = { scale: 1, x: 0, y: 0 };
function applyView() {
  // Keep the room covering its box, so it can never be dragged out of sight.
  view.x = Math.min(0, Math.max(room.offsetWidth * (1 - view.scale), view.x));
  view.y = Math.min(0, Math.max(room.offsetHeight * (1 - view.scale), view.y));
  room.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}
scene.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = room.getBoundingClientRect();
  const next = Math.min(3, Math.max(1, view.scale * Math.exp(-e.deltaY * 0.0015)));
  // Zoom toward the cursor: the point under it stays put.
  view.x += (e.clientX - rect.left) * (1 - next / view.scale);
  view.y += (e.clientY - rect.top) * (1 - next / view.scale);
  view.scale = next;
  applyView();
}, { passive: false });
let drag = null;
scene.addEventListener('pointerdown', (e) => {
  if (e.button === 0) drag = { x: e.clientX, y: e.clientY, moved: false };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  scene.classList.add('dragging');
  view.x += dx;
  view.y += dy;
  drag.x = e.clientX;
  drag.y = e.clientY;
  applyView();
});
window.addEventListener('pointerup', () => {
  if (drag?.moved) setTimeout(() => { drag = null; });
  else drag = null;
  scene.classList.remove('dragging');
});
// A drag that ends on a worker must not also select it.
scene.addEventListener('click', (e) => { if (drag?.moved) e.stopPropagation(); }, true);
scene.addEventListener('dblclick', () => { Object.assign(view, { scale: 1, x: 0, y: 0 }); applyView(); });
window.addEventListener('resize', applyView);
document.getElementById('tags').hidden = true;

const workers = ROLES.map((role) => {
  const row = button('teammate', '', () => selectRole(role.id));
  row.style.setProperty('--role', role.css);
  row.setAttribute('aria-pressed', 'false');
  const portrait = node('span', 'portrait');
  portrait.append(sprite(role.index));
  const copy = node('span', 'teammate-copy');
  const status = node('span', 'role-status', ui.waiting);
  const task = node('span', 'role-task');
  task.hidden = true;
  copy.append(node('strong', '', role.label), status, task);
  row.append(portrait, copy);
  row.title = role.title;
  rosterList.append(row);

  const actor = button('worker', '', () => selectRole(role.id));
  const pos = deskPosition(role.index);
  actor.style.left = `${pos.x * 100}%`;
  actor.style.top = `${pos.y * 100}%`;
  actor.style.setProperty('--role', role.css);
  const label = node('span', 'worker-label', role.label);
  const ticket = node('span', 'task-ticket', '▤');
  ticket.setAttribute('aria-hidden', 'true');
  ticket.hidden = true;
  actor.append(sprite(role.index), label, ticket);
  room.append(actor);
  return { role, row, status, task, actor, label, ticket };
});

for (const l of LEADS) {
  l.el = node('div', 'worker manager');
  l.el.style.setProperty('--agent', l.color);
  l.labelEl = node('span', 'worker-label', l.label);
  l.card = node('span', 'task-ticket', '▤');
  l.card.hidden = true;
  l.el.append(l.sprite(), l.labelEl, l.card);
  l.bubble = node('div', 'pm-bubble');
  l.line1 = node('div', '');
  l.line2 = node('div', 'bubble-detail');
  l.bubble.append(l.line1, l.line2);
  l.bubble.hidden = true;
  room.append(l.el, l.bubble);
}

// The classic renderer's HUD is not used here; the room takes its space.
document.getElementById('hud').remove();

const inspector = node('aside', 'office-inspector');
inspector.hidden = true;
inspector.setAttribute('aria-label', tr('Desk activity', 'รายละเอียดงานประจำโต๊ะ'));
document.body.append(inspector);
let selected = null;
let requestId = 0;
let lastFocus = null;
function closeInspector() {
  selected = null;
  requestId++;
  inspector.hidden = true;
  for (const w of workers) { w.row.setAttribute('aria-pressed', 'false'); w.actor.classList.remove('selected'); }
  lastFocus?.focus();
}
function selectRole(id) {
  lastFocus = document.activeElement;
  selected = id;
  for (const w of workers) {
    w.row.setAttribute('aria-pressed', String(w.role.id === id));
    w.actor.classList.toggle('selected', w.role.id === id);
  }
  renderInspector();
  inspector.querySelector('.inspector-close').focus();
}
function summaryText(r) {
  return r.state === 'working' ? r.note ?? r.tool ?? ui.working : r.failed ? ui.failed : isFinished(r) ? ui.done : ui.waiting;
}
async function renderInspector() {
  if (!selected) return;
  const id = selected;
  // The activity of the AI shown at this desk.
  const sessionOfDesk = () => crewOf(snapshot)[roleState(id).agent] ?? snapshot.active;
  const sessionId = sessionOfDesk();
  const version = ++requestId;
  const role = roleById(id);
  const wasCloseFocused = document.activeElement === inspector.querySelector('.inspector-close');
  const head = node('header', 'inspector-head');
  const title = node('div', '');
  title.append(node('span', 'eyebrow', tr('TEAMMATE', 'พนักงาน')), node('strong', '', role.label));
  const close = button('inspector-close', '×', closeInspector);
  close.setAttribute('aria-label', TEXT.close);
  head.append(title, close);
  const profile = node('div', 'inspector-profile');
  const portrait = node('span', 'portrait');
  portrait.append(sprite(role.index));
  const info = node('div', '');
  info.append(node('strong', '', role.title), node('span', 'profile-status', summaryText(roleState(id))));
  profile.append(portrait, info);
  const activityTitle = node('h2', '', TEXT.activityTitle);
  const list = node('ol', 'activity-list');
  const loading = node('li', 'empty', tr('Loading activity…', 'กำลังโหลดรายละเอียด…'));
  list.append(loading);
  inspector.style.setProperty('--role', role.css);
  inspector.replaceChildren(head, profile, activityTitle, list);
  inspector.hidden = false;
  if (wasCloseFocused) close.focus();
  try {
    const response = await fetch(`/activity?session=${encodeURIComponent(sessionId ?? '')}`);
    if (!response.ok) throw new Error('activity failed');
    const entries = ((await response.json())[id] ?? []).slice().reverse();
    if (version !== requestId || selected !== id || sessionOfDesk() !== sessionId) return;
    list.replaceChildren();
    for (const entry of entries) {
      const item = node('li', entry.failed ? 'failed' : '');
      const time = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      item.append(node('span', 'activity-meta', `${time} · ${entry.tool ?? ''}${entry.failed ? ` · ${TEXT.failed}` : ''}`));
      item.append(node('span', '', entry.note ?? entry.detail ?? ''));
      if (entry.note && entry.detail) item.append(node('code', '', entry.detail));
      if (entry.file && window.parent !== window) {
        const open = button('open-file', TEXT.open, () => window.parent.postMessage({ type: 'it-office-3d:open', file: entry.file }, '*'));
        open.title = entry.file;
        item.append(open);
      }
      list.append(item);
    }
    if (!entries.length) list.append(node('li', 'empty', TEXT.noActivity));
  } catch {
    if (version === requestId) list.replaceChildren(node('li', 'empty', tr('Activity could not load. Select the teammate to retry.', 'โหลดรายละเอียดไม่สำเร็จ เลือกพนักงานอีกครั้งเพื่อลองใหม่')));
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) closeInspector(); });

function applyState() {
  count.textContent = `${ROLES.filter((r) => roleState(r.id).state === 'working').length} / 10`;
  for (const w of workers) {
    const r = roleState(w.role.id);
    const state = r.state === 'working' ? 'working' : r.failed ? 'failed' : isFinished(r) ? 'done' : 'waiting';
    w.row.dataset.state = w.actor.dataset.state = state;
    w.status.textContent = ui[state];
    w.task.textContent = state === 'working' ? [leadOf(r.agent)?.label, r.note ?? r.tool, r.detail].filter(Boolean).join(' · ') : '';
    w.row.style.setProperty('--agent', state === 'working' ? leadOf(r.agent)?.color ?? 'transparent' : 'transparent');
    w.task.hidden = !w.task.textContent;
    w.label.textContent = `${w.role.label}${isFinished(r) ? ' ✓' : r.failed ? ' !' : ''}`;
    w.actor.setAttribute('aria-label', `${w.role.title} · ${ui[state]} · ${TEXT.showActivity}`);
    w.row.title = `${w.role.title} · ${summaryText(r)}`;
    w.ticket.hidden = !(LEADS.some((l) => l.handed.has(w.role.id)) || isFinished(r));
  }
}

function drawLead({ agent, label, lead, el, labelEl, card, bubble, line1, line2 }) {
  el.style.left = `${lead.position.x * 100}%`;
  el.style.top = `${lead.position.y * 100}%`;
  el.dataset.mode = lead.mode;
  el.style.zIndex = lead.position.y > 0.62 ? '5' : '3';
  const task = lead.task;
  card.hidden = !task || task.type !== 'assign' || lead.handedOver;
  const asking = sessionOf(agent)?.waiting && lead.mode === 'idle';
  labelEl.textContent = asking ? `${label} · ${TEXT.pmWaiting}` : task ? `${label} → ${roleById(task.role).label}` : label;
  bubble.hidden = lead.mode !== 'talking' || !task;
  if (!bubble.hidden) {
    const name = roleById(task.role).label;
    line1.textContent = task.type === 'praise' ? TEXT.praise(name) : task.type === 'wrapUp' ? TEXT.wrapUp(name)
      : task.note ? `${name}: ${truncate(task.note, 70)}` : TEXT.ask(name, TEXT.phrases[task.tool] ?? TEXT.desks[task.role] ?? TEXT.fallback);
    line2.textContent = task.type === 'assign' ? truncate(`${task.tool ?? ''}${task.detail ? ` · ${task.detail}` : ''}`, 80) : '';
    bubble.style.left = `${Math.max(20, Math.min(80, lead.position.x * 100))}%`;
    bubble.style.top = `${lead.position.y * 100 + 3}%`;
    bubble.style.borderColor = roleById(task.role).css;
  }
}

let hiddenByHost = false;
let animation = null;
let lastFrame = 0;
function frame(now) {
  animation = null;
  if (document.hidden || hiddenByHost) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  for (const l of LEADS) {
    const id = l.lead.tick(dt);
    if (id) { l.handed.add(id); workers.find((w) => w.role.id === id).ticket.hidden = false; }
    drawLead(l);
  }
  if (LEADS.some((l) => l.lead.mode !== 'idle')) animation = requestAnimationFrame(frame);
}
function wake() {
  document.body.classList.toggle('office-paused', hiddenByHost || document.hidden);
  if (document.hidden || hiddenByHost || animation !== null) return;
  lastFrame = performance.now();
  animation = requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', wake);
window.addEventListener('message', (e) => {
  if (e.data?.type === 'it-office-3d:visible') { hiddenByHost = !e.data.visible; wake(); }
});
const source = new EventSource(eventsUrl());
source.onmessage = (message) => {
  const next = JSON.parse(message.data);
  for (const l of LEADS) {
    // Each lead plans from its own AI's session, as the single PM did from the active one.
    const own = { active: crewOf(next)[l.agent] ?? null, sessions: next.sessions };
    const plan = planWork(l.previous, own);
    if (plan.reset) { l.lead.reset(); l.handed.clear(); }
    if (plan.first) {
      const session = activeSession(own);
      for (const role of ROLES) {
        const r = session?.roles[role.id] ?? EMPTY_ROLE;
        if (r.state === 'working' || isFinished(r)) l.handed.add(role.id);
      }
    }
    for (const event of plan.events) l.lead.enqueue(event);
    l.previous = plan.memory;
  }
  snapshot = next;
  applyState();
  if (selected) renderInspector();
  wake();
};
applyState();
LEADS.forEach(drawLead);
wake();
