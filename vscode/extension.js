// Shows the IT-Office-3D scene inside VS Code instead of a browser.
// The scene is the same local page the plugin serves, with its team roster and task panel;
// reset also lives in VS Code's own UI. Events still come from the plugin's hooks.
const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const infoFile = path.join(os.homedir(), '.claude-code-3d', 'server.json');
const VIEW_ID = 'claudeCode3d.scene';
const POLL_MS = 2000;
const PLUGIN = 'it-office-3d';
const INSTALL = [`claude plugin marketplace add gotanel1/${PLUGIN}`, `claude plugin install ${PLUGIN}@${PLUGIN}`];

// The packaged extension carries a copy of the repository's engine and hook scripts in ./bundle (same
// layout as the repository); running from the repo uses the repository itself.
const BUNDLE = fs.existsSync(path.join(__dirname, 'bundle')) ? path.join(__dirname, 'bundle') : path.join(__dirname, '..');
const daemonFile = () => path.join(BUNDLE, 'packages', 'core', 'src', 'daemon.js');

// Outside Windows, Antigravity runs hook.sh from a path written in its own config, and VS Code replaces this
// extension's folder on every update, so it runs from a copy in the data folder. Windows needs no file.
const HOOK_HOME = path.join(os.homedir(), '.claude-code-3d', 'hook');
const hookSh = () => path.join(HOOK_HOME, 'scripts', 'hook.sh');

// The AIs this computer has (their settings folder exists) and whether each already reports to the office.
function aiStatus(home = os.homedir()) {
  const read = (...p) => { try { return fs.readFileSync(path.join(home, ...p), 'utf8'); } catch { return ''; } };
  const has = (dir) => fs.existsSync(path.join(home, dir));
  return [
    { id: 'claude', name: 'Claude Code', present: has('.claude'), connected: pluginInstalled(path.join(home, '.claude', 'plugins', 'installed_plugins.json')) === true },
    { id: 'codex', name: 'Codex', present: has('.codex'), connected: read('.codex', 'config.toml').includes(`[plugins."${PLUGIN}@${PLUGIN}"]`) },
    { id: 'antigravity', name: 'Antigravity', present: has('.gemini'), connected: read('.gemini', 'config', 'hooks.json').includes(`"${PLUGIN}"`) },
  ];
}

// Terminal commands that connect Claude Code or Codex: both install the office plugin from GitHub.
function connectCommands(id) {
  if (id === 'claude') return INSTALL;
  return [`codex plugin marketplace add gotanel1/${PLUGIN}`, `codex plugin add ${PLUGIN}@${PLUGIN}`];
}

// Writes the office hook into Antigravity's hooks.json from here, so no Node.js is needed. With `onlyIfStale`
// it leaves a file that already has this version's hook alone (it runs at every start, to update old hooks).
// The hook file is overwritten in place, never deleted first, so a hook running meanwhile still finds it.
async function connectAntigravity(onlyIfStale = false) {
  const { writeHook, antigravityCommand, ANTIGRAVITY_FILE } = await import(require('node:url').pathToFileURL(path.join(BUNDLE, 'scripts', 'connect.mjs')).href);
  const command = (event) => antigravityCommand(event, process.platform, hookSh());
  if (process.platform !== 'win32') {
    if (/\s/.test(hookSh())) throw new Error(`Antigravity cannot run a hook from a path with a space (${hookSh()}).`);
    fs.mkdirSync(path.dirname(hookSh()), { recursive: true });
    fs.copyFileSync(path.join(BUNDLE, 'scripts', 'hook.sh'), hookSh());
  }
  if (onlyIfStale && fs.readFileSync(ANTIGRAVITY_FILE, 'utf8').includes(JSON.stringify(command('Stop')))) return;
  writeHook(ANTIGRAVITY_FILE, false, command);
}

