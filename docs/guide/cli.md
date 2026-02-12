---
title: CLI
layout: default
parent: Guide
nav_order: 7
---

# CLI Commands

## Overview

```bash
clnode start              # Start daemon (port 3100)
clnode stop               # Stop daemon
clnode status             # Show active sessions/agents
clnode init [path]        # Install hooks + agents/skills/rules + register project
clnode ui                 # Open Web UI in browser
clnode logs [-n N] [-f]   # View/follow daemon logs
```

## Commands

### `clnode start`

Start the daemon in the background. Runs on port 3100 by default.

```bash
clnode start
# Custom port
CLNODE_PORT=3101 clnode start
```

### `clnode stop`

Stop the running daemon.

### `clnode status`

Show active sessions and agents. Useful for verifying the daemon is running and hooks are working.

### `clnode init [path]`

Install clnode into a project directory. This:
1. Installs hook configuration in `.claude/settings.local.json`
2. Copies agent templates (`clnode-reviewer`, `clnode-curator`)
3. Copies skill templates (`compress-output`, `compress-review`, `clnode-agents`)
4. Copies rule templates (`team.md`)
5. Seeds agent memory files
6. Registers the project in the database
7. Auto-starts the daemon if not running

Options:
- `-p, --port <port>` — Daemon port (default: 3100)
- `--hooks-only` — Install hooks only, skip all templates

### `clnode ui`

Open the Web UI dashboard in your default browser.

### `clnode logs`

View daemon logs.

Options:
- `-n <lines>` — Number of lines to show (default: 50)
- `-f` — Follow mode (tail -f)
