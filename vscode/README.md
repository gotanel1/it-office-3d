# Claude Code 3D for VS Code

Shows the Claude Code 3D office inside VS Code, so you do not need a browser.

- **Panel:** a **Claude 3D** tab sits next to Terminal and Problems. Drag it to the sidebar if you prefer it there.
- **Status bar:** shows who is working on what (`Dev · Edit`), or the token total when the turn ends. Hover for the busy desks, the time and the tokens; click to open the panel.
- **Toolbar on the panel:** reset the view.
- **Command Palette:** `Claude Code 3D: Open`, `Reset`.

The scene moves only when the **Claude Code 3D plugin** is installed in Claude Code, because the plugin's hooks are what report Claude's work. Install it once from a terminal:

```
claude plugin marketplace add gotanel1/it-office-3d
claude plugin install it-office-3d@it-office-3d
```

Then start a new Claude Code conversation (in the terminal or the Claude Code extension).

Local VS Code only: remote windows (SSH, WSL, containers) are not supported yet.

## Install

Download `claude-code-3d-0.3.1.vsix` from the [latest release](https://github.com/gotanel1/it-office-3d/releases/latest), then in VS Code run **Extensions: Install from VSIX...** from the Command Palette and pick the file. Or run `code --install-extension claude-code-3d-0.3.1.vsix`. Reload the window afterwards.

## Build the .vsix yourself

```
cd vscode
npm test
npm run package
code --install-extension claude-code-3d-0.3.1.vsix
```
