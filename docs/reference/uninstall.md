---
title: Uninstall
layout: default
parent: Reference
nav_order: 2
---

# Uninstall

To completely remove mimir from your project:

```bash
# 1. Stop the daemon
npx mimir stop

# 2. Remove hooks from settings
# Edit .claude/settings.local.json and remove the "hooks" section

# 3. Remove mimir templates (optional)
rm -rf .claude/agents/mimir-curator.md
rm -rf .claude/skills/self-mark .claude/skills/self-search .claude/skills/self-memory
rm -rf .claude/rules/team.md

# 4. Remove agent memory (optional)
rm -rf .claude/agent-memory/mimir-reviewer .claude/agent-memory/mimir-curator

# 5. Remove mimir data (optional - deletes all session history)
rm -rf ~/.npm/_npx/**/node_modules/mimir/data
```

**Note**: After removing hooks, restart your Claude Code session.
