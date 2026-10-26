// Page chrome around the scene: session picker and token readout.
const SESSION_KEY = 'claude-code-3d.session';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be blocked, the defaults are fine.
    return null;
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Ignore: the URL parameter still carries the choice.
  }
}

// The session this page follows. Empty means "whichever session was active last".
export function selectedSession() {
  const fromUrl = new URLSearchParams(location.search).get('session');
  if (fromUrl !== null) return fromUrl;
  return read(SESSION_KEY) ?? '';
}

// Scene modules open their live connection through this so they follow the chosen session.
export function eventsUrl() {
  const params = new URLSearchParams();
  const session = selectedSession();
  if (session) params.set('session', session);
  // A VS Code window passes its workspace folders, so it follows the chats of its own project.
  for (const cwd of new URLSearchParams(location.search).getAll('cwd')) params.append('cwd', cwd);
  const query = params.toString();
  return query ? `/events?${query}` : '/events';
}

// The scene builds its listeners once, so switching session reloads the page.
function reloadWith(params) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  location.href = url.toString();
}

export function switchSession(id) {
  write(SESSION_KEY, id);
  reloadWith({ session: id });
}

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

const baseName = (p) => String(p ?? '').split(/[\\/]+/).filter(Boolean).pop() ?? '';

function sessionLabel(id, session) {
  const busy = Object.values(session.roles).some((r) => r.state === 'working');
  const folder = baseName(session.cwd) || 'session';
  return `${busy ? '● ' : ''}${folder} · ${id.slice(0, 6)}`;
}

export function mountChrome() {
  const wrap = document.createElement('div');
  wrap.className = 'session-picker';
  // Only shown when more than one Claude Code session is being watched.
  wrap.style.display = 'none';

  const sessionLabelEl = document.createElement('label');
  sessionLabelEl.append('Session ');
  const sessionSelect = document.createElement('select');
  sessionSelect.addEventListener('change', () => switchSession(sessionSelect.value));
  sessionLabelEl.append(sessionSelect);
  wrap.append(sessionLabelEl);
  document.body.append(wrap);

  const tokensEl = document.getElementById('tokens');
  let lastOptions = '';

  const source = new EventSource(eventsUrl());
  source.onmessage = (msg) => {
    const snap = JSON.parse(msg.data);
    const session = snap.active ? snap.sessions[snap.active] : null;

    if (tokensEl) {
      const t = session?.tokens;
      tokensEl.textContent = t ? `${formatTokens(t.input + t.cacheWrite)} / ${formatTokens(t.output)}` : '—';
      tokensEl.title = t
        ? `This task only. New input ${formatTokens(t.input)} · cache write ${formatTokens(t.cacheWrite)} · cache read ${formatTokens(t.cacheRead)} · output ${formatTokens(t.output)}`
        : 'Token usage is not available for this session yet.';
    }

    const ids = Object.keys(snap.sessions);
    const wanted = selectedSession();
    const options = [['', 'Latest']].concat(ids.map((id) => [id, sessionLabel(id, snap.sessions[id])]));
    const signature = JSON.stringify(options) + wanted;
    if (signature === lastOptions) return;
    lastOptions = signature;
    sessionSelect.replaceChildren(
      ...options.map(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        option.selected = value === wanted;
        return option;
      }),
    );
    wrap.style.display = ids.length < 2 ? 'none' : '';
  };
}
