# Mimir for VSCode

Claude Code swarm intelligence — agent monitoring, kanban board, and dashboard inside VSCode.

## Features

- **Sidebar** — Stats grid, navigation, and project selector
- **Editor Panel** — Full Web UI embedded via iframe
- **Status Bar** — Shows "mimir: N agents" or "mimir: offline"
- **Auto-Init** — Automatically installs hooks and registers the project on workspace open

## Prerequisites

- [Mimir](https://www.npmjs.com/package/mimir) daemon running (`npx mimir start`)
- Node.js v22+

## Quick Start

1. Install Mimir: `npx mimir init .`
2. Start the daemon: `npx mimir start`
3. Open VSCode — the extension connects automatically

## Commands

| Command | Description |
|---------|-------------|
| `Mimir: Open Dashboard` | Open full dashboard in editor |
| `Mimir: Open Tasks` | Open kanban board in editor |
| `Mimir: Open Agents` | Open agent tree in editor |
| `Mimir: Open Context` | Open context viewer in editor |
| `Mimir: Open Activity` | Open activity log in editor |
| `Mimir: Start Daemon` | Start the Mimir daemon |
| `Mimir: Stop Daemon` | Stop the Mimir daemon |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mimir.port` | `3100` | Daemon port |
| `mimir.autoStartDaemon` | `false` | Auto-start daemon on activation |
| `mimir.pollingInterval` | `5000` | Polling interval (ms) for fallback |

## Architecture

The extension is a lightweight HTTP client — no embedded server. It connects to the running Mimir daemon at `localhost:3100`.

## Links

- [Documentation](https://sierradevsec.github.io/mimir/)
- [GitHub](https://github.com/SierraDevsec/mimir)
- [npm](https://www.npmjs.com/package/mimir)
