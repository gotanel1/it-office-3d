// Shared helpers for the hook script and the open script: find the background server, start it if needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const daemonFile = path.resolve(here, '..', 'packages', 'core', 'src', 'daemon.js');
export const dataDir = path.join(os.homedir(), '.claude-code-3d');
const infoFile = path.join(dataDir, 'server.json');
// The server version this plugin needs; see API in packages/core/src/server.js.
const API = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'packages', 'core', 'package.json'), 'utf8')).sceneApi;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function readInfo() {
  try {
    return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  } catch {
    return null;
  }
}

// The server's health answer, or null when nothing (or something else) answers on that port.
export async function health(port, timeout = 500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeout) });
    const h = await res.json();
    return h.name === 'claude-code-3d' ? h : null;
  } catch {
    return null;
  }
}

const current = (h) => (h?.api ?? 1) >= API;

export async function postJson(port, route, body, timeout = 800) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  return res.ok;
}

// The child is detached with no stdio so it outlives the hook and never holds its pipes open.
export function spawnDaemon() {
  const child = spawn(process.execPath, [daemonFile], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
}

// Returns the server info once it answers, starting the background server first if it is not running.
// A server left running by an older version is stopped first, so the scene gets what this version needs.
export async function ensureServer({ wait = 4000 } = {}) {
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
    while (Date.now() < until && (await health(h.port, 200))) await sleep(100);
  }
  spawnDaemon();
  const end = Date.now() + wait;
  while (Date.now() < end) {
    await sleep(150);
    info = readInfo();
    if (info?.port && current(await health(info.port))) return info;
  }
  return null;
}

export function log(message) {
  if (!process.env.C3D_DEBUG) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(path.join(dataDir, 'hook.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break a hook.
  }
}