// How many of the office's hooks Codex still skips because the user has not approved them, asked through
// Codex's own app server (read only); null when Codex cannot be asked.
function codexPendingHooks(cwd) {
  return new Promise((resolve) => {
    let child;
    const done = (value) => {
      clearTimeout(timer);
      child?.stdin.end();
      resolve(value);
    };
    const timer = setTimeout(() => { child?.kill(); done(null); }, 20000);
    try {
      child = spawn('codex', ['app-server'], { cwd, windowsHide: true });
    } catch {
      done(null);
      return;
    }
    child.on('error', () => done(null));
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const line = out.split('\n').find((l) => l.includes('"id":2'));
      if (!line) return;
      try {
        const hooks = JSON.parse(line).result.data.flatMap((g) => g.hooks);
        done(hooks.filter((h) => h.pluginId === `${PLUGIN}@${PLUGIN}` && h.trustStatus !== 'trusted').length);
      } catch {
        done(null);
      }
    });
    child.stdin.write([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: PLUGIN, version: '1' } } },
      { jsonrpc: '2.0', method: 'initialized' },
      { jsonrpc: '2.0', id: 2, method: 'hooks/list', params: {} },
    ].map((m) => JSON.stringify(m)).join('\n') + '\n');
  });
}

// Codex runs none of the office's hooks until the user approves them in /hooks, and asks again after every
// update of the plugin; without this warning the office would just stay still.
const codexWarned = { count: 0 };
async function checkCodexHooks() {
  if (!aiStatus().find((a) => a.id === 'codex').connected) return;
  const pending = await codexPendingHooks(workspaceRoots()[0] ?? os.homedir());
  if (pending === null || pending === codexWarned.count) return;
  codexWarned.count = pending;
  if (!pending) return;
  const choice = await vscode.window.showWarningMessage(
    `Codex skips ${pending} IT-Office-3D hook${pending > 1 ? 's' : ''} until you approve them: in Codex, type /hooks and press t.`,
    'Open Codex',
  );
  if (choice === 'Open Codex') {
    const terminal = vscode.window.createTerminal('Codex');
    terminal.show();
    terminal.sendText('codex');
  }
}

function readInfo() {
  try {
    return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  } catch {
    return null;
  }
}

// The scene only moves when Claude Code runs this plugin's hooks. true or false, or null when Claude Code's
// plugin list cannot be read (not installed, or its format changed), so the extension never nags on a guess.
function pluginInstalled(file = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')) {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).plugins ?? {}).some((id) => id.startsWith(`${PLUGIN}@`));
  } catch {
    return null;
  }
}

// The server version the bundled engine needs; see API in packages/core/src/server.js.
const API = JSON.parse(fs.readFileSync(path.resolve(daemonFile(), '..', '..', 'package.json'), 'utf8')).sceneApi;
const current = (h) => (h?.api ?? 1) >= API;

// The server's health answer, or null when nothing (or something else) answers on that port.
async function health(port, timeout = 500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeout) });
    const h = await res.json();
    return h.name === 'claude-code-3d' ? h : null;
  } catch {
    return null;
  }
}

