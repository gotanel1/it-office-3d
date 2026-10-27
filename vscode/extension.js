// Shows the IT-Office-3D scene inside VS Code instead of a browser.
// The scene is the same local page the plugin serves, shown in a panel view with only the 3D scene;
// status and reset live in VS Code's own UI. Events still come from the plugin's hooks.
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

// The packaged extension carries a copy of the engine in ./core; running from the repo uses packages/core.
function daemonFile() {
  const bundled = path.join(__dirname, 'core', 'src', 'daemon.js');
  return fs.existsSync(bundled) ? bundled : path.join(__dirname, '..', 'packages', 'core', 'src', 'daemon.js');
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
  // Passes "panel shown / hidden" on to the scene, which stops drawing while hidden.
  const relay = `window.addEventListener('message', (e) => {
  const frame = document.querySelector('iframe');
  if (frame && e.data && e.data.type === 'it-office-3d:visible') frame.contentWindow.postMessage(e.data, '*');
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
    .filter(([, r]) => r.state !== 'waiting' || r.done)
    .map(([role, r]) => {
      if (r.state !== 'working') return `${role}: done`;
      const call = `${r.tool}${r.detail ? ` · ${r.detail}` : ''}`;
      return r.note ? `${role}: ${r.note} (${call})` : `${role}: ${call}`;
    });
  if (lines.length === 0) lines.push('No desk busy');
  const tooltip = new vscode.MarkdownString(
    [...lines, '', `${seconds}s · ${tokens}`, '', 'Click to open the IT-Office-3D scene'].map((l) => l.replace(/[\\`*_[\]<>]/g, '\\$&')).join('  \n'),
  );
  if (session.endedAt || working.length === 0) return { text: `$(check) IT-Office-3D · ${tokens}`, tooltip };
  const [role, r] = working[0];
  // Claude's own summary of the call, when it gave one, says more than the tool name.
  const what = r.note && r.note.length > 40 ? `${r.note.slice(0, 39)}…` : r.note ?? r.tool;
  return { text: `$(loading~spin) ${role} · ${what}`, tooltip };
}

// Polls the server instead of keeping a live stream, so an idle server can still shut itself down.
function watchStatus(item) {
  let busy = false;
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
    const { text, tooltip } = describe(snap, pluginInstalled());
    item.text = text;
    item.tooltip = tooltip;
    busy = false;
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return { dispose: () => clearInterval(timer) };
}

// Asked once per window: without the plugin the panel would sit still with no explanation.
async function offerPluginInstall() {
  if (pluginInstalled() !== false) return;
  const choice = await vscode.window.showWarningMessage(
    `IT-Office-3D needs the Claude Code plugin "${PLUGIN}" to see what Claude is doing.`,
    'Install in Terminal',
    'Copy commands',
  );
  if (choice === 'Install in Terminal') installPlugin();
  else if (choice === 'Copy commands') await vscode.env.clipboard.writeText(INSTALL.join('\n'));
}

function installPlugin() {
  const terminal = vscode.window.createTerminal('IT-Office-3D');
  terminal.show();
  INSTALL.forEach((cmd) => terminal.sendText(cmd));
  vscode.window.showInformationMessage('When the install finishes, run "Reload Window" and start a new Claude Code chat.');
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
    vscode.commands.registerCommand('claudeCode3d.installPlugin', installPlugin),
    // A changed folder list changes which chats this window follows.
    vscode.workspace.onDidChangeWorkspaceFolders(() => scene.load()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('itOffice3d.language')) scene.load();
    }),
  );
  // First run: the walkthrough covers the plugin too, so it replaces the warning once.
  if (!context.globalState.get('welcomed')) {
    context.globalState.update('welcomed', true);
    vscode.commands.executeCommand('workbench.action.openWalkthrough', `${context.extension.id}#getStarted`, false);
  } else {
    offerPluginInstall();
  }
}

function deactivate() {}

module.exports = { activate, deactivate, describe, pluginInstalled, pluginVersion, sceneQuery, sceneLanguage, formatDiagnostics };
