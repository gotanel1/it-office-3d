## Why connect?

IT-Office-3D only draws the office. Each AI reports what it is doing through a small hook, to a server on your own computer. **Connect AIs** finds Claude Code, Codex and Antigravity on this computer and runs, in a new terminal, only what each one still needs:

- **Claude Code:** `claude plugin marketplace add gotanel1/it-office-3d` and `claude plugin install it-office-3d@it-office-3d`
- **Codex:** `codex plugin marketplace add gotanel1/it-office-3d` and `codex plugin add it-office-3d@it-office-3d`
- **Antigravity:** adds the hook to `~/.gemini/config/hooks.json`, keeping your other hooks and saving a `.bak`

Then run **Reload Window**, start a new Claude Code chat, and in Codex type `/hooks` once to approve the it-office-3d hooks. Nothing leaves your computer: no account, no key, no telemetry.
