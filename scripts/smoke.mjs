// End-to-end check of the plugin as Claude Code runs it, in a throwaway home folder:
// a server left by an older version is replaced, a hook event starts nothing twice and reaches the
// scene, and the session is found by its folder. Run with `node scripts/smoke.mjs`; CI runs it on
// Windows, macOS and Linux.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from '../packages/core/src/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ito3d-home-'));
const env = { ...process.env, HOME: home, USERPROFILE: home };
const dataDir = path.join(home, '.claude-code-3d');
const readInfo = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json'), 'utf8'));
const run = (script, input) => spawnSync(process.execPath, [path.join(root, 'scripts', script), '--no-open'], { env, input, encoding: 'utf8', timeout: 20000 });
const get = async (port, route) => (await fetch(`http://127.0.0.1:${port}${route}`)).json();
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// 1. A v0.5.0-era server advertises API 2; v1 must replace it to serve the new scene.
fs.mkdirSync(dataDir, { recursive: true });
const old = spawn(process.execPath, ['-e', `
  const http = require('node:http');
  const s = http.createServer((q, r) => r.end(JSON.stringify({ ok: true, name: 'claude-code-3d', api: 2, pid: process.pid, port: s.address().port })));
  s.listen(0, '127.0.0.1', () => require('node:fs').writeFileSync(process.argv[1], JSON.stringify({ pid: process.pid, port: s.address().port, url: 'http://127.0.0.1:' + s.address().port + '/' })));
`, path.join(dataDir, 'server.json')], { stdio: 'ignore' });
for (let i = 0; i < 50 && !fs.existsSync(path.join(dataDir, 'server.json')); i++) await new Promise((r) => setTimeout(r, 100));

// 2. The open script replaces it.
const opened = run('open.mjs');
assert.equal(opened.status, 0, opened.stdout + opened.stderr);
const info = readInfo();
assert.notEqual(info.pid, old.pid, 'the old server was not replaced');
assert.equal((await get(info.port, '/health')).api, API);
await new Promise((r) => setTimeout(r, 500));
assert.equal(alive(old.pid), false, 'the old server is still running');

// 3. Hook events reach the scene, and the session is found by its folder.
const cwd = path.join(home, 'project');
for (const event of [
  { hook_event_name: 'SessionStart', session_id: 'smoke', cwd },
  { hook_event_name: 'PreToolUse', session_id: 'smoke', cwd, tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run the tests' } },
]) {
  const hooked = spawnSync('sh', [path.join(root, 'scripts', 'hook.sh'), 'claude'], { env, input: JSON.stringify(event), encoding: 'utf8', timeout: 20000 });
  assert.equal(hooked.status, 0, hooked.stderr);
  assert.equal(hooked.stdout, '', 'the hook must never print');
}
assert.equal(readInfo().pid, info.pid, 'the hook started a second server');
const mine = await get(info.port, `/state?session=&cwd=${encodeURIComponent(cwd)}`);
assert.equal(mine.active, 'smoke');
assert.equal(mine.sessions.smoke.roles.QA.note, 'Run the tests');
assert.equal((await get(info.port, `/state?session=&cwd=${encodeURIComponent(path.join(home, 'other'))}`)).active, null);

process.kill(info.pid);
fs.rmSync(home, { recursive: true, force: true });
console.log('smoke test passed');
