# Installation

## Prerequisites

| Item | Minimum Version | Installation |
|------|----------------|--------------|
| **Node.js** | v22+ | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| **jq** | any | `brew install jq` (macOS) / `apt install jq` (Ubuntu) |
| **curl** | any | Pre-installed on most systems |

## Install

```bash
npx mimir init .
```

This installs:
- **Hooks** in `.claude/settings.local.json`
- **Agents**: `mimir-reviewer` (code review) + `mimir-curator` (knowledge curation)
- **Skills**: `compress-output`, `compress-review`, `mimir-agents`
- **Rules**: `team.md` (swarm workflow)
- **Agent Memory**: Seed `MEMORY.md` files for agents

### For Development

```bash
git clone https://github.com/SierraDevsec/mimir.git
cd mimir && pnpm install && pnpm build
node dist/cli/index.js start
```

## Post-Install

**Restart your Claude Code session** — hooks activate on session start.

Verify installation:
```bash
npx mimir status
```

Open the dashboard:
```bash
npx mimir ui
```
