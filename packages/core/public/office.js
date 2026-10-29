import { eventsUrl } from './chrome.js';
import { ROLES, messages } from './office-data.js';
import { EMPTY_ROLE, activeSession, isFinished, planWork, deskPosition, createLead, formatElapsed } from './office-model.js';

const LANG = (new URLSearchParams(location.search).get('lang') || navigator.language || 'en').toLowerCase().startsWith('th') ? 'th' : 'en';
const TEXT = messages(LANG);
const tr = (en, th) => LANG === 'th' ? th : en;
document.documentElement.lang = LANG;
const ui = {
  waiting: tr('Idle', 'พร้อมรับงาน'), working: tr('Working', 'กำลังทำงาน'), done: tr('Done', 'เสร็จแล้ว'),
  failed: tr('Failed', 'ไม่ผ่าน'), connecting: tr('Connecting', 'กำลังเชื่อมต่อ'),
  live: tr('Live connection', 'เชื่อมต่อแล้ว'), offline: tr('Reconnecting…', 'กำลังเชื่อมต่อใหม่…'),
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
function sprite(index) {
  const el = node('span', 'sprite');
  el.style.backgroundPosition = `${index % 4 * 100 / 3}% ${Math.floor(index / 4) * 50}%`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
const truncate = (text, max) => String(text ?? '').length > max ? `${String(text).slice(0, max - 1)}…` : String(text ?? '');
const roleById = (id) => ROLES.find((r) => r.id === id);
let snapshot = { active: null, sessions: {} };
let previous = null;
let connected = false;
const currentSession = () => activeSession(snapshot);
const roleState = (id) => currentSession()?.roles[id] ?? EMPTY_ROLE;
const worked = new Set();
const handed = new Set();
const lead = createLead();

// Real controls and status remain HTML, independent of the generated room artwork.
const topbar = node('header', 'office-topbar');
const brand = node('div', 'office-brand');
brand.append(node('span', 'brand-mark', 'IT'), node('strong', '', 'IT-OFFICE'), node('span', 'edition', '2.5D'));
const subtitle = node('span', 'office-subtitle', tr('A little office. Real work.', 'ออฟฟิศเล็ก ๆ ที่สะท้อนงานจริง'));
const connection = node('span', 'connection', ui.connecting);
connection.setAttribute('role', 'status');
topbar.append(brand, subtitle, connection);
document.body.prepend(topbar);

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
  copy.append(node('strong', '', role.label), status);
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
  return { role, row, status, actor, label, ticket };
});

const pm = node('div', 'worker manager');
const pmLabel = node('span', 'worker-label', 'PM');
const pmCard = node('span', 'task-ticket', '▤');
pmCard.hidden = true;
pm.append(sprite(10), pmLabel, pmCard);
room.append(pm);
const bubble = node('div', 'pm-bubble');
const bubbleLine1 = node('div', '');
const bubbleLine2 = node('div', 'bubble-detail');
bubble.append(bubbleLine1, bubbleLine2);
bubble.hidden = true;
room.append(bubble);

const hud = document.getElementById('hud');
const elapsed = document.getElementById('elapsed');
const tokens = document.getElementById('tokens');
const progress = document.getElementById('progress-bar').parentElement;
progress.setAttribute('role', 'progressbar');
progress.setAttribute('aria-label', tr('Participating desks (not a time estimate)', 'โต๊ะที่ร่วมทำงาน (ไม่ใช่เวลาที่เหลือ)'));
progress.setAttribute('aria-valuemin', '0');
progress.setAttribute('aria-valuemax', '100');
const reset = document.getElementById('reset');
reset.textContent = tr('Reset', 'รีเซ็ต');
const mission = node('div', 'mission');
mission.append(node('span', 'eyebrow', tr('CURRENT TASK', 'งานปัจจุบัน')));
const missionTitle = node('strong', 'mission-title', TEXT.waiting);
const missionDetail = node('span', 'mission-detail', tr('Activity appears when Claude Code starts working.', 'สถานะจะแสดงเมื่อ Claude Code เริ่มทำงาน'));
mission.append(missionTitle, missionDetail);
const metrics = node('div', 'office-metrics');
elapsed.parentElement.querySelector('.label').textContent = tr('ELAPSED', 'เวลาทำงาน');
tokens.parentElement.querySelector('.label').textContent = tr('TOKENS IN / OUT', 'โทเคนเข้า / ออก');
metrics.append(elapsed.parentElement, tokens.parentElement, progress, reset);
hud.replaceChildren(mission, metrics);

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
  const sessionId = snapshot.active;
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
    if (version !== requestId || selected !== id || snapshot.active !== sessionId) return;
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

