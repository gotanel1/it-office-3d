# IT-Office-3D for VS Code

Watch Claude Code, Codex and Antigravity work together in a cozy 2.5D office inside VS Code. Each AI has its own team lead, Claude, GPT and Antigravity, who walks over and briefs the desk doing its work.

![The IT department office](https://raw.githubusercontent.com/gotanel1/it-office-3d/v1.0.0/docs/images/office25d-preview.png)

- **Panel:** an **IT-Office-3D** tab sits next to Terminal and Problems. Drag it to the sidebar if you prefer it there.
- **Status bar:** shows who is working on what (`Dev · Edit`), or the token total when the turn ends. Hover for the busy desks, the time and the tokens; click to open the panel.
- **Sessions:** each window shows the newest chat of every AI in its own workspace folders (**All AIs**). Use **Choose Session** on the panel toolbar to pin one chat instead.
- **Task list:** the team list on the left shows which AI is working at each desk and what it is doing, for example `GPT · apply_patch · src/api.js`. Select a teammate to inspect its activity.
- **Desk activity:** click a desk tag to list what it did in this task; **Open** shows a file in the editor. Failed calls are marked red.
- **Notifications:** when Claude finishes or needs your approval, while VS Code is in the background (setting **IT-Office-3D: Notify**).
- **Language:** English or Thai, by default the same as VS Code (setting **IT-Office-3D: Language**).
- **Toolbar on the panel:** choose the session, reset the view.
- **Command Palette:** `IT-Office-3D: Open`, `Choose Session`, `Reset`, `Show Diagnostics`, `Connect AIs`.
- **Light on your computer:** the default scene uses local images without WebGL, pauses animation when hidden, and respects reduced motion.

## Connect your AIs (once)

The extension only draws the office. Each AI reports its work through a small hook, so the office stays still until the AIs you use are connected:

1. Run **IT-Office-3D: Connect AIs** from the Command Palette (VS Code also offers it on first start). It finds Claude Code, Codex and Antigravity on this computer and, in a terminal you can watch, connects only the ones that are not connected yet.
2. Run **Reload Window**.
3. **Claude Code:** start a new chat (hooks load when a chat starts).
4. **Codex:** open `codex`, type `/hooks` and press **t** to trust the hooks waiting for review (or **Enter** on an event to review one by one). Codex asks again after each update of the office, because it ties approval to the plugin's exact files; the extension shows a reminder with an **Open Codex** button whenever hooks are waiting.
5. **Antigravity:** nothing more to do.

What **Connect AIs** runs, if you prefer to do it by hand:

| AI | Commands |
|---|---|
| Claude Code | `claude plugin marketplace add gotanel1/it-office-3d` then `claude plugin install it-office-3d@it-office-3d` |
| Codex | `codex plugin marketplace add gotanel1/it-office-3d` then `codex plugin add it-office-3d@it-office-3d` |
| Antigravity | the extension adds the hook to `~/.gemini/config/hooks.json` itself (your other hooks are kept, the old file is saved as `hooks.json.bak`) |

No Node.js needed: the hooks only use `curl` (built into Windows 10 and later, macOS and Linux), and VS Code runs the office server. On macOS and Linux, Antigravity cannot be connected when your user folder path contains a space. Antigravity has no approval event, so its lead never shows **Waiting for your OK**.

Local VS Code only: remote windows (SSH, WSL, containers) are not supported yet.

## Privacy

Everything stays on your computer: no account, no key, no telemetry, no network calls. The hook forwards only event names, the working folder, tool names and short fields such as a file path or command; prompts, file contents and tool output are dropped. Details in [SECURITY.md](https://github.com/gotanel1/it-office-3d/blob/main/SECURITY.md).

## If nothing moves

1. Run **IT-Office-3D: Connect AIs**: it says which AIs are already connected.
2. Run **Reload Window**, then start a **new** chat in your AI: hooks load when a chat starts.
3. Codex only: check that `/hooks` lists the it-office-3d hooks as approved.
4. Run **IT-Office-3D: Show Diagnostics** and check the plugin and server lines. Paste the output into a [bug report](https://github.com/gotanel1/it-office-3d/issues/new?template=bug_report.yml) if you need help.

## Install

Search for **IT-Office-3D** in the Extensions view, or run `code --install-extension gotanel1.claude-code-3d`. VS Code keeps it up to date.

For editors without the VS Code Marketplace (Cursor, Antigravity), download the `.vsix` from the [latest release](https://github.com/gotanel1/it-office-3d/releases/latest) and run **Extensions: Install from VSIX...**.

## Build the .vsix yourself

```
cd vscode
npm test
npm run package
code --install-extension claude-code-3d-1.3.0.vsix
```

## Release a new version

1. Raise `version` in `vscode/package.json` (the Marketplace refuses a version it already has), then build: `cd vscode && npm test && npm run package`.
2. Open https://marketplace.visualstudio.com/manage/publishers/gotanel1, click **...** next to the extension, choose **Update**, and upload the new `.vsix`. VS Code users get the update by themselves.
3. Attach the same `.vsix` to a new GitHub release for editors without the Marketplace: `gh release create v<version> claude-code-3d-<version>.vsix`.
