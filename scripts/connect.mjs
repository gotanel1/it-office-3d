// Adds (or with --remove, takes out) this office's hook to Antigravity, so its work shows up next to
// Claude Code's. Usage: node scripts/connect.mjs antigravity [--remove]
// (Codex 0.147 does not read ~/.codex/hooks.json; it gets the hook from the Codex plugin in this repo.)
//
// Antigravity reads ~/.gemini/config/hooks.json ({ name: { Event: [groups] } }). Other hooks in that file
// are kept, and the old file is copied to hooks.json.bak before it is replaced.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hook.mjs');
const NAME = 'it-office-3d';

export const TARGETS = {
  antigravity: {
    file: path.join(os.homedir(), '.gemini', 'config', 'hooks.json'),
    // PreInvocation stands in for the prompt event Antigravity does not have.
    events: ['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'Stop'],
  },
};

// Antigravity runs the command without a shell, so quotes would reach node as part of the path.
// shortcut: a path with spaces cannot be passed this way, upgrade if someone clones into such a folder.
const command = (event) => `node ${hookScript.replace(/\\/g, '/')} --agent antigravity --event ${event}`;
const isOurs = (h) => String(h?.command).includes('--agent ') && String(h?.command).includes('hook.mjs');
// Tool events wrap handlers in { matcher, hooks }; the other events list handlers directly.
const ours = (entry) => isOurs(entry) || entry?.hooks?.some(isOurs);
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];

// The config with this office's hook for `agent` added (or removed), leaving every other hook alone.
export function withHook(config, agent, remove = false) {
  const next = structuredClone(config ?? {});
  const table = (next[NAME] ??= {});
  for (const event of TARGETS[agent].events) {
    const groups = (table[event] ?? []).filter((g) => !ours(g));
    const handler = { type: 'command', command: command(event), timeout: 10 };
    if (!remove) groups.push(TOOL_EVENTS.includes(event) ? { hooks: [handler] } : handler);
    if (groups.length) table[event] = groups;
    else delete table[event];
  }
  if (!Object.keys(table).length) delete next[NAME];
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const agent = process.argv[2];
  const remove = process.argv.includes('--remove');
  if (!TARGETS[agent]) {
    console.error('Usage: node scripts/connect.mjs antigravity [--remove]');
    process.exit(1);
  }
  if (/\s/.test(hookScript)) {
    console.error(`The repository path has a space (${hookScript}); Antigravity cannot run the hook from there.`);
    process.exit(1);
  }
  const { file } = TARGETS[agent];
  let config = {};
  if (fs.existsSync(file)) {
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      // Never overwrite a file we cannot read: the user's other hooks are in it.
      console.error(`${file} is not valid JSON. Fix it first; nothing was changed.`);
      process.exit(1);
    }
    fs.copyFileSync(file, `${file}.bak`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(withHook(config, agent, remove), null, 2)}\n`);
  console.log(`${remove ? 'Removed the office hook from' : 'Added the office hook to'} ${file}`);
}
