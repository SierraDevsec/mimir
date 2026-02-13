# Query Modules

Modularized query functions for `intelligence.ts`. Each query is independently testable and reusable.

## Structure

```
queries/
  types.ts              — Shared types and safeQuery wrapper
  index.ts              — Re-exports all query functions

  # Smart Context (buildSmartContext — 4 stages)
  assignedTasks.ts      — Stage 1: Tasks assigned to agent
  pendingMessages.ts    — Stage 2: Pending messages for agent
  relevantMarks.ts      — Stage 3-4: Sibling marks + cross-session marks (RAG/fallback)

  # Prompt Context (buildPromptContext)
  activeAgents.ts       — Active agents in session
  openTasks.ts          — Open tasks + backlog count
  decisions.ts          — Recent decisions/blockers
  completedAgents.ts    — Completed agent summaries

  # Todo Enforcer (checkIncompleteTasks)
  incompleteTasks.ts    — Incomplete tasks for agent

  # Curator (promotion)
  promotionCandidates.ts — Mark concepts for rules/ promotion

  __tests__/            — Unit tests
```

## 4-Stage Smart Context

```
buildSmartContext(sessionId, agentName, agentType, parentAgentId)
  Stage 1: Assigned Tasks     — getAssignedTasks()
  Stage 2: Pending Messages   — getPendingMessages()
  Stage 3: Team Marks         — getSiblingMarks() (current session)
  Stage 4: Past Marks         — getRelevantMarksRAG() or getFileBasedMarks()+getProjectMarks()
```

## Testing

```bash
pnpm test queries
pnpm test assignedTasks
pnpm test relevantMarks
```
