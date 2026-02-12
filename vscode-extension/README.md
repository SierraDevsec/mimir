# clnode for VSCode

Claude Code swarm intelligence — agent monitoring, kanban board, and dashboard inside VSCode.

## Features

- **Sidebar** — Stats grid, navigation, and project selector
- **Editor Panel** — Full Web UI embedded via iframe
- **Status Bar** — Shows "clnode: N agents" or "clnode: offline"
- **Auto-Init** — Automatically installs hooks and registers the project on workspace open

## Prerequisites

- [clnode](https://www.npmjs.com/package/clnode) daemon running (`npx clnode start`)
- Node.js v22+

## Quick Start

1. Install clnode: `npx clnode init .`
2. Start the daemon: `npx clnode start`
3. Open VSCode — the extension connects automatically

## Commands

| Command | Description |
|---------|-------------|
| `clnode: Open Dashboard` | Open full dashboard in editor |
| `clnode: Open Tasks` | Open kanban board in editor |
| `clnode: Open Agents` | Open agent tree in editor |
| `clnode: Open Context` | Open context viewer in editor |
| `clnode: Open Activity` | Open activity log in editor |
| `clnode: Start Daemon` | Start the clnode daemon |
| `clnode: Stop Daemon` | Stop the clnode daemon |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `clnode.port` | `3100` | Daemon port |
| `clnode.autoStartDaemon` | `false` | Auto-start daemon on activation |
| `clnode.pollingInterval` | `5000` | Polling interval (ms) for fallback |

## Architecture

The extension is a lightweight HTTP client — no embedded server. It connects to the running clnode daemon at `localhost:3100`.

## Links

- [Documentation](https://sierradevsec.github.io/clnode/)
- [GitHub](https://github.com/SierraDevsec/clnode)
- [npm](https://www.npmjs.com/package/clnode)
