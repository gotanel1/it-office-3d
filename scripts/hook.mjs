// Claude Code, Codex and Antigravity hook: forwards a small, redacted copy of the hook event to the local 3D
// office server. Claude Code runs it plain; the others add `--agent codex` or
// `--agent antigravity --event <EventName>` (Antigravity's stdin does not name the event).
//
// Rules this script keeps:
// - It never writes to stdout (for some events stdout would be added to Claude's context).
// - It always exits 0, and fast, so it can never slow down or break a Claude Code session.
// - It only forwards what the scene needs. Prompts, file contents and tool output are dropped here.
import { readInfo, postJson, ensureServer, log } from './lib.mjs';
import { fromAntigravity, patchFile } from '../packages/core/src/adapter.js';
import { AGENTS } from '../packages/core/src/rules.js';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const agent = AGENTS.includes(arg('--agent')) ? arg('--agent') : 'claude';

const INPUT_KEYS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'query', 'description', 'subagent_type'];

const clip = (value, max = 300) => (typeof value === 'string' ? value.slice(0, max) : undefined);

function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    let data = '';
    const done = () => resolve(data);
    const timer = setTimeout(done, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) done();
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on('error', done);
  });
}

function redact(input) {
  const out = {
    agent,
    hook_event_name: clip(input.hook_event_name, 60),
    session_id: clip(input.session_id, 120),
    transcript_path: clip(input.transcript_path, 600),
    cwd: clip(input.cwd, 600),
    tool_name: clip(input.tool_name, 120),
    agent_type: clip(input.agent_type, 120),
    notification_type: clip(input.notification_type, 60),
    is_interrupt: input.is_interrupt === true ? true : undefined,
  };
  if (input.tool_input && typeof input.tool_input === 'object') {
    const toolInput = { ...input.tool_input };
    // Codex may send a command as an argv array.
    if (Array.isArray(toolInput.command)) toolInput.command = toolInput.command.join(' ');
    // A Codex patch carries file contents: keep only the file it edits.
    if (input.tool_name === 'apply_patch') {
      toolInput.file_path = patchFile(toolInput.command) ?? undefined;
      toolInput.command = undefined;
    }
    out.tool_input = {};
    for (const key of INPUT_KEYS) {
      const value = clip(toolInput[key]);
      if (value !== undefined) out.tool_input[key] = value;
    }
  }
  return out;
}

async function send(port, payload) {
  try {
    return await postJson(port, '/hook', payload);
  } catch (err) {
    log(`post failed on ${port}: ${err.message}`);
    return false;
  }
}

try {
  const raw = await readStdin();
  const input = raw.trim() && (agent === 'antigravity' ? fromAntigravity(arg('--event'), JSON.parse(raw)) : JSON.parse(raw));
  if (input) {
    const payload = redact(input);
    log(`${agent} ${payload.hook_event_name} ${payload.session_id}`);
    // Once per chat and per prompt, also make sure the server is not one left by an older version;
    // tool events skip that extra request.
    const info = ['SessionStart', 'UserPromptSubmit'].includes(payload.hook_event_name) ? await ensureServer({ wait: 3000 }) : readInfo();
    if (!(info?.port && (await send(info.port, payload)))) {
      // The server is not running yet (or moved): start it, then try once more.
      const started = await ensureServer({ wait: 3000 });
      if (started) await send(started.port, payload);
    }
  }
} catch (err) {
  log(`hook error: ${err.message}`);
}
// Let Node exit by itself: calling process.exit() right after spawning the server, while fetch is still
// closing its socket, aborts Node on Windows (libuv assertion in win/async.c) with exit code 127.
// The unref'd timer only fires if something unexpected (such as stdin left open) keeps the process alive.
process.exitCode = 0;
setTimeout(() => process.exit(0), 2000).unref();
