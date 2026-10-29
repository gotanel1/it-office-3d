// Adds (or with --remove, takes out) this office's hook to Codex or Antigravity, so their work shows up
// next to Claude Code's. Usage: node scripts/connect.mjs codex|antigravity [--remove]
//
// Codex reads ~/.codex/hooks.json ({ hooks: { Event: [groups] } }); Antigravity reads
// ~/.gemini/config/hooks.json ({ name: { Event: [groups] } }). Other hooks in those files are kept,
// and the old file is copied to hooks.json.bak before it is replaced.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hookScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hook.mjs');
const NAME = 'it-office-3d';

export const TARGETS = {
  codex: {
    file: path.join(os.homedir(), '.codex', 'hooks.json'),
    events: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStop', 'Stop'],
  },
  antigravity: {
    file: path.join(os.homedir(), '.gemini', 'config', 'hooks.json'),
    // PreInvocation stands in for the prompt event Antigravity does not have.
    events: ['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'Stop'],
  },
};

const command = (agent, event) => agent === 'antigravity'
  ? `node "${hookScript}" --agent antigravity --event ${event}`
  : `node "${hookScript}" --agent codex`;
const ours = (group) => group?.hooks?.some((h) => String(h.command).includes(`--agent `) && String(h.command).includes('hook.mjs'));

// The config with this office's hook for `agent` added (or removed), leaving every other hook alone.
export function withHook(config, agent, remove = false) {
  const next = structuredClone(config ?? {});
  const table = agent === 'codex' ? (next.hooks ??= {}) : (next[NAME] ??= {});
  for (const event of TARGETS[agent].events) {
    const groups = (table[event] ?? []).filter((g) => !ours(g));
    if (!remove) groups.push({ hooks: [{ type: 'command', command: command(agent, event), timeout: 10 }] });
    if (groups.length) table[event] = groups;
    else delete table[event];
  }
  if (agent === 'antigravity' && !Object.keys(table).length) delete next[NAME];
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const agent = process.argv[2];
  const remove = process.argv.includes('--remove');
  if (!TARGETS[agent]) {
    console.error('Usage: node scripts/connect.mjs codex|antigravity [--remove]');
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
  if (agent === 'codex' && !remove) console.log('Next: start Codex and approve the new hooks with /hooks.');
}
