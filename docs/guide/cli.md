---
title: CLI
layout: default
parent: Guide
nav_order: 7
---

# CLI Commands

## Overview

```bash
mimir start              # Start daemon (port 3100)
mimir stop               # Stop daemon
mimir status             # Show active sessions/agents
mimir init [path]        # Install hooks + agents/skills/rules + register project
mimir ui                 # Open Web UI in browser
mimir logs [-n N] [-f]   # View/follow daemon logs
```

## Commands

### `mimir start`

Start the daemon in the background. Runs on port 3100 by default.

```bash
mimir start
# Custom port
MIMIR_PORT=3101 mimir start
```

### `mimir stop`

Stop the running daemon.

### `mimir status`

Show active sessions and agents. Useful for verifying the daemon is running and hooks are working.

### `mimir init [path]`

Install mimir into a project directory. This:
1. Installs hook configuration in `.claude/settings.local.json`
2. Copies agent templates (`mimir-reviewer`, `mimir-curator`)
3. Copies skill templates (`compress-output`, `compress-review`, `mimir-agents`)
4. Copies rule templates (`team.md`)
5. Seeds agent memory files
6. Registers the project in the database
7. Auto-starts the daemon if not running

Options:
- `-p, --port <port>` — Daemon port (default: 3100)
- `--hooks-only` — Install hooks only, skip all templates

### `mimir ui`

Open the Web UI dashboard in your default browser.

### `mimir logs`

View daemon logs.

Options:
- `-n <lines>` — Number of lines to show (default: 50)
- `-f` — Follow mode (tail -f)
