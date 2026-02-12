# Installation

## Prerequisites

| Item | Minimum Version | Installation |
|------|----------------|--------------|
| **Node.js** | v22+ | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| **jq** | any | `brew install jq` (macOS) / `apt install jq` (Ubuntu) |
| **curl** | any | Pre-installed on most systems |

## Install

```bash
npx clnode init .
```

This installs:
- **Hooks** in `.claude/settings.local.json`
- **Agents**: `clnode-reviewer` (code review) + `clnode-curator` (knowledge curation)
- **Skills**: `compress-output`, `compress-review`, `clnode-agents`
- **Rules**: `team.md` (swarm workflow)
- **Agent Memory**: Seed `MEMORY.md` files for agents

### For Development

```bash
git clone https://github.com/SierraDevsec/clnode.git
cd clnode && pnpm install && pnpm build
node dist/cli/index.js start
```

## Post-Install

**Restart your Claude Code session** — hooks activate on session start.

Verify installation:
```bash
npx clnode status
```

Open the dashboard:
```bash
npx clnode ui
```
