---
title: Uninstall
layout: default
parent: Reference
nav_order: 2
---

# Uninstall

To completely remove clnode from your project:

```bash
# 1. Stop the daemon
npx clnode stop

# 2. Remove hooks from settings
# Edit .claude/settings.local.json and remove the "hooks" section

# 3. Remove clnode templates (optional)
rm -rf .claude/agents/clnode-reviewer.md .claude/agents/clnode-curator.md
rm -rf .claude/skills/compress-output .claude/skills/compress-review .claude/skills/clnode-agents
rm -rf .claude/rules/team.md

# 4. Remove agent memory (optional)
rm -rf .claude/agent-memory/clnode-reviewer .claude/agent-memory/clnode-curator

# 5. Remove clnode data (optional - deletes all session history)
rm -rf ~/.npm/_npx/**/node_modules/clnode/data
```

**Note**: After removing hooks, restart your Claude Code session.
