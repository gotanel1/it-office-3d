# Changelog

## 1.3.1
- **Privacy notes corrected:** since 1.3.0 the hook hands the AI's input to the local server on `127.0.0.1`, which keeps only a few short fields and discards the rest in memory; README and SECURITY now say so.
- **Upgrade:** scene compatibility is now 9, so a server from the unreleased 1.4.0 test build is replaced. No other changes from 1.3.0.

## 1.3.0
- **No Node.js needed:** the hooks only use `curl` (built into Windows 10+, macOS and Linux): `sh hook.sh` for Claude Code, and on Windows a `curl.exe` call for Codex and Antigravity. The local server now trims each hook input to what the scene needs, as the old Node.js hook did, so prompts, file contents and tool output are still never kept.
- **Antigravity connects from VS Code itself:** Connect AIs writes its hook directly, and an older hook is updated when VS Code starts.
- **Codex reminder:** VS Code asks Codex (read only) whether the office hooks still wait for approval, at start and every 10 minutes, and shows **Open Codex** with the steps (`/hooks`, then `t`). Codex asks again after every office update.
- **Server:** VS Code starts the office server when it opens, because the hooks no longer start it. Scene compatibility is now 7, so an older server is replaced.
- **Validation:** 36 core and 15 extension tests, the smoke test, and live runs with Claude Code, Codex and the Antigravity CLI.

## 1.2.1
- **Codex approval explained:** the extension page shows how to read Codex's `/hooks` screen (**Active/Installed** counts, **Enter** on an event to approve the it-office-3d hook), and that Codex asks again after each office update.
- No code changes.

## 1.2.0
- **Connect AIs:** one command (and the first-run prompt) finds Claude Code, Codex and Antigravity on this computer and connects only the ones that are not connected yet, in a terminal you can watch. Replaces **Install Claude Code Plugin**.
- **Antigravity without a clone:** the extension carries the hook scripts and keeps a copy in `~/.claude-code-3d/hook`, refreshed after each update, so Antigravity's hook keeps working when VS Code replaces the extension folder.
- **Still yours to do once:** approve the it-office-3d hooks in Codex with `/hooks`, and start a new Claude Code chat.

## 1.1.0
- **Three AIs in one office:** Codex (GPT) and Antigravity now work next to Claude Code. Each AI has its own lead (Claude, GPT, Antigravity) who briefs only that AI's work, and the team list shows which AI is doing what at each desk.
- **Session picker:** names the AI of each session. **All AIs** shows every AI at once; picking a session shows only that one.
- **Codex:** install the office as a Codex plugin (`codex plugin marketplace add <repo>`, then `codex plugin add it-office-3d@it-office-3d`) and approve its hooks once with `/hooks`. Codex patches send only the file name, never their contents.
- **Antigravity:** `node scripts/connect.mjs antigravity` adds the hook to `~/.gemini/config/hooks.json`, keeps your other hooks and saves a `.bak`; `--remove` takes it out. Antigravity has no permission event, so its lead cannot show **Needs you**.
- **Upgrade:** scene compatibility is now 6, so an older background server is replaced.
- **Validation:** 35 automated tests; live runs with Codex and the Antigravity CLI reached the office.

## 1.0.2
- **More room for the office:** the top bar and the bottom task bar are gone; the office and team list use the full height.
- **Task list:** each working teammate in the team list shows what they are doing now (tool or note, plus the file or command).
- **Removed with the bars:** elapsed time, token counts, the connection indicator, the **Needs you** banner and the browser Reset button. VS Code still notifies when Claude waits for approval.
- **Upgrade:** scene compatibility is now 5, so an older background server is replaced.

## 1.0.1
- **Zoom and move the office:** scroll to zoom (up to 3×, toward the cursor), drag to move, double-click to reset. A drag that ends on a teammate does not open their activity.
- **Upgrade:** scene compatibility is now 4, so an older background server is replaced and serves the new scene.

## 1.0.0
- **A new cozy office:** fixed-camera 2.5D artwork, a warm wood interior, city windows, plants and a lounge, with GPT-generated local assets.
- **Eleven chibi characters:** the original ten IT roles plus a PM who walks between desks and briefs teammates using the existing work transitions.
- **Redesigned interface:** selectable team roster, activity inspector, current-task panel, elapsed time and token counters. Thai and English are supported.
- **Same workflow:** hooks, role classification, sessions, token accounting, approval notices, failure status, file-opening restrictions and extension commands retain their existing behavior.
- **Responsive and lightweight:** no WebGL needed for the default scene, layouts for compact panels and mobile browsers, reduced-motion support and paused animation when hidden. The original renderer remains accessible with `?view=3d`.
- **Upgrade:** extension, Claude Code plugin and core are version 1.0.0. Scene compatibility is now 3 so an older background server is replaced and serves the new assets; its in-memory task counters restart once. Claude Code work is unaffected.
- **Validation:** 44 automated tests, the plugin upgrade/hook smoke test and browser checks for the new interface passed before release.
- **Install:** download `claude-code-3d-1.0.0.vsix` and choose **Extensions: Install from VSIX...**. VS Code Marketplace publication is handled separately by the maintainer.

## 0.5.0
- **Waiting for you:** when Claude asks for permission, the wall screen turns amber, the PM raises a hand and the status bar shows **Needs you**.
- **Failures:** a tool call that fails marks its desk red (tag, desk light, task board, status bar). The error text itself is never kept.
- **Desk activity:** click a desk tag to see what it did in the current task, newest first. In VS Code, **Open** shows the file in the editor (only files inside the window's folders).
- **Notifications** when Claude finishes or waits for approval, by default only while VS Code is not the active window (setting **IT-Office-3D: Notify**).
- Plugin 0.4.0: also listens to Claude Code's PermissionRequest and Notification hooks.

## 0.4.0
- English and Thai: the speech bubbles and the wall screen follow the new **IT-Office-3D: Language** setting (by default, the VS Code language).
- A server left running by an older version is replaced by itself, so new features work without stopping anything by hand.
- **Show Diagnostics** lists the plugin and server versions, the chats seen and the last events, for bug reports. No prompts or file contents.
- A Get Started walkthrough on first install, and an **Install Claude Code Plugin** command.
- Lighter on your computer: no drawing while the panel is hidden, and a slower frame rate when nobody is working.

## 0.3.5
- Each VS Code window follows only the Claude Code chats running in its own workspace folders, so chats in other projects no longer move this window's scene.
- New **Choose Session** button on the panel (and command) to pin the window to one chat, or go back to following the workspace.

## 0.3.4
- A big screen on the back wall shows what is happening now: the busy desk, Claude's summary of the call, the file or command, and the elapsed time. When the task ends it shows the token total.

## 0.3.3
- Warns in the status bar when the Claude Code plugin `it-office-3d` is not installed, and offers to install it in a terminal or copy the commands.
- Marketplace page: screenshot and search keywords.

## 0.3.2
- Renamed to IT-Office-3D, with a new logo.

## 0.3.1
- First Marketplace release: the 3D IT office in a VS Code panel, live status in the status bar, and Claude's own one-line summary of each call.
