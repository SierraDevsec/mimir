---
title: Troubleshooting
layout: default
parent: Reference
nav_order: 1
---

# Troubleshooting

## Hooks not working

1. **Restart Claude Code session** — Hooks activate on session start, not mid-session
2. **Check daemon is running**: `npx mimir status`
3. **Verify hooks config**: Check `.claude/settings.local.json` has a `hooks` section
4. **Check logs**: `npx mimir logs -f`

## DuckDB binding error

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

**Docker:** Add build tools:
```dockerfile
# Alpine
RUN apk add --no-cache python3 make g++

# Debian/Ubuntu
RUN apt-get update && apt-get install -y python3 make g++

RUN pnpm rebuild duckdb
```

**Docker with volume mounts:** Exclude node_modules:
```yaml
volumes:
  - .:/app
  - /app/node_modules  # Use container's node_modules
```

## Command not found: mimir

```bash
pnpm link --global
# or run directly
node dist/cli/index.js start
```

## jq not found

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq
```

## Zombie agents in DB

If an agent is killed (ESC or context limit), `SubagentStop` may not fire. The agent stays `active` in the database.

**Fix**: Use the Kill button in the Web UI, or:
```bash
curl -X DELETE http://localhost:3100/api/agents/<agent-id>
```

## Known Issues

- Hooks require Claude Code session restart after `mimir init`
- Transcript extraction needs 500ms delay (race condition with file write)
- VSCode Extension requires Reload Window after install (no hot reload)
