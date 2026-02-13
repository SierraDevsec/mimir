<p align="center">
  <h1 align="center">Mimir</h1>
  <p align="center"><strong>Agents that remember. Agents that talk.</strong></p>
  <p align="center">
    Local memory (DuckDB) + RAG (Cloudflare bge-m3) + inter-agent messaging<br/>
    for Claude Code agents that never forget and coordinate across sessions.
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#roadmap">Roadmap</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/For-Claude_Code-7C3AED?style=flat-square" alt="For Claude Code" />
  <img src="https://img.shields.io/badge/Memory-DuckDB_+_RAG-FF6B35?style=flat-square" alt="DuckDB + RAG Memory" />
  <img src="https://img.shields.io/badge/Agents-Talk_Across_Sessions-10B981?style=flat-square" alt="Cross-Session Communication" />
  <img src="https://img.shields.io/badge/License-Source_Available-blue?style=flat-square" alt="License" />
  <!-- <img src="https://img.shields.io/github/stars/anthropics/mimir?style=flat-square" alt="GitHub Stars" /> -->
</p>

<!--
## Demo

[![Mimir Demo](https://img.youtube.com/vi/YOUTUBE_VIDEO_ID/maxresdefault.jpg)](https://www.youtube.com/watch?v=YOUTUBE_VIDEO_ID)

> Replace YOUTUBE_VIDEO_ID with actual video ID after recording
-->

---

## The Problem

You spin up three Claude Code agents on a refactoring task. Agent A discovers the API uses snake_case internally. Agent B discovers the same thing — the hard way — and introduces a bug. Agent C? It breaks the same thing all over again.

**Your agents are amnesiacs.** Every session starts from zero. No shared context, no institutional memory, no coordination. You become the bottleneck — manually relaying context, copying error messages between terminals, babysitting each agent so they don't repeat each other's mistakes.

Mimir fixes this. When Agent A learns something, Agent B and C know it before they even start.

---

## How It Works

```
Agent A starts  ──→  hook  ──→  mimir daemon  ──→  DuckDB
Agent A marks "API uses snake_case"  ──→  saved

Agent B starts  ──→  hook  ──→  mimir daemon  ──→  reads A's marks
                                     └──→  injects as additionalContext
                                           "⚠️ API uses snake_case"

Agent C starts  ──→  same thing. Zero repeated mistakes.
```

Mimir hooks into Claude Code's lifecycle events. Every time an agent starts, stops, reads a file, or edits code — Mimir captures the context. When the next agent spins up, it receives everything relevant automatically via `additionalContext` injection.

No extra prompting. No copy-paste. It just works.

---

## Quick Start

```bash
# Install globally
npm install -g mimir

# Initialize in your project (installs hooks, starts daemon)
mimir init .

# Restart your Claude Code session — that's it
```

Three commands. Your agents now share a brain.

> **Prerequisites:** Node.js 22+, `jq` (for hook script)

---

## Features

### Self-Marking Knowledge System

Agents automatically mark important discoveries during work — warnings, decisions, and learnings. These marks are stored in DuckDB and surfaced to future agents working on related files.

```
Agent discovers: "DuckDB COUNT(*) returns BigInt — wrap with Number()"
    → saved as warning
    → every future agent touching DuckDB gets this injected automatically
```

### RAG-Based Smart Context

Not just keyword matching. Mimir uses [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (`bge-m3`, 1024-dim embeddings) + DuckDB vector similarity to find semantically relevant past knowledge.

- **Push**: Top 5 relevant marks auto-injected when agents start
- **Pull**: Agents search past marks on-demand via MCP tools
- **Fallback**: Graceful ILIKE text search when embeddings aren't available

### Swarm Mode

Launch multi-agent tmux sessions with built-in coordination:

```bash
mimir swarm -a "backend:sonnet,frontend:sonnet" -t "Refactor auth module"
```

Each agent gets its own tmux pane, a dedicated messaging channel, and automatic context sharing. The orchestrator stays lean — it only sees final reports.

### Agent Teams Compatible

Works seamlessly with Claude Code's experimental Agent Teams. Teammates fire the same hooks — zero code changes needed.

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

### MCP-Powered Messaging

Inter-agent communication through the Model Context Protocol. Agents can:
- Send/receive direct messages
- Search past observations from any session
- Mark discoveries for future agents
- Track promotion candidates for permanent rules

### VSCode / Cursor Extension

A companion extension with sidebar navigation, real-time agent monitoring, orchestration controls, and a full web dashboard — all embedded in your editor.

### Knowledge Lifecycle

Marks have a lifecycle. Active marks get pushed to new agents. Resolved marks are excluded from injection but remain searchable. Frequently recurring patterns get promoted to permanent rules files.

```
Hot   → Current session marks (auto-injected)
Warm  → Past session marks (RAG search + injection)
Cold  → Agent MEMORY.md files (persistent patterns)
Perm  → .claude/rules/ (promoted, always loaded)
```

### Curator Agent

Automated knowledge hygiene. Run `mimir curate` to audit marks, cross-pollinate learnings between agents, and promote recurring patterns to rules.

```bash
mimir curate              # Interactive
mimir curate --background # Background (tmux)
# Or schedule: 0 */6 * * * mimir curate --background
```

---

## Architecture

```
Claude Code Session
├── Hook events ──→ hook.sh (jq + curl, 3s timeout)
│                      └──→ mimir daemon (Hono, port 3100)
│                              ├── DuckDB (embedded, WAL mode)
│                              ├── RAG embeddings (Cloudflare bge-m3)
│                              ├── WebSocket (real-time UI updates)
│                              └── MCP server (agent messaging + marks)
├── Web UI (React 19 + Vite + TailwindCSS 4)
│   └── Dashboard, Agents, Tasks, Marks, Skills, Curation
└── VSCode Extension (sidebar + webview panels)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript 5.9, ESM |
| Server | Hono 4 + @hono/node-server |
| Database | DuckDB (duckdb-async) + vss extension |
| Embeddings | Cloudflare Workers AI bge-m3 (1024-dim) |
| CLI | commander.js 14 |
| Web UI | React 19, Vite 7, TailwindCSS 4, react-router-dom 7 |
| MCP | @modelcontextprotocol/sdk |
| Validation | Zod 4 |
| Test | Vitest 4 |
| Extension | VSCode/Cursor webview API |

---

## CLI Reference

```bash
mimir start                  # Start the daemon (background)
mimir stop                   # Stop the daemon
mimir status                 # Show active sessions and agents
mimir init [path]            # Install hooks + templates + register project
mimir ui                     # Open web dashboard in browser
mimir logs [-n 50] [-f]      # Tail daemon logs
mimir curate [--background]  # Run knowledge curation agent
mimir swarm -a "a:opus,b:sonnet" [-t "task"]  # Launch multi-agent tmux session
mimir mcp                    # Run MCP server (stdio mode)
```

---

## Configuration

### Environment Variables

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MIMIR_PORT` | `3100` | Daemon port |
| `CLOUDFLARE_ACCOUNT_ID` | — | RAG embeddings ([get yours](https://dash.cloudflare.com)) |
| `CLOUDFLARE_API_TOKEN` | — | RAG embeddings (Workers AI, free tier) |
| `SLACK_BOT_TOKEN` | — | Slack integration (optional) |
| `SLACK_APP_TOKEN` | — | Slack integration (optional) |

RAG embeddings are optional. Without them, Mimir falls back to text-based ILIKE search — still works, just less semantically aware. See [`.env.example`](.env.example) for details.

### What `mimir init` Sets Up

- `.claude/settings.local.json` — Hook configuration + Agent Teams
- `.mcp.json` — MCP server for inter-agent messaging
- `.claude/skills/` — Self-marking, self-search, self-memory, and more
- `.claude/agents/` — Curator agent definition
- `.claude/rules/` — Team coordination rules

---

## Roadmap

- [x] Hook-based lifecycle tracking (session, agent, file changes)
- [x] Self-marking knowledge system (warnings, decisions, discoveries)
- [x] RAG-based smart context injection (Cloudflare bge-m3 + DuckDB vss)
- [x] Mark lifecycle (active/resolved + promotion to rules)
- [x] MCP server for agent messaging and mark search
- [x] Swarm mode (multi-agent tmux orchestration)
- [x] VSCode/Cursor extension
- [x] Curator agent for automated knowledge hygiene
- [ ] npm publish + `npx mimir init .` one-liner setup
- [ ] Multi-project knowledge sharing
- [ ] Conflict-aware mark merging for parallel agents
- [ ] Slack integration for async team notifications
- [ ] Dashboard analytics (agent efficiency, mark hit rates)
- [ ] Plugin system for custom hook handlers
- [ ] Cloud-hosted daemon option
- [ ] First-class Windows support

---

## Contributing

PRs are always welcome. Here's the quick workflow:

```bash
git clone https://github.com/YOUR_ORG/mimir.git
cd mimir
pnpm install
pnpm dev          # Start dev server
pnpm test         # Run tests
pnpm build        # Full build (TypeScript + Vite)
```

### Project Structure

```
src/
  cli/          — CLI commands (commander.js)
  hooks/        — Hook script (bash + jq + curl)
  server/       — Hono server, routes, services, DuckDB
  mcp/          — MCP server (messaging + marks)
  web/          — React SPA (dashboard)
vscode-extension/ — VSCode/Cursor extension
.claude/
  agents/       — Agent definitions
  skills/       — Skill files (self-mark, self-search, etc.)
  rules/        — Shared rules
```

Before submitting:
1. Run `pnpm test` and `pnpm build` to verify nothing breaks
2. If adding a new hook event or MCP tool, update the relevant docs
3. Keep PRs focused — one feature or fix per PR

---

## License

Source Available — free for personal, educational, research, and open-source use. Commercial use requires a license. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <em>If Claude Code agents could remember, they'd remember Mimir.</em>
</p>
