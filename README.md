<h1 align="center">clnode</h1>

<p align="center">
  <strong>Claude Code Swarm Intelligence Plugin</strong><br>
  Turn one Claude Code session into a coordinated dev team
</p>

<p align="center">
  <a href="https://sierraDevsec.github.io/clnode/">Docs</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#cli">CLI</a>
</p>

<table>
  <tr>
    <td align="center"><strong>Web UI</strong> (<code>localhost:3100</code>)</td>
    <td align="center"><strong>VSCode Extension</strong></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/web-ui.png" alt="Web UI" width="400"></td>
    <td><img src="docs/screenshots/vscode-extension.png" alt="VSCode Extension" width="400"></td>
  </tr>
</table>

<p align="center">
  <a href="./README.ko.md">한국어</a> •
  <a href="./README.md">English</a>
</p>

---

## Why clnode?

Claude Code's multi-agent mode has a fundamental limitation: **agents can't communicate with each other**. Every result must flow through the Leader agent, and after a few review cycles, the Leader's context explodes.

clnode solves this by using Claude Code's own hook system to create a shared memory layer:

```
Agent A finishes → summary saved to DB
Agent B starts   → receives A's summary automatically
Leader           → stays lean, only makes decisions
```

No wrapper. No custom framework. Just a plugin that fills the gap.

## Quick Start

### For Claude Code Users

Just ask Claude Code to run this:
```
curl -s https://raw.githubusercontent.com/SierraDevsec/clnode/main/docs/installation.md
```

Claude will read the guide and install clnode automatically.
**Restart your Claude Code session** after init — hooks activate on session start.

### For VS Code Users

Install [clnode for VSCode](https://marketplace.visualstudio.com/items?itemName=DeeJayL.clnode-vscode) from the Marketplace.

### Documentation

[https://sierradevsec.github.io/clnode/](https://sierradevsec.github.io/clnode/)

### For Development

```bash
git clone https://github.com/SierraDevsec/clnode.git
cd clnode && pnpm install && pnpm build
node dist/cli/index.js start
```

## Features

### No MCP Required

Pure hook-based implementation. No external MCP servers, no complex setup — just `npx clnode init .` and you're done.

### Smart Context Injection

Not just recent context — **relevant** context:

| Type | Description |
|------|-------------|
| **Sibling Summaries** | Results from agents with the same parent |
| **Same-Type History** | What previous agents of the same role accomplished |
| **Cross-Session** | Summaries from previous sessions on the same project |
| **Tagged Context** | Entries explicitly tagged for specific agents |

### Context Compression

Automatic 2-layer output compression (skill + hook). Agents self-compress to 10-line `[COMPRESSED]` format. See [Compression](https://sierradevsec.github.io/clnode/guide/compression/).

### Token Analytics

Track token usage per agent. See exactly how much each subagent costs in the Web UI dashboard.

### 6-Stage Kanban

`idea` → `planned` → `pending` → `in_progress` → `needs_review` → `completed`

Visual task tracking with automatic status updates when agents start/stop.

### Review Loop Protocol

Structured feedback cycle: Implement → Review → Fix → Re-review (user decides when to stop). Prevents infinite loops.

### Cost Optimization Guide

Built-in model recommendations:
- **Opus**: Leader, Reviewer (decisions)
- **Sonnet**: Implementation agents (coding)
- **Haiku**: Simple/mechanical tasks

### Prompt Auto-Attach

Every user prompt automatically receives:
- Active agents and their status
- Open tasks (prioritized by status)
- Recent decisions and blockers
- Completed agent summaries

## Web UI & VSCode Extension

Real-time dashboard at `http://localhost:3100`, also available as a VSCode sidebar.
Install the VSCode extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DeeJayL.clnode-vscode).

## CLI

```bash
clnode start              # Start daemon (port 3100)
clnode stop               # Stop daemon
clnode status             # Show active sessions/agents
clnode init [path]        # Install hooks + agents/skills/rules + register project
clnode ui                 # Open Web UI
clnode logs [-f]          # View/follow daemon logs
```

## Requirements

- **Node.js** ≥ 22
- **jq** — `brew install jq` / `apt install jq`
- **curl** — pre-installed on most systems

## Troubleshooting

### DuckDB binding error

```
Error: Cannot find module '.../duckdb/lib/binding/duckdb.node'
```

DuckDB requires native bindings compiled for your platform.

**Local install:**
```bash
pnpm rebuild duckdb
# or
npm rebuild duckdb
```

**Docker:** Add build tools and rebuild in your Dockerfile:
```dockerfile
# Alpine
RUN apk add --no-cache python3 make g++

# Debian/Ubuntu
RUN apt-get update && apt-get install -y python3 make g++

# Rebuild after dependencies installed
RUN pnpm rebuild duckdb
```

**Docker with volume mounts:** Exclude node_modules from host:
```yaml
# docker-compose.yml
volumes:
  - .:/app
  - /app/node_modules  # Use container's node_modules, not host's
```

### Command not found: clnode

After `pnpm install`, link the CLI globally:
```bash
pnpm link --global
# or run directly
node dist/cli/index.js start
```

## Uninstall

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

# 4. Remove clnode data (optional - deletes all session history)
rm -rf ~/.npm/_npx/**/node_modules/clnode/data
```

**Note**: After removing hooks, restart your Claude Code session.

## Issues & Feedback

Found a bug or have a feature request?

👉 [Open an issue](https://github.com/SierraDevsec/clnode/issues)

## License

Source Available — free for non-commercial use. Commercial use requires a license. See [LICENSE](./LICENSE).

---

<p align="center">
  Built for developers who want their AI to work like a team, not a chatbot.
</p>
