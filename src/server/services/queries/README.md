# Query Modules

This directory contains modularized query functions extracted from `intelligence.ts` for better testability and reusability.

## Structure

```
queries/
  types.ts              — Shared types and safeQuery wrapper
  index.ts              — Re-exports all query functions

  # Smart Context Queries (buildSmartContext)
  siblings.ts           — Get completed sibling agents
  sameType.ts           — Get completed agents with same type
  crossSession.ts       — Get context from previous sessions
  taggedContext.ts      — Get tagged context entries
  recentContext.ts      — Get recent context (fallback)
  assignedTasks.ts      — Get tasks assigned to agent (with plan comments)

  # Prompt Context Queries (buildPromptContext)
  activeAgents.ts       — Get active agents in session
  openTasks.ts          — Get open tasks + backlog count
  decisions.ts          — Get recent decisions/blockers
  completedAgents.ts    — Get completed agent summaries

  # Todo Enforcer Query (checkIncompleteTasks)
  incompleteTasks.ts    — Get incomplete tasks for agent

  __tests__/            — Unit tests for each query
```

## Design Principles

### 1. Single Responsibility
Each query module has one purpose and returns one type of data.

### 2. Independent Error Handling
All queries use the `safeQuery` wrapper to catch and log errors without breaking the entire context building process.

### 3. Type Safety
All queries have explicit return types and parameter types.

### 4. Testability
Each query can be tested independently with mocked database.

### 5. Reusability
Queries can be composed in different ways for different contexts.

## Usage

### In intelligence.ts

```typescript
import {
  getSiblingAgents,
  getCrossSessionContext,
  getAssignedTasks,
} from "./queries/index.js";

export async function buildSmartContext(
  sessionId: string,
  agentName: string,
  agentType: string | null,
  parentAgentId: string | null
): Promise<string> {
  const sections: string[] = [];

  // 1. Get sibling summaries
  if (parentAgentId) {
    const siblings = await getSiblingAgents(sessionId, parentAgentId);
    if (siblings.length > 0) {
      sections.push(formatSiblings(siblings));
    }
  }

  // 2. Get cross-session context
  const crossSession = await getCrossSessionContext(sessionId);
  if (crossSession.length > 0) {
    sections.push(formatCrossSession(crossSession));
  }

  // ... etc
}
```

### In tests

```typescript
import { getSiblingAgents } from "../siblings.js";
import { getTestDb, clearTestData } from "./setup.js";

it("should return completed siblings", async () => {
  const db = await getTestDb();
  // ... insert test data
  const result = await getSiblingAgents("sess1", "parent1");
  expect(result).toHaveLength(2);
});
```

## Query Details

### getSiblingAgents(sessionId, parentAgentId)
Returns completed agents with the same parent in the same session.
- Filters: `status='completed'`, `context_summary IS NOT NULL`
- Order: `completed_at DESC`
- Limit: 5

### getSameTypeAgents(agentType, sessionId, parentAgentId)
Returns completed agents with the same `agent_type` from any session.
- Excludes siblings (same session + parent)
- Filters: `status='completed'`, `context_summary IS NOT NULL`
- Order: `completed_at DESC`
- Limit: 3

### getCrossSessionContext(sessionId)
Returns high-value context entries from previous sessions in the same project.
- Entry types: `agent_summary`, `decision`, `blocker`, `handoff`
- JOINs with agents to get agent_name
- Order: `created_at DESC`
- Limit: 5

### getTaggedContext(sessionId, agentName, agentType)
Returns context entries tagged for the agent or important types.
- Uses DuckDB's `list_contains()` function
- Matches: agent name, agent type, or 'all' tag
- Also includes: `decision`, `blocker`, `handoff` entry types
- Order: `created_at DESC`
- Limit: 5

### getRecentContext(sessionId, limit=5)
Fallback query for recent context entries when nothing else is found.
- No filters (all entry types)
- Order: `created_at DESC`

### getAssignedTasks(sessionId, agentName)
Returns tasks assigned to the agent, with plan comments for planned/pending tasks.
- Excludes: `completed`, `idea` status
- Priority order: `in_progress > pending > planned`
- Fetches nested plan comments for planned/pending tasks
- Returns: `TaskWithPlan[]` (includes optional `planComment` field)

### getActiveAgents(sessionId)
Returns currently active agents in the session.
- Filter: `status='active'`
- Order: `started_at DESC`

### getOpenTasks(sessionId, limit=10)
Returns open tasks and backlog count for project context.
- Open tasks: `pending`, `in_progress`, `needs_review`
- Priority order: `in_progress > needs_review > pending`
- Also counts backlog: `idea + planned` tasks
- Returns: `{ tasks: TaskRow[], backlogCount: number }`

### getDecisions(sessionId, limit=5)
Returns recent important context entries.
- Entry types: `decision`, `blocker`, `handoff`
- Order: `created_at DESC`

### getCompletedAgents(sessionId, limit=5)
Returns completed agents from current session with summaries.
- Filter: `status='completed'`, `context_summary IS NOT NULL`
- Order: `completed_at DESC`

### getIncompleteTasks(sessionId, agentName)
Returns incomplete tasks assigned to the agent (for todo enforcer).
- Statuses: `pending`, `in_progress`
- Order: `created_at ASC`

## Testing

All query modules have comprehensive unit tests in `__tests__/`:

```bash
# Run all query tests
pnpm test queries

# Run specific test file
pnpm test siblings
pnpm test assignedTasks
pnpm test openTasks
```

### Test Coverage
- Empty result sets
- Single and multiple rows
- Filtering logic (status, session, agent)
- Ordering (DESC/ASC)
- Limits
- NULL handling
- BigInt conversion (extractCount)
- Tag array handling
- Nested queries (plan comments)

## Migration from Old Code

Before:
```typescript
// In intelligence.ts (342 lines)
export async function buildSmartContext(...) {
  const siblings = await safeQuery<AgentRow>(...);
  const sameType = await safeQuery<AgentRow>(...);
  // ... 6 more inline queries
}
```

After:
```typescript
// In intelligence.ts (183 lines - 46% smaller)
export async function buildSmartContext(...) {
  const siblings = await getSiblingAgents(sessionId, parentAgentId);
  const sameType = await getSameTypeAgents(agentType, sessionId, parentAgentId);
  // ... use imported query functions
}

// In queries/*.ts (11 separate modules)
export async function getSiblingAgents(...) { ... }
export async function getSameTypeAgents(...) { ... }
```

### Benefits
- Intelligence service reduced from 342 to 183 lines (46% smaller)
- Each query is independently testable
- Type definitions are reusable
- Queries can be composed in new ways
- Test coverage increased from 33 tests to 62 tests (29 new query tests)
