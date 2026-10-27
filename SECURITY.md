# Security

## Reporting a problem

Please report security problems privately through [GitHub's private vulnerability reporting](https://github.com/gotanel1/it-office-3d/security/advisories/new), not in a public issue. You will get an answer within a week.

## What the project does, and does not do

- **Local only.** The scene server listens on `127.0.0.1` and refuses requests whose `Host` or `Origin` is not its own address, which blocks other web pages and DNS rebinding.
- **Read only.** It never sends Claude any instruction, never approves anything and never changes files.
- **Trimmed input.** The hook forwards the event name, the session id, the working folder, the tool name and a few short fields (file path, command, Claude's one-line description of the call). Prompts, file contents and tool output are dropped before anything leaves the hook.
- **Tokens** are read from Claude Code's own transcript files under `~/.claude`; other paths are refused.
- **No network, no telemetry, no account.** Nothing leaves your computer.
- **Files it writes:** `~/.claude-code-3d/server.json` (port and process id) and, only with `C3D_DEBUG=1`, `~/.claude-code-3d/hook.log`.