function updateMission() {
  const session = currentSession();
  const busy = ROLES.filter((r) => roleState(r.id).state === 'working');
  count.textContent = `${busy.length} / 10`;
  hud.classList.toggle('needs-you', Boolean(session?.waiting));
  if (!connected) {
    missionTitle.textContent = ui.offline;
    missionDetail.textContent = tr('Showing the last received state.', 'กำลังแสดงสถานะล่าสุดที่ได้รับ');
  } else if (session?.waiting) {
    missionTitle.textContent = TEXT.needsYou;
    missionDetail.textContent = `${TEXT.answerIn}${session.waiting.tool ? ` · ${session.waiting.tool}` : ''}`;
  } else if (busy.length) {
    const role = busy[0];
    const r = roleState(role.id);
    missionTitle.textContent = `${role.label} · ${r.note ?? r.tool ?? ui.working}`;
    missionDetail.textContent = r.detail || role.title;
  } else {
    missionTitle.textContent = session?.endedAt ? TEXT.finished : TEXT.waiting;
    missionDetail.textContent = session?.endedAt ? tr('The team is ready for the next task.', 'ทีมพร้อมสำหรับงานถัดไป') : tr('Activity appears when Claude Code starts working.', 'สถานะจะแสดงเมื่อ Claude Code เริ่มทำงาน');
  }
  missionTitle.title = missionTitle.textContent;
  missionDetail.title = missionDetail.textContent;
}

function applyState() {
  for (const w of workers) {
    const r = roleState(w.role.id);
    const state = r.state === 'working' ? 'working' : r.failed ? 'failed' : isFinished(r) ? 'done' : 'waiting';
    if (state === 'working') worked.add(w.role.id);
    w.row.dataset.state = w.actor.dataset.state = state;
    w.status.textContent = ui[state];
    w.label.textContent = `${w.role.label}${isFinished(r) ? ' ✓' : r.failed ? ' !' : ''}`;
    w.actor.setAttribute('aria-label', `${w.role.title} · ${ui[state]} · ${TEXT.showActivity}`);
    w.row.title = `${w.role.title} · ${summaryText(r)}`;
    w.ticket.hidden = !(handed.has(w.role.id) || isFinished(r));
  }
  const value = currentSession()?.endedAt ? 100 : worked.size / (worked.size + 1) * 100;
  progress.firstElementChild.style.width = `${value}%`;
  progress.setAttribute('aria-valuenow', String(Math.round(value)));
  updateMission();
}

function drawLead() {
  pm.style.left = `${lead.position.x * 100}%`;
  pm.style.top = `${lead.position.y * 100}%`;
  pm.dataset.mode = lead.mode;
  pm.style.zIndex = lead.position.y > 0.62 ? '5' : '3';
  const task = lead.task;
  pmCard.hidden = !task || task.type !== 'assign' || lead.handedOver;
  const asking = currentSession()?.waiting && lead.mode === 'idle';
  pmLabel.textContent = asking ? TEXT.pmWaiting : task ? `PM → ${roleById(task.role).label}` : 'PM';
  bubble.hidden = lead.mode !== 'talking' || !task;
  if (!bubble.hidden) {
    const name = roleById(task.role).label;
    bubbleLine1.textContent = task.type === 'praise' ? TEXT.praise(name) : task.type === 'wrapUp' ? TEXT.wrapUp(name)
      : task.note ? `${name}: ${truncate(task.note, 70)}` : TEXT.ask(name, TEXT.phrases[task.tool] ?? TEXT.desks[task.role] ?? TEXT.fallback);
    bubbleLine2.textContent = task.type === 'assign' ? truncate(`${task.tool ?? ''}${task.detail ? ` · ${task.detail}` : ''}`, 80) : '';
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
  const id = lead.tick(dt);
  if (id) { handed.add(id); workers.find((w) => w.role.id === id).ticket.hidden = false; }
  drawLead();
  if (lead.mode !== 'idle') animation = requestAnimationFrame(frame);
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
source.onopen = () => { connected = true; connection.textContent = ui.live; connection.dataset.state = 'live'; updateMission(); };
source.onerror = () => { connected = false; connection.textContent = ui.offline; connection.dataset.state = 'offline'; updateMission(); };
source.onmessage = (message) => {
  const next = JSON.parse(message.data);
  const plan = planWork(previous, next);
  if (plan.reset) { lead.reset(); worked.clear(); handed.clear(); }
  if (plan.first) {
    const session = activeSession(next);
    for (const role of ROLES) {
      const r = session?.roles[role.id] ?? EMPTY_ROLE;
      if (r.state === 'working' || isFinished(r)) handed.add(role.id);
    }
  }
  for (const event of plan.events) lead.enqueue(event);
  previous = plan.memory;
  snapshot = next;
  applyState();
  updateTimer();
  if (selected) renderInspector();
  wake();
};
function updateTimer() {
  const session = currentSession();
  elapsed.textContent = session?.startedAt ? formatElapsed((session.endedAt ?? Date.now()) - session.startedAt) : '00:00';
}
setInterval(updateTimer, 250);
reset.addEventListener('click', async () => {
  reset.disabled = true;
  try {
    const response = await fetch('/reset', { method: 'POST' });
    if (!response.ok) throw new Error('reset failed');
  } catch {
    missionDetail.textContent = tr('Reset failed. Please try again.', 'รีเซ็ตไม่สำเร็จ กรุณาลองใหม่');
  } finally { reset.disabled = false; }
});
applyState();
drawLead();
wake();
