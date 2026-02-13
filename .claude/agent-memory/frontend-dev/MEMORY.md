# frontend-dev Memory
> Last curated: 2026-02-07 (curator audit)

## Code Patterns

### Data Fetching Pattern
- All pages use `useQuery<T>({ fetcher, deps })` custom hook from `lib/useQuery.ts`
- `fetcher` is a `useCallback` wrapping `Promise.all()` of multiple `api.*()` calls
- `deps` array triggers re-fetch (e.g., `[projectId]`)
- `useQuery` auto-reloads on WebSocket events (500ms debounce) via `useWebSocket()`
- Destructure tuple result: `const [a = [], b = [], ...] = data ?? [];`

### API Client Pattern
- Singleton `api` object in `lib/api.ts` with typed methods
- Base path is `/api` (relative, same-origin)
- Generic `request<T>()` wrapper handles fetch + error + JSON parsing
- Query params built with `URLSearchParams` for multi-param endpoints
- Types defined inline in `api.ts`: Project, Session, Agent, ContextEntry, Task, etc.

### Project Filtering Pattern
- `ProjectContext.tsx` provides `useProject()` hook returning `{ projects, selected, setSelected }`
- Initial project from URL: `searchParams.get("project")` on mount
- Every page's fetcher reads `projectId` from `useProject()` and passes to api calls as optional param
- Layout sidebar has project selector dropdown at bottom

### Embed Mode Pattern
- `?embed=true` query param activates embed mode in Layout.tsx
- Embed mode: hides sidebar nav, sets transparent background on html+body elements
- Cleanup in useEffect return: restores background on unmount
- Used by VSCode Extension iframe: `?embed=true&project=<id>`

### DuckDB Timestamp Gotcha
- `localDate()` in `api.ts` strips 'Z' suffix from timestamps: `ts.replace(/Z$/, "")`
- DuckDB `now()` stores local time but JSON serializes with 'Z' suffix
- Without this fix, all timestamps display shifted by timezone offset
- `formatDateTime()` and `formatTime()` both use `localDate()` internally

### Component Structure
- Pages: Dashboard, Agents, Context, Tasks, Activity (in `pages/`)
- Shared components: Card, Badge, EventBadge, FilterButton, Chart, EmptyState, AgentDetail, Layout
- Card component has optional `hover` prop for interactive cards
- EventBadge maps event types to color variants via `EVENT_VARIANTS` constant

### Dashboard Data Loading
- Dashboard loads 10 parallel API calls in single `Promise.all()`
- Type alias: `type DashboardData = [Session[], Agent[], Agent[], Activity[], Stats, Task[], ...]`
- Chart data transformed from API responses with color mappings
- Token formatting helper: `formatTokens(n)` returns K/M suffixed strings

### Styling Conventions
- Dark theme: zinc color palette (zinc-950, zinc-800, zinc-400, etc.)
- Accent: emerald-400 for branding, varied chart colors
- CSS variables: `var(--bg-primary)` used in Layout for main background
- react-icons (`ri` prefix): RiDashboardLine, RiRobot2Line, etc.

## Known Gotchas

- react-compiler is enabled: do NOT use useMemo, useCallback for memoization (but useCallback IS used for fetcher refs in useQuery deps -- this is for referential identity, not memoization)
- WebSocket reconnect: 3-second delay on close, auto-reconnects indefinitely
- `events` array in useWebSocket capped at 200 entries (`.slice(0, 200)`)
- useQuery `depsKey` uses `JSON.stringify(deps)` for deep comparison -- avoid non-serializable deps
- Agent kill button sends PATCH with `{ status: "completed", context_summary: "Manually killed via UI" }`

## Cross-domain Dependencies

- API types in `lib/api.ts` must match server response shapes (no shared type package)
- WebSocket message format assumed: `{ event: string, data: Record<string, unknown>, timestamp: string }`
- Task status values must match server-side status enum: idea, planned, pending, in_progress, needs_review, completed
- Embed mode used by VSCode Extension webview (changes here affect extension display)
- `formatTime`/`formatDateTime` used across all pages -- timestamp display depends on `localDate()` strip logic

## VSCode Extension Relationship

- Extension uses iframe to embed Web UI at `http://localhost:{port}` with `?embed=true&project=<id>`
- Sidebar view (`sidebar-view.ts`) is custom HTML, NOT iframe -- uses raw fetch to `/api/stats`, `/api/agents`, `/api/projects`
- Sidebar uses VSCode CSS variables (`var(--vscode-foreground)`, etc.) for theme compatibility
- Container queries (`@container`) in sidebar CSS for responsive grid: 1-col / 2-col / 4-col at 180px/360px breakpoints
- `acquireVsCodeApi()` called once in sidebar script; state persisted via `vscode.getState()/setState()`
- `window.open()` function name conflict in webview: use `openPage()` instead
- Extension icon must be PNG for extension list (SVG not supported); use `rsvg-convert` to convert
- Extension must output CJS format (`format: 'cjs'` in esbuild config)

### Observations Page (Added 2026-02-09)
- New page at `pages/Observations.tsx` — lists observations with filter controls
- API types added to `lib/api.ts`: `Observation`, `Summary` interfaces
- API methods: `api.observations(params)`, `api.observation(id)`, `api.summaries(params)`
- Expandable rows showing narrative, facts, concepts, files_read, files_modified
- Filter by type (bugfix/feature/decision/discovery/change/note) and search text
- Route added to `App.tsx` and nav item in `Layout.tsx`

## Recent Context

- Web UI refactoring completed: component extraction, data fetching standardization
- Project filtering integrated across all pages using `useProject()` hook
- Dashboard now shows 8 stat cards including weekly messages and total tokens
- Chart component added for bar charts (agent types, activity breakdown, daily messages, token usage, context sizes)
- Observations page added (2026-02-09): observation list with filters, expandable detail rows
