// Shows the Claude Code 3D scene inside VS Code instead of a browser.
// The scene is the same local page the plugin serves, shown in a panel view with only the 3D scene;
// status and reset live in VS Code's own UI. Events still come from the plugin's hooks.
const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const infoFile = path.join(os.homedir(), '.claude-code-3d', 'server.json');
const VIEW_ID = 'claudeCode3d.scene';
const POLL_MS = 2000;

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

async function health(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
    return (await res.json()).name === 'claude-code-3d';
  } catch {
    return false;
  }
}

// Same discovery as scripts/lib.mjs. VS Code's own binary runs the server as plain Node, so users need no
// separate Node.js for the viewer (the plugin's hooks still need one).
async function ensureServer(wait = 8000) {
  let info = readInfo();
  if (info?.port && (await health(info.port))) return info;
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
    if (info?.port && (await health(info.port))) return info;
  }
  return null;
}

function page(body, frameSrc = null) {
  const csp = `default-src 'none'; style-src 'unsafe-inline';${frameSrc ? ` frame-src ${frameSrc};` : ''}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}
p{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-descriptionForeground);padding:0 1em}</style>
</head><body>${body}</body></html>`;
}

class SceneView {
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.onDidDispose(() => {
      this.view = undefined;
    });
    return this.load();
  }

  async load() {
    const view = this.view;
    if (!view) return;
    view.webview.html = page('<p>Starting Claude Code 3D…</p>');
    const info = await ensureServer();
    if (view !== this.view) return;
    if (!info) {
      view.webview.html = page('<p>Claude Code 3D could not start its local server. Close and reopen this view to try again.</p>');
      return;
    }
    // shortcut: works for local VS Code only; remote windows forward the port under another host, which the
    // server's Host check refuses. Upgrade by letting the server accept the forwarded host if remote is needed.
    const base = (await vscode.env.asExternalUri(vscode.Uri.parse(info.url))).toString();
    const url = `${base}?embed`;
    view.webview.html = page(`<iframe src="${url}" title="Claude Code 3D"></iframe>`, new URL(base).origin);
  }
}

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

// One line in the status bar: who is working on what, or the token total once the turn is over.
function describe(snap) {
  const session = snap?.active ? snap.sessions[snap.active] : null;
  if (!session?.startedAt) return { text: '$(eye) Claude 3D', tooltip: 'Open the Claude Code 3D office' };
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
    [...lines, '', `${seconds}s · ${tokens}`, '', 'Click to open the Claude Code 3D office'].map((l) => l.replace(/[\\`*_[\]<>]/g, '\\$&')).join('  \n'),
  );
  if (session.endedAt || working.length === 0) return { text: `$(check) Claude 3D · ${tokens}`, tooltip };
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
        const res = await fetch(`http://127.0.0.1:${info.port}/state`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) snap = await res.json();
      }
    } catch {
      // No server yet: show the idle label.
    }
    const { text, tooltip } = describe(snap);
    item.text = text;
    item.tooltip = tooltip;
    busy = false;
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return { dispose: () => clearInterval(timer) };
}

async function reset() {
  const info = readInfo();
  if (!info?.port) return;
  try {
    await fetch(`http://127.0.0.1:${info.port}/reset`, { method: 'POST', signal: AbortSignal.timeout(1000) });
  } catch {
    vscode.window.showWarningMessage('Claude Code 3D: the local server did not answer.');
  }
}

function activate(context) {
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
  );
}

function deactivate() {}

module.exports = { activate, deactivate, describe };
