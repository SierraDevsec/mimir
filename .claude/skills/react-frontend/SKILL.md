---
name: react-frontend
description: React frontend development conventions for mimir Web UI
---

# mimir React Frontend

## Tech Stack
- React 19 + TypeScript + Vite 7 + TailwindCSS 4
- Routing: react-router-dom (flat routes under Layout)
- No external state library — local state + API client
- WebSocket for real-time events
- Frontend port: 5173 (dev), served by Hono at 3100 (prod)

## Directory Structure
```
src/web/
  main.tsx              — Entry point (BrowserRouter)
  App.tsx               — Route definitions
  components/Layout.tsx — Shared layout (nav + outlet)
  pages/                — One page per route
  lib/
    api.ts              — REST API client (typed fetch wrapper + interfaces)
    useQuery.ts         — Data fetching hook (auto-reload on WebSocket events)
    useWebSocket.ts     — WebSocket hook (auto-reconnect, event buffer)
    ProjectContext.tsx   — Project selection context (URL param + dropdown)
```

## API Client Pattern
- All types (Project, Session, Agent, ContextEntry, FileChange, Task, Activity) defined in `lib/api.ts`
- `api.*` methods return typed promises — use these, do NOT create separate fetch calls
- DuckDB timestamp caveat: use `localDate()` / `formatDateTime()` / `formatTime()` from api.ts
  - DuckDB `now()` stores local time but JSON serializes with 'Z' suffix
  - These helpers strip 'Z' so JS treats it as local time, not UTC

## WebSocket Pattern
- `useWebSocket()` hook provides: `events`, `connected`, `reconnectCount`, `clearEvents`
- Auto-reconnects on disconnect (3s interval)
- Event buffer capped at 200 entries (newest first)
- Use `connected` boolean for LIVE/OFFLINE indicator

## Code Style
- No comments in code — code must be self-documenting
- Remove existing comments when editing files

## Page Convention
- Each page is a default-exported functional component
- Fetch data with `useQuery<T>({ fetcher, deps })` custom hook from `lib/useQuery.ts`
- `fetcher` is a `useCallback` wrapping `Promise.all()` of multiple `api.*()` calls
- `useQuery` auto-reloads on WebSocket events (500ms debounce) via `useWebSocket()`
- Project filtering: read `projectId` from `useProject()` hook, pass to API calls

## Styling (mimir-specific)
- Dark theme: `bg-zinc-950`, `text-zinc-100` palette (zinc, not gray)
- Accent: emerald-400 for branding, varied chart colors
- Status colors: green (active/completed), yellow (in_progress), gray (pending)
- Consistent card pattern: `bg-zinc-800 rounded-lg p-4`
- Shared components: Card, Badge, EventBadge, FilterButton, Chart, EmptyState

## Commands
- Dev: `cd src/web && pnpm dev` (or from root: Vite config handles it)
- Build: `pnpm build` (builds both server + web)