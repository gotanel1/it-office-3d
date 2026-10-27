# IT-Office-3D for VS Code

Shows the IT-Office-3D scene inside VS Code, so you do not need a browser.

![The IT department office](https://raw.githubusercontent.com/gotanel1/it-office-3d/main/docs/images/demo.gif)

- **Panel:** an **IT-Office-3D** tab sits next to Terminal and Problems. Drag it to the sidebar if you prefer it there.
- **Status bar:** shows who is working on what (`Dev · Edit`), or the token total when the turn ends. Hover for the busy desks, the time and the tokens; click to open the panel.
- **Sessions:** each window follows the newest Claude Code chat in its own workspace folders. Use **Choose Session** on the panel toolbar to pin one chat instead.
- **Wall screen:** the busy desk, Claude's summary of the call, the file or command, and the time. It turns amber when Claude waits for your approval.
- **Desk activity:** click a desk tag to list what it did in this task; **Open** shows a file in the editor. Failed calls are marked red.
- **Notifications:** when Claude finishes or needs your approval, while VS Code is in the background (setting **IT-Office-3D: Notify**).
- **Language:** English or Thai, by default the same as VS Code (setting **IT-Office-3D: Language**).
- **Toolbar on the panel:** choose the session, reset the view.
- **Command Palette:** `IT-Office-3D: Open`, `Choose Session`, `Reset`, `Show Diagnostics`, `Install Claude Code Plugin`.
- **Light on your computer:** the scene stops drawing while the panel is hidden and slows down when nobody is working.

The scene moves only when the **IT-Office-3D plugin** is installed in Claude Code, because the plugin's hooks are what report Claude's work. Install it once from a terminal:

```
claude plugin marketplace add gotanel1/it-office-3d
claude plugin install it-office-3d@it-office-3d
```

If the plugin is missing, the status bar shows a warning sign and VS Code offers to install it for you. Then start a new Claude Code conversation (in the terminal or the Claude Code extension).

Local VS Code only: remote windows (SSH, WSL, containers) are not supported yet.

## Privacy

Everything stays on your computer: no account, no key, no telemetry, no network calls. The plugin forwards only event names, the working folder, tool names and short fields such as a file path or command; prompts, file contents and tool output are dropped. Details in [SECURITY.md](https://github.com/gotanel1/it-office-3d/blob/main/SECURITY.md).

## If nothing moves

1. Start a **new** Claude Code chat: plugins load when a chat starts.
2. Run **Reload Window** after installing the plugin.
3. Run **IT-Office-3D: Show Diagnostics** and check the plugin and server lines. Paste the output into a [bug report](https://github.com/gotanel1/it-office-3d/issues/new?template=bug_report.yml) if you need help.

## Install

Search for **IT-Office-3D** in the Extensions view, or run `code --install-extension gotanel1.claude-code-3d`. VS Code keeps it up to date.

For editors without the VS Code Marketplace (Cursor, Antigravity), download the `.vsix` from the [latest release](https://github.com/gotanel1/it-office-3d/releases/latest) and run **Extensions: Install from VSIX...**.

## Build the .vsix yourself

```
cd vscode
npm test
npm run package
code --install-extension claude-code-3d-0.3.2.vsix
```

## Release a new version

1. Raise `version` in `vscode/package.json` (the Marketplace refuses a version it already has), then build: `cd vscode && npm test && npm run package`.
2. Open https://marketplace.visualstudio.com/manage/publishers/gotanel1, click **...** next to the extension, choose **Update**, and upload the new `.vsix`. VS Code users get the update by themselves.
3. Attach the same `.vsix` to a new GitHub release for editors without the Marketplace: `gh release create v<version> claude-code-3d-<version>.vsix`.