// Same discovery as scripts/lib.mjs, including stopping a server left by an older version. VS Code's own
// binary runs the server as plain Node, so users need no separate Node.js for the viewer (the plugin's
// hooks still need one).
async function ensureServer(wait = 8000) {
  let info = readInfo();
  const h = info?.port ? await health(info.port) : null;
  if (h && current(h)) return info;
  if (h) {
    try {
      process.kill(h.pid);
    } catch {
      // Already gone, or not ours to stop: the new server then takes another port.
    }
    const until = Date.now() + 2000;
    while (Date.now() < until && (await health(h.port, 200))) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const child = spawn(process.execPath, [daemonFile()], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  child.on('error', () => {});
  child.unref();
  const end = Date.now() + wait;
  while (Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    info = readInfo();
    if (info?.port && current(await health(info.port))) return info;
  }
  return null;
}

// Which Claude Code chat this window shows: a picked session id, or '' for the newest chat in this
// window's workspace folders. Sending `session` even when empty keeps a choice made in a browser tab
// (stored by the page) out of VS Code.
const follow = { session: '' };
const workspaceRoots = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);

// 'en' or 'th' for the scene's speech bubbles and wall screen.
function sceneLanguage(setting = vscode.workspace.getConfiguration('itOffice3d').get('language', 'auto'), uiLanguage = vscode.env.language) {
  if (setting === 'en' || setting === 'th') return setting;
  return uiLanguage.toLowerCase().startsWith('th') ? 'th' : 'en';
}

function sceneQuery(session, roots) {
  const params = new URLSearchParams({ session });
  for (const root of roots) params.append('cwd', root);
  return params.toString();
}

function page(body, frameSrc = null) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';${frameSrc ? ` frame-src ${frameSrc};` : ''}`;
  // Passes "panel shown / hidden" on to the scene, which stops drawing while hidden, and the scene's
  // "open this file" requests back to the extension, which checks the path before opening it.
  const relay = `const vscode = acquireVsCodeApi();
window.addEventListener('message', (e) => {
  const frame = document.querySelector('iframe');
  if (!frame || !e.data) return;
  if (e.data.type === 'it-office-3d:visible') frame.contentWindow.postMessage(e.data, '*');
  else if (e.data.type === 'it-office-3d:open' && e.source === frame.contentWindow) vscode.postMessage({ type: 'open', file: String(e.data.file) });
});`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}
p{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-descriptionForeground);padding:0 1em}</style>
</head><body>${body}<script nonce="${nonce}">${relay}</script></body></html>`;
}

class SceneView {
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.onDidDispose(() => {
      this.view = undefined;
    });
    view.onDidChangeVisibility(() => view.webview.postMessage({ type: 'it-office-3d:visible', visible: view.visible }));
    view.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'open') openFile(msg.file);
    });
    return this.load();
  }

  async load() {
    const view = this.view;
    if (!view) return;
    view.webview.html = page('<p>Starting IT-Office-3D…</p>');
    const info = await ensureServer();
    if (view !== this.view) return;
    if (!info) {
      view.webview.html = page('<p>IT-Office-3D could not start its local server. Close and reopen this view to try again.</p>');
      return;
    }
    // shortcut: works for local VS Code only; remote windows forward the port under another host, which the
    // server's Host check refuses. Upgrade by letting the server accept the forwarded host if remote is needed.
    const base = (await vscode.env.asExternalUri(vscode.Uri.parse(info.url))).toString();
    const url = `${base}?embed&lang=${sceneLanguage()}&${sceneQuery(follow.session, workspaceRoots())}`;
    view.webview.html = page(`<iframe src="${url}" title="IT-Office-3D"></iframe>`, new URL(base).origin);
  }
}

// Opens a file the scene asked for, only when it is an existing file inside this window's workspace:
// the request comes from a page, so it must not reach anything else on the disk.
function insideRoots(file, roots) {
  const norm = (p) => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const target = norm(file);
  return roots.some((root) => target === norm(root) || target.startsWith(`${norm(root)}/`));
}

async function openFile(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !insideRoots(file, workspaceRoots())) {
    vscode.window.showWarningMessage("IT-Office-3D only opens files inside this window's folders.");
    return;
  }
  try {
    if (!fs.statSync(file).isFile()) return;
    await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
  } catch {
    vscode.window.showWarningMessage(`IT-Office-3D: ${path.basename(file)} no longer exists.`);
  }
}

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

// One line in the status bar: who is working on what, or the token total once the turn is over.
function describe(snap, plugin = null) {
  const session = snap?.active ? snap.sessions[snap.active] : null;
  if (!session?.startedAt && plugin === false) {
    return { text: '$(warning) IT-Office-3D', tooltip: `The Claude Code plugin "${PLUGIN}" is not installed, so the scene will not move. Run: ${INSTALL.join(' && ')}` };
  }
  if (!session?.startedAt) return { text: '$(eye) IT-Office-3D', tooltip: 'Open the IT-Office-3D scene' };
  const t = session.tokens;
  const tokens = t ? `${formatTokens(t.input + t.cacheWrite)} in / ${formatTokens(t.output)} out` : 'tokens —';
  const seconds = Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 1000);
  const working = Object.entries(session.roles).filter(([, r]) => r.state === 'working');
  // Ten desks: list only the ones that are busy or finished.
  const lines = Object.entries(session.roles)
    .filter(([, r]) => r.state !== 'waiting' || r.done || r.failed)
    .map(([role, r]) => {
      if (r.state !== 'working') return `${role}: ${r.failed ? 'failed' : 'done'}`;
      const call = `${r.tool}${r.detail ? ` · ${r.detail}` : ''}`;
      return r.note ? `${role}: ${r.note} (${call})` : `${role}: ${call}`;
    });
  if (lines.length === 0) lines.push('No desk busy');
  const w = session.waiting;
  if (w) lines.unshift(`Claude is waiting for your approval${w.tool ? `: ${w.tool}${w.detail ? ` · ${w.detail}` : ''}` : ''}`, '');
  const tooltip = new vscode.MarkdownString(
    [...lines, '', `${seconds}s · ${tokens}`, '', 'Click to open the IT-Office-3D scene'].map((l) => l.replace(/[\\`*_[\]<>]/g, '\\$&')).join('  \n'),
  );
  if (w) return { text: `$(bell) Needs you${w.tool ? ` · ${w.tool}` : ''}`, tooltip, warn: true };
  const failed = Object.values(session.roles).filter((r) => r.failed).length;
  if (session.endedAt || working.length === 0) {
    return { text: `${failed ? '$(error)' : '$(check)'} IT-Office-3D · ${failed ? `${failed} failed · ` : ''}${tokens}`, tooltip };
  }
  const [role, r] = working[0];
  // Claude's own summary of the call, when it gave one, says more than the tool name.
  const what = r.note && r.note.length > 40 ? `${r.note.slice(0, 39)}…` : r.note ?? r.tool;
  return { text: `$(loading~spin) ${role} · ${what}`, tooltip };
}

