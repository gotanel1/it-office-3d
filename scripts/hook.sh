#!/bin/sh
# Hook for Claude Code, Codex and Antigravity: forwards the hook input, as the AI sent it, to the local
# IT-Office-3D server, which keeps only what the scene needs. Needs only sh and curl (no Node.js).
# Usage: hook.sh [agent] [event]   (Antigravity's input does not name its event, so it is passed here.)
#
# It never writes to stdout (the AI could read it) and always exits 0, so it cannot break the AI.
# With no server running the input is simply dropped.
port=$(sed -n 's/.*"port":[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$HOME/.claude-code-3d/server.json" 2>/dev/null)
if [ -n "$port" ]; then
  curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' --data-binary @- \
    "http://127.0.0.1:$port/hook/${1:-claude}/$2" 2>/dev/null
else
  cat >/dev/null
fi
exit 0
