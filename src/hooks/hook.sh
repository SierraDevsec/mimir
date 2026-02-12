#!/bin/bash
# clnode hook script — Claude Code stdin→stdout protocol
# Claude Code → stdin(JSON) → hook.sh → curl POST daemon → stdout(JSON) → Claude Code
#
# Safety: always exit 0 to never block Claude Code.
# If daemon is unreachable, silently pass through.

set -o pipefail

CLNODE_PORT="${CLNODE_PORT:-3100}"
CLNODE_URL="http://localhost:${CLNODE_PORT}"

# Read all stdin
INPUT=$(cat 2>/dev/null) || { exit 0; }

# Extract event name (requires jq)
if ! command -v jq &>/dev/null; then
  exit 0
fi

EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"' 2>/dev/null) || { exit 0; }

# POST to daemon with 3s timeout
RESPONSE=$(echo "$INPUT" | curl -sf --max-time 3 -X POST \
  -H "Content-Type: application/json" \
  -d @- \
  "${CLNODE_URL}/hooks/${EVENT}" 2>/dev/null)

# Return response only if non-empty and valid
if [ $? -eq 0 ] && [ -n "$RESPONSE" ] && [ "$RESPONSE" != "{}" ]; then
  echo "$RESPONSE"
fi

exit 0
