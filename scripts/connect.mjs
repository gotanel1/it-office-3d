// Adds (or with --remove, takes out) this office's hook to Antigravity, so its work shows up next to
// Claude Code's. Usage: node scripts/connect.mjs antigravity [--remove]
// The VS Code extension's Connect AIs does the same through the exports below, without Node.js.
// (Codex gets its hook from the Codex plugin in this repo; Claude Code from the Claude Code plugin.)
//
// Antigravity reads ~/.gemini/config/hooks.json ({ name: { Event: [groups] } }). Other hooks in that file
// are kept, and the old file is copied to hooks.json.bak before it is replaced.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'it-office-3d';
export const ANTIGRAVITY_FILE = path.join(os.homedir(), '.gemini', 'config', 'hooks.json');
// PreInvocation stands in for the prompt event Antigravity does not have.
const EVENTS = ['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'Stop'];
// Tool events wrap handlers in { matcher, hooks }; the other events list handlers directly.
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const HOOK_SH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hook.sh');

// Antigravity runs the command without a shell and stops all its tools when a PreToolUse hook fails, so the
// command must always exit 0. Windows: cmd turns a failed post (no server) into exit 0, and curl.exe ships
// with Windows 10+. Elsewhere hook.sh does the same; its path cannot contain spaces (no quoting without a shell).
// shortcut: Windows posts to the preferred port 3737 only, upgrade if the server often falls back to another.
export function antigravityCommand(event, platform = process.platform, hookSh = HOOK_SH) {
  return platform === 'win32'
    ? `cmd /d /c curl.exe -s -m 2 -o NUL --data-binary @- http://127.0.0.1:3737/hook/antigravity/${event} & exit 0`
    : `sh ${hookSh} antigravity ${event}`;
}

const isOurs = (h) => /hook\/antigravity|hook\.(mjs|sh)\b.*antigravity|--agent antigravity/.test(String(h?.command));
const ours = (entry) => isOurs(entry) || entry?.hooks?.some(isOurs);

// The config with this office's hook added (or removed), leaving every other hook alone.
export function withHook(config, remove = false, command = antigravityCommand) {
  const next = structuredClone(config ?? {});
  const table = (next[NAME] ??= {});
  for (const event of EVENTS) {
    const groups = (table[event] ?? []).filter((g) => !ours(g));
    const handler = { type: 'command', command: command(event), timeout: 10 };
    if (!remove) groups.push(TOOL_EVENTS.includes(event) ? { hooks: [handler] } : handler);
    if (groups.length) table[event] = groups;
    else delete table[event];
  }
  if (!Object.keys(table).length) delete next[NAME];
  return next;
}

// Reads, backs up and rewrites the hooks file. Throws, changing nothing, when the file is not valid JSON:
// the user's other hooks are in it.
export function writeHook(file = ANTIGRAVITY_FILE, remove = false, command = antigravityCommand) {
  let config = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    try {
      config = JSON.parse(text);
    } catch {
      throw new Error(`${file} is not valid JSON. Fix it first; nothing was changed.`);
    }
    fs.writeFileSync(`${file}.bak`, text);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(withHook(config, remove, command), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const remove = process.argv.includes('--remove');
  if (process.argv[2] !== 'antigravity') {
    console.error('Usage: node scripts/connect.mjs antigravity [--remove]');
    process.exit(1);
  }
  if (process.platform !== 'win32' && /\s/.test(HOOK_SH)) {
    console.error('The repository path has a space; Antigravity cannot run the hook from there.');
    process.exit(1);
  }
  try {
    writeHook(ANTIGRAVITY_FILE, remove);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log(`${remove ? 'Removed the office hook from' : 'Added the office hook to'} ${ANTIGRAVITY_FILE}`);
}