// What to tell the user when the followed chat changes: it finished, or it waits for an approval.
// Both snapshots are of the same followed view; the first poll (no previous) never notifies.
function notification(prev, next) {
  const a = prev?.active ? prev.sessions[prev.active] : null;
  const b = next?.active ? next.sessions[next.active] : null;
  if (!a || !b || prev.active !== next.active || a.startedAt !== b.startedAt) return null;
  if (b.waiting && !a.waiting) {
    const what = b.waiting.tool ? `: ${b.waiting.tool}${b.waiting.detail ? ` · ${b.waiting.detail}` : ''}` : '.';
    return { kind: 'waiting', message: `Claude is waiting for your approval${what}` };
  }
  if (b.endedAt && !a.endedAt) {
    const seconds = Math.round((b.endedAt - b.startedAt) / 1000);
    const time = seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`;
    const failed = Object.values(b.roles).filter((r) => r.failed).length;
    return { kind: 'finished', message: `Claude finished in ${time}${failed ? `, ${failed} desk${failed > 1 ? 's' : ''} failed` : ''}.` };
  }
  return null;
}

async function notify(note) {
  const mode = vscode.workspace.getConfiguration('itOffice3d').get('notify', 'whenUnfocused');
  if (mode === 'off' || (mode === 'whenUnfocused' && vscode.window.state.focused)) return;
  const show = note.kind === 'waiting' ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  if ((await show(`IT-Office-3D: ${note.message}`, 'Open')) === 'Open') vscode.commands.executeCommand('claudeCode3d.open');
}

// Polls the server instead of keeping a live stream, so an idle server can still shut itself down.
function watchStatus(item) {
  let busy = false;
  let previous = null;
  const tick = async () => {
    if (busy) return;
    busy = true;
    let snap = null;
    try {
      const info = readInfo();
      if (info?.port) {
        const query = sceneQuery(follow.session, workspaceRoots());
        const res = await fetch(`http://127.0.0.1:${info.port}/state?${query}`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) snap = await res.json();
      }
    } catch {
      // No server yet: show the idle label.
    }
    const { text, tooltip, warn } = describe(snap, pluginInstalled());
    item.text = text;
    item.tooltip = tooltip;
    item.backgroundColor = warn ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    const note = notification(previous, snap);
    if (note) notify(note);
    previous = snap;
    busy = false;
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return { dispose: () => clearInterval(timer) };
}

const names = (list) => list.map((a) => a.name).join(', ');

// Asked once per window: an AI that is installed but not connected would leave the office still.
async function offerConnect() {
  const todo = aiStatus().filter((a) => a.present && !a.connected);
  if (!todo.length) return;
  const choice = await vscode.window.showWarningMessage(`IT-Office-3D can show what ${names(todo)} ${todo.length > 1 ? 'are' : 'is'} doing. Connect now?`, 'Connect', 'Not now');
  if (choice === 'Connect') connectAIs();
}

