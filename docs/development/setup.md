---
title: Dev Setup
layout: default
parent: Development
nav_order: 1
---

# Development Setup

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js v22, TypeScript, ESM |
| Server | Hono + @hono/node-server + @hono/node-ws |
| Database | DuckDB (duckdb-async) |
| CLI | commander.js |
| Web UI | React 19 + Vite 7 + TailwindCSS 4 |
| Test | Vitest |
| Package Manager | pnpm |

## Setup

```bash
git clone https://github.com/SierraDevsec/clnode.git
cd clnode
pnpm install
pnpm build
```

## Development Commands

```bash
pnpm dev          # Dev server with tsx (auto-reload)
pnpm build        # TypeScript + Vite build
pnpm test         # Run tests
pnpm test:watch   # Watch mode
```

## Running Locally

```bash
# Start the daemon directly (not via npx)
node dist/cli/index.js start

# Or dev mode with auto-reload
pnpm dev
```

## Important Notes

- Use `now()` instead of `current_timestamp` in DuckDB queries
- DuckDB `COUNT(*)` returns BigInt — always wrap with `Number()`
- DuckDB `VARCHAR[]` needs literal construction, not bind params
- `hook.sh` exits 0 even on failure (never blocks Claude Code)
- `hook.sh` has 3s curl timeout, requires `jq`
- Server port: env var `CLNODE_PORT` (default 3100)

## VSCode Extension Development

```bash
cd vscode-extension
pnpm build              # esbuild → dist/extension.js (CJS)
pnpm package            # vsce package → .vsix
code --install-extension clnode-vscode-*.vsix --force
```

After Web UI changes: `pnpm build` (root) → restart daemon → rebuild extension → install → reload VSCode.
