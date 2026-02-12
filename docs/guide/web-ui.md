---
title: Web UI & VSCode
layout: default
parent: Guide
nav_order: 6
---

# Web UI & VSCode Extension

Real-time dashboard available as a browser app and VSCode sidebar.

## Web UI

Access at `http://localhost:3100` (or `npx clnode ui`).

| Page | Description |
|------|-------------|
| **Dashboard** | Stats, charts, token usage per agent, active sessions |
| **Agents** | Agent tree with parent-child hierarchy |
| **Context** | Full-text search across all context entries |
| **Tasks** | 6-stage kanban board with drag-and-drop |
| **Activity** | Live event log via WebSocket |

### Embed Mode

Append `?embed=true` to hide the sidebar and use a transparent background. Used by the VSCode extension to embed the Web UI in editor panels.

Append `?project=<id>` to auto-select a specific project.

## VSCode Extension

The extension provides the same dashboard inside VSCode.

### Features

- **Sidebar**: Custom HTML panel with stats grid, navigation, and project selector
- **Editor Panel**: Full Web UI embedded via iframe
- **Status Bar**: Shows "clnode: N agents" or "clnode: offline"
- **Auto-Init**: Automatically installs hooks and registers the project when opening a workspace

### Install

From the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DeeJayL.clnode-vscode):

1. Search **"clnode for VSCode"** in the Extensions tab
2. Click **Install**
3. Reload Window (`Cmd+Shift+P` → "Developer: Reload Window")

### Architecture

```
VSCode Extension (lightweight client)
├── Sidebar WebviewView — custom HTML (stats + nav + project selector)
├── Editor WebviewPanel — embeds Web UI via iframe (?embed=true)
├── Status Bar — agent count or offline status
└── Auto-Init — hooks + project registration on workspace open
     ↓ HTTP/WS
clnode daemon (already running)
```

The extension is a pure HTTP client — no embedded server. It connects to the running clnode daemon.
