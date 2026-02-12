#!/bin/bash
# force-compress.sh — SubagentStop hook that blocks agent if output not compressed
#
# Exit 0 = allow stop
# Exit 2 = block stop (stderr → Claude feedback)
#
# Skips: non-SubagentStop events

LOGFILE="/tmp/mimir-force-compress.log"
INPUT=$(cat 2>/dev/null) || exit 0

# jq required
command -v jq &>/dev/null || exit 0

# Extract fields
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null)
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty' 2>/dev/null)
echo "$(date): force-compress.sh invoked (event=$EVENT, agent=$AGENT_ID)" >> "$LOGFILE"

# Only enforce compression for SubagentStop
if [ "$EVENT" != "SubagentStop" ]; then
  echo "$(date): skipping — not SubagentStop" >> "$LOGFILE"
  exit 0
fi

# If already blocked once (stop_hook_active=true), allow through
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$STOP_ACTIVE" = "true" ]; then
  echo "$(date): already blocked once, allowing through" >> "$LOGFILE"
  exit 0
fi

# Check agent transcript for [COMPRESSED] marker
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty' 2>/dev/null)
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  if grep -q '\[COMPRESSED\]' "$TRANSCRIPT_PATH" 2>/dev/null; then
    echo "$(date): [COMPRESSED] marker found, allowing through" >> "$LOGFILE"
    exit 0
  fi
fi

# Block stop — tell agent to compress output directly
echo "$(date): BLOCKING — [COMPRESSED] marker not found" >> "$LOGFILE"
echo "[COMPRESSED] marker not found. Compress your output NOW using this format:
[COMPRESSED] agent_type: <type>
Changed files: file1, file2
Result: (1-3 line summary)
Decisions: (if any)
Return ONLY the compressed format above. 5-10 lines max." >&2
exit 2