// One click for every AI found: the office hook goes into each one's own settings, through a terminal so
// the user sees each command run.
async function connectAIs() {
  const all = aiStatus();
  const todo = all.filter((a) => a.present && !a.connected);
  if (!todo.length) {
    const found = all.filter((a) => a.present);
    vscode.window.showInformationMessage(found.length ? `${names(found)}: already connected.` : 'No Claude Code, Codex or Antigravity found on this computer.');
    checkCodexHooks();
    return;
  }
  if (todo.some((a) => a.id === 'antigravity')) {
    try {
      await connectAntigravity();
    } catch (err) {
      vscode.window.showErrorMessage(`IT-Office-3D could not connect Antigravity: ${err.message}`);
    }
  }
  const viaTerminal = todo.filter((a) => a.id !== 'antigravity');
  if (viaTerminal.length) {
    const terminal = vscode.window.createTerminal('IT-Office-3D');
    terminal.show();
    for (const a of viaTerminal) connectCommands(a.id).forEach((cmd) => terminal.sendText(cmd));
  }
  const next = [];
  if (viaTerminal.length) next.push('when the terminal finishes, run "Reload Window"');
  if (todo.some((a) => a.id === 'claude')) next.push('start a new Claude Code chat');
  if (todo.some((a) => a.id === 'codex')) next.push('in Codex, type /hooks and press t to approve the it-office-3d hooks');
  vscode.window.showInformationMessage(next.length ? `Almost there: ${next.join(', then ')}.` : 'Connected.');
  // Codex installs in the terminal first; look for unapproved hooks once that has had time to finish.
  if (todo.some((a) => a.id === 'codex')) setTimeout(checkCodexHooks, 90000);
}

// The plugin's installed version from Claude Code's plugin list, or null.
function pluginVersion(file = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')) {
  try {
    const plugins = JSON.parse(fs.readFileSync(file, 'utf8')).plugins ?? {};
    const id = Object.keys(plugins).find((key) => key.startsWith(`${PLUGIN}@`));
    return id ? [plugins[id]].flat()[0]?.version ?? 'unknown' : null;
  } catch {
    return null;
  }
}

// Plain-text report for bug reports. Built from facts gathered below, so it can be tested without VS Code.
function formatDiagnostics(f) {
  const server = !f.health ? 'not running' : `pid ${f.health.pid}, port ${f.health.port}, api ${f.health.api ?? 1}${(f.health.api ?? 1) >= f.api ? '' : ' (OUTDATED: needs ' + f.api + ')'}`;
  const lines = [
    'IT-Office-3D diagnostics. No prompts, file contents or command output are included.',
    '',
    `Extension      ${f.extension}  (VS Code ${f.vscode}, ${f.platform}, scene language ${f.language})`,
    `Plugin         ${f.plugin === null ? 'NOT FOUND in Claude Code (the scene will not move)' : f.plugin}`,
    `Server         ${server}`,
    `Workspace      ${f.roots.length ? f.roots.join(' | ') : '(no folder open: follows the newest chat anywhere)'}`,
    `Following      ${f.follow || 'this workspace'}`,
    `Showing        ${f.active ? `${f.active.slice(0, 8)} in ${f.sessions[f.active]?.cwd ?? '?'}` : 'no chat yet'}`,
    '',
    'Chats the server has seen:',
    ...(Object.keys(f.sessions).length
      ? Object.entries(f.sessions).map(([id, s]) => `  ${id.slice(0, 8)}  ${s.cwd ?? '?'}  last active ${ago(f.now - s.updatedAt)}`)
      : ['  (none)']),
    '',
    'Last events (newest last):',
    ...(f.events.length ? f.events.map((e) => `  ${e.at}  ${e.event}${e.tool ? ` ${e.tool}` : ''}  ${e.session}`) : ['  (none)']),
  ];
  return lines.join('\n');
}

let output;
async function showDiagnostics(context) {
  const info = readInfo();
  const h = info?.port ? await health(info.port) : null;
  const get = async (route) => {
    try {
      return await (await fetch(`http://127.0.0.1:${h.port}${route}`, { signal: AbortSignal.timeout(1000) })).json();
    } catch {
      return null;
    }
  };
  const snap = h ? await get(`/state?${sceneQuery(follow.session, workspaceRoots())}`) : null;
  const events = h ? (await get('/debug/events')) ?? [] : [];
  output ??= vscode.window.createOutputChannel('IT-Office-3D');
  output.clear();
  output.appendLine(
    formatDiagnostics({
      extension: context.extension.packageJSON.version,
      vscode: vscode.version,
      platform: `${process.platform}-${process.arch}`,
      language: sceneLanguage(),
      plugin: pluginVersion(),
      health: h,
      api: API,
      roots: workspaceRoots(),
      follow: follow.session,
      active: snap?.active ?? null,
      sessions: snap?.sessions ?? {},
      events: events.slice(-15),
      now: Date.now(),
    }),
  );
  output.show(true);
}

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

