---
title: Installation
layout: default
parent: Getting Started
nav_order: 1
---

# Installation

## Prerequisites

| Item | Minimum Version | Installation |
|------|----------------|--------------|
| **Node.js** | v22+ | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| **jq** | any | `brew install jq` (macOS) / `apt install jq` (Ubuntu) |
| **curl** | any | Pre-installed on most systems |

## Install

### For Claude Code Users

Ask Claude Code:
```
curl -s https://raw.githubusercontent.com/SierraDevsec/mimir/main/docs/installation.md
```

### VSCode Extension

Install [Mimir for VSCode](https://marketplace.visualstudio.com/items?itemName=DeeJayL.mimir-vscode) from the Marketplace.

### For Development

```bash
git clone https://github.com/SierraDevsec/mimir.git
cd mimir && pnpm install && pnpm build
node dist/cli/index.js start
node dist/cli/index.js init .
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
