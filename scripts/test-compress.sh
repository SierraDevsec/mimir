#!/bin/bash
# test-compress.sh — Test the force-compress.sh hook
#
# Usage: bash scripts/test-compress.sh

SCRIPT="$(dirname "$0")/force-compress.sh"
PASS=0
FAIL=0
TOTAL=0

run_test() {
  local name="$1"
  local input="$2"
  local expect_exit="$3"
  local expect_stderr="$4"  # substring to check in stderr (optional)
  TOTAL=$((TOTAL + 1))

  local tmpfile=$(mktemp)
  local stderr_out=$(mktemp)
  echo "$input" | bash "$SCRIPT" 2>"$stderr_out"
  local actual_exit=$?

  if [ "$actual_exit" -eq "$expect_exit" ]; then
    if [ -n "$expect_stderr" ]; then
      if grep -q "$expect_stderr" "$stderr_out" 2>/dev/null; then
        echo "  PASS  $name (exit=$actual_exit, stderr matched)"
        PASS=$((PASS + 1))
      else
        echo "  FAIL  $name — stderr expected '$expect_stderr', got: $(cat "$stderr_out")"
        FAIL=$((FAIL + 1))
      fi
    else
      echo "  PASS  $name (exit=$actual_exit)"
      PASS=$((PASS + 1))
    fi
  else
    echo "  FAIL  $name — expected exit $expect_exit, got $actual_exit"
    FAIL=$((FAIL + 1))
  fi

  rm -f "$tmpfile" "$stderr_out"
}

echo "=== force-compress.sh Tests ==="
echo ""

# Test 1: Non-SubagentStop event → allow (exit 0)
run_test "Skip non-SubagentStop event" \
  '{"hook_event_name":"PostToolUse","agent_id":"test-1"}' \
  0

# Test 2: SubagentStop with no transcript → block (exit 2)
run_test "Block: no transcript path" \
  '{"hook_event_name":"SubagentStop","agent_id":"test-2"}' \
  2 \
  "COMPRESSED"

# Test 3: SubagentStop with transcript containing [COMPRESSED] → allow (exit 0)
TRANSCRIPT_OK=$(mktemp)
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"[COMPRESSED] agent_type: test\nChanged files: a.ts\nResult: test pass"}]}}' > "$TRANSCRIPT_OK"
run_test "Allow: transcript has [COMPRESSED]" \
  "{\"hook_event_name\":\"SubagentStop\",\"agent_id\":\"test-3\",\"agent_transcript_path\":\"$TRANSCRIPT_OK\"}" \
  0
rm -f "$TRANSCRIPT_OK"

# Test 4: SubagentStop with transcript WITHOUT [COMPRESSED] → block (exit 2)
TRANSCRIPT_BAD=$(mktemp)
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"I finished the task. Here are all the details..."}]}}' > "$TRANSCRIPT_BAD"
run_test "Block: transcript missing [COMPRESSED]" \
  "{\"hook_event_name\":\"SubagentStop\",\"agent_id\":\"test-4\",\"agent_transcript_path\":\"$TRANSCRIPT_BAD\"}" \
  2 \
  "COMPRESSED"
rm -f "$TRANSCRIPT_BAD"

# Test 5: stop_hook_active=true → allow through (second attempt bypass)
run_test "Allow: stop_hook_active=true (retry bypass)" \
  '{"hook_event_name":"SubagentStop","agent_id":"test-5","stop_hook_active":true}' \
  0

# Test 6: SessionStart → allow (exit 0)
run_test "Skip SessionStart" \
  '{"hook_event_name":"SessionStart","session_id":"s1"}' \
  0

# Test 7: Empty input → allow (exit 0)
run_test "Skip empty input" "" 0

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
