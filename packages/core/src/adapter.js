// Turns the JSON that Claude Code sends to a hook on stdin into the generic event the scene understands.
// Field names follow the Claude Code hooks reference: hook_event_name, session_id, transcript_path, cwd,
// tool_name, tool_input, agent_type. Codex sends the same names; Antigravity's input is first reshaped by
// fromAntigravity. Unknown shapes are ignored rather than rejected.
import { AGENTS, SHELL_TOOLS } from './rules.js';

const EVENT_NAMES = {
  SessionStart: 'SessionStart',
  UserPromptSubmit: 'UserPromptSubmit',
  PreToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  PostToolUseFailure: 'PostToolUse',
  PermissionRequest: 'PermissionRequest',
  Notification: 'Notification',
  SubagentStop: 'SubagentStop',
  Stop: 'Stop',
  // Antigravity has no prompt event; its first model call of a turn starts the task instead.
  PreInvocation: 'ModelCall',
};

const clip = (text, max) => {
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// Last two path segments are enough to recognise a file on a small label.
function shortPath(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join('/');
}

// One short line about what the tool is doing. Never includes file contents or prompts.
export function describeTool(tool, input = {}) {
  if (!input || typeof input !== 'object') return null;
  if (SHELL_TOOLS.has(tool)) return input.command ? { command: clip(input.command, 120) } : null;
  const file = input.file_path ?? input.notebook_path ?? input.path;
  if (file) return { path: shortPath(file) };
  if (input.pattern) return { path: clip(input.pattern, 80) };
  if (input.url) return { path: clip(input.url, 80) };
  if (input.query) return { path: clip(input.query, 80) };
  return null;
}

export function normalizeHook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const event = EVENT_NAMES[raw.hook_event_name ?? raw.event];
  if (!event) return null;

  const ev = {
    event,
    session_id: typeof raw.session_id === 'string' ? raw.session_id : 'default',
  };
  if (AGENTS.includes(raw.agent)) ev.agent = raw.agent;
  if (typeof raw.transcript_path === 'string') ev.transcript_path = raw.transcript_path;
  if (typeof raw.cwd === 'string') ev.cwd = raw.cwd;

  if (event === 'PreToolUse' || event === 'PostToolUse' || event === 'PermissionRequest') {
    ev.tool = typeof raw.tool_name === 'string' ? raw.tool_name : undefined;
    const input = raw.tool_input && typeof raw.tool_input === 'object' ? raw.tool_input : {};
    Object.assign(ev, describeTool(ev.tool, input));
    // The full path, so a desk's file list can open it in the editor.
    const file = input.file_path ?? input.notebook_path;
    if (typeof file === 'string' && file) ev.file = file.slice(0, 600);
    // Claude's own one-line summary of the call (Bash and Agent have one), shown as what the desk is doing.
    if (typeof input.description === 'string' && input.description.trim()) ev.note = clip(input.description, 100);
    if (typeof input.subagent_type === 'string') ev.subagent_type = input.subagent_type;
    else if (input.description) ev.subagent_type = String(input.description);
  }
  // A failed call (not one the user interrupted) marks its desk; the error text itself is never kept.
  if (raw.hook_event_name === 'PostToolUseFailure' && raw.is_interrupt !== true) ev.failed = true;
  if (event === 'Notification' && typeof raw.notification_type === 'string') ev.notification_type = raw.notification_type.slice(0, 60);
  if (event === 'SubagentStop' && typeof raw.agent_type === 'string') ev.agent_type = raw.agent_type;
  return ev;
}

// The first file a Codex apply_patch touches. The patch text itself (file contents) is never kept.
export function patchFile(patch) {
  return typeof patch === 'string' ? patch.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/m)?.[1].trim() ?? null : null;
}

// Antigravity's hook input in Claude Code's shape. Its stdin has no event name, so the hook command line
// passes it. Field names follow antigravity.google/docs/hooks (conversationId, workspacePaths, toolCall).
export function fromAntigravity(event, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const args = raw.toolCall?.args && typeof raw.toolCall.args === 'object' ? raw.toolCall.args : {};
  // Stop with fullyIdle false means subagents are still working, so the task is not over yet.
  if (event === 'Stop' && raw.fullyIdle === false) return null;
  return {
    hook_event_name: event === 'PostToolUse' && raw.error ? 'PostToolUseFailure' : event,
    session_id: raw.conversationId,
    cwd: args.Cwd ?? raw.workspacePaths?.[0],
    tool_name: raw.toolCall?.name,
    tool_input: {
      command: args.CommandLine,
      file_path: args.AbsolutePath ?? args.TargetFile,
      path: args.DirectoryPath ?? args.SearchPath ?? args.SearchDirectory,
      pattern: args.Pattern,
      query: args.Query ?? args.query,
      url: args.Url,
      description: args.Description,
      subagent_type: args.Role ?? args.TypeName,
    },
  };
}