// Lists the chats the server has seen, newest first, so the user can pin this window to one of them.
async function chooseSession(context, scene) {
  const info = readInfo();
  let snap = null;
  try {
    const res = await fetch(`http://127.0.0.1:${info?.port}/state`, { signal: AbortSignal.timeout(1000) });
    snap = await res.json();
  } catch {
    vscode.window.showWarningMessage('IT-Office-3D: the local server did not answer.');
    return;
  }
  const sessions = Object.entries(snap.sessions).sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
  const items = [
    { label: '$(folder) Follow this workspace', description: 'The newest Claude Code chat in this window\'s folders', id: '' },
    ...sessions.map(([id, s]) => ({
      label: `${Object.values(s.roles).some((r) => r.state === 'working') ? '$(loading~spin) ' : ''}${path.basename(s.cwd ?? '') || 'session'}`,
      description: id.slice(0, 8),
      detail: `${s.cwd ?? ''} · last active ${ago(Date.now() - s.updatedAt)}`,
      id,
    })),
  ].map((item) => ({ ...item, picked: item.id === follow.session, label: item.id === follow.session ? `$(check) ${item.label}` : item.label }));
  const choice = await vscode.window.showQuickPick(items, { title: 'Which Claude Code chat should this window show?', matchOnDetail: true });
  if (!choice) return;
  follow.session = choice.id;
  await context.workspaceState.update('session', choice.id);
  scene.load();
}

async function reset() {
  const info = readInfo();
  if (!info?.port) return;
  try {
    await fetch(`http://127.0.0.1:${info.port}/reset`, { method: 'POST', signal: AbortSignal.timeout(1000) });
  } catch {
    vscode.window.showWarningMessage('IT-Office-3D: the local server did not answer.');
  }
}

function activate(context) {
  follow.session = context.workspaceState.get('session', '');
  const scene = new SceneView();
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'claudeCode3d.open';
  item.show();
  context.subscriptions.push(
    item,
    watchStatus(item),
    // Keeps the 3D scene and its live connection while the view is hidden behind another panel tab.
    vscode.window.registerWebviewViewProvider(VIEW_ID, scene, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('claudeCode3d.open', () => vscode.commands.executeCommand(`${VIEW_ID}.focus`)),
    vscode.commands.registerCommand('claudeCode3d.reset', reset),
    vscode.commands.registerCommand('claudeCode3d.chooseSession', () => chooseSession(context, scene)),
    vscode.commands.registerCommand('claudeCode3d.diagnostics', () => showDiagnostics(context)),
    vscode.commands.registerCommand('claudeCode3d.connect', connectAIs),
    // A changed folder list changes which chats this window follows.
    vscode.workspace.onDidChangeWorkspaceFolders(() => scene.load()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('itOffice3d.language')) scene.load();
    }),
  );
  // The hooks only post to a running server and never start one, so the window keeps it up from the start.
  ensureServer().catch(() => {});
  // An update brings a new hook: rewrite Antigravity's when it is from an older version.
  if (aiStatus().find((a) => a.id === 'antigravity').connected) {
    connectAntigravity(true).catch(() => {
      // The old hook keeps working; the next start tries again.
    });
  }
  // First run: the walkthrough covers connecting too, so it replaces the warning once.
  if (!context.globalState.get('welcomed')) {
    context.globalState.update('welcomed', true);
    vscode.commands.executeCommand('workbench.action.openWalkthrough', `${context.extension.id}#getStarted`, false);
  } else {
    offerConnect();
  }
  setTimeout(checkCodexHooks, 10000);
  const codexTimer = setInterval(checkCodexHooks, 10 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(codexTimer) });
}

function deactivate() {}

module.exports = { activate, deactivate, describe, notification, pluginInstalled, pluginVersion, aiStatus, connectCommands, codexPendingHooks, sceneQuery, sceneLanguage, formatDiagnostics, insideRoots };
