# Security

## Reporting a problem

Please report security problems privately through [GitHub's private vulnerability reporting](https://github.com/gotanel1/it-office-3d/security/advisories/new), not in a public issue. You will get an answer within a week.

## What the project does, and does not do

- **Local only.** The scene server listens on `127.0.0.1` and refuses requests whose `Host` or `Origin` is not its own address, which blocks other web pages and DNS rebinding.
- **Read only.** It never sends Claude any instruction, never approves anything and never changes files.
- **Trimmed input.** The hook passes the AI's hook input to the server on `127.0.0.1`, which keeps the event name, the session id, the working folder, the tool name and a few short fields (file path, command, the AI's one-line description of the call) and discards the rest in memory. Prompts, file contents and tool output are never stored or shown.
- **Tokens** are read from Claude Code's own transcript files under `~/.claude`; other paths are refused.
- **No network, no telemetry, no account.** Nothing leaves your computer.
- **Files it writes:** `~/.claude-code-3d/server.json` (port and process id), and with the VS Code extension on macOS or Linux a copy of `hook.sh` in `~/.claude-code-3d/hook`. Connect AIs also adds the office hook to `~/.gemini/config/hooks.json` (saving `hooks.json.bak`).
