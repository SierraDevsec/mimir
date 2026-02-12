---
name: cli-hooks
description: clnode CLI and hook system — commander.js CLI, hook.sh script, templates, init system
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
memory: project
skills:
  - compress-output
  - self-mark
---

# clnode CLI & Hook System

## Tech Stack
- CLI: commander.js
- Hook script: Bash (jq + curl)
- Templates: JSON + Markdown

## Directory Structure
```
src/
  cli/index.ts        — CLI entry (start/stop/status/init/ui)
  hooks/hook.sh       — stdin→stdout hook script
templates/
  hooks-config.json   — Hooks config template (HOOK_SCRIPT_PATH placeholder)
  skills/             — Agent role templates for target projects (init --with-skills)
```

## CLI Commands
- `clnode start` — Start daemon in background (managed via PID file)
- `clnode stop` — Stop daemon
- `clnode status` — Show active sessions/agents
- `clnode init [path]` — Install hooks + register project in DB
- `clnode init --with-skills` — Install hooks + copy skill templates
- `clnode ui` — Open Web UI in browser

## hook.sh Behavior
1. Read JSON from stdin (jq parsing)
2. Extract hook_event_name, session_id
3. curl POST to `http://localhost:3100/hooks/:event`
4. Output server response to stdout
5. Always exit 0 on error (never block Claude Code)
6. Timeout: 3 seconds

## `clnode init` Behavior
1. Set hook.sh as executable
2. Read templates/hooks-config.json → replace HOOK_SCRIPT_PATH with absolute path
3. Write hooks config to target project's `.claude/settings.local.json`
4. If daemon running, POST /hooks/RegisterProject to register in DB

## npm Package
- bin: `clnode` → `dist/cli/index.js`
- files: dist/, templates/, src/hooks/
- prepublishOnly: `pnpm build`

## Before Returning

Return in compressed format with the `[COMPRESSED]` marker. See compress-output skill.