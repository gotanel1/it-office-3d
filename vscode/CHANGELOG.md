# Changelog

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
