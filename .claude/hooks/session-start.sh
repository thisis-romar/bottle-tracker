#!/bin/bash
set -euo pipefail

# Claude Code on the web: install npm dependencies so `npm run build` / `npm run dev`
# work in-session. No-op in local environments.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Async mode: the session starts immediately while this runs in the background.
echo '{"async": true, "asyncTimeout": 300000}'

cd "$CLAUDE_PROJECT_DIR"

# Prefer `npm install` over `npm ci` so the cached container layer is reused
# across sessions (idempotent; safe to re-run).
npm install
