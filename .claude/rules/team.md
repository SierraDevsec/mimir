# Team Workflow Rules (Swarm Mode)

## Team Structure

```
Leader (Main Session / Opus)
├── backend-dev (Sonnet) — Hono server, DuckDB, services, hook events
├── frontend-dev (Sonnet) — Web UI pages, components, API client
├── cli-hooks (Sonnet) — CLI commands, hook.sh, init
├── devops (Sonnet) — CI/CD, Docker, deployment, monitoring
├── researcher (Sonnet) — research, analysis, feasibility studies
├── doc-writer (Sonnet) — documentation, API docs, guides
├── designer (Sonnet) — UI/UX design, component specs
├── copywriter (Sonnet) — microcopy, error messages, UX writing
└── mimir-curator (Opus) — knowledge curation, memory audit, cross-pollination

Team leads (delegate to sub-agents):
├── dev-lead (Opus) — manages backend-dev, devops
├── design-lead (Opus) — manages frontend-dev, designer, copywriter
└── planning-lead (Opus) — manages researcher, doc-writer
```

## Development Flow

1. **Plan**: Leader explores codebase and creates plan
2. **Distribute**: Leader spawns domain agents with task assignments
3. **Implement**: Agents complete work and return reports
4. **Review**: Leader spawns reviewer to check agents' work
5. **Report**: Leader summarizes all results to user

## Parallel vs Sequential

### Parallelizable when:
- Tasks have no file-level dependencies
- Independent domain work (e.g., backend + frontend)

### Must be sequential when:
- One task depends on another's output
- Schema/API changes must come before consumers
- Review must happen after implementation

## Context Optimization

- **Agents**: report concisely — changed files list and key decisions only
- **Reviewer**: report by priority — critical / warning / suggestion
- **Leader**: summarize to user in 3-5 lines per agent, do NOT relay full agent output

## Cost Optimization

- Use Opus for Leader, team leads (dev-lead, design-lead, planning-lead), mimir-curator
- Use Sonnet for implementation agents (backend-dev, frontend-dev, cli-hooks, devops, etc.)
- Use Haiku for simple, mechanical tasks only

## Progress Reporting

- Report to user after each phase starts
- Report to user after each phase completes
- Include summary of completed work and next steps

## Task Workflow

Tasks are managed in a 6-stage kanban:

```
Idea → Planned → Pending → In Progress → Needs Review → Completed
```

### State Transition Rules

| Current State | Next State | Trigger |
|---------------|------------|---------|
| Idea | Planned | Plan comment added |
| Planned | In Progress | "Go ahead" + assigned_to set |
| In Progress | Needs Review | Implementation complete |
| Needs Review | Completed | Review PASS |
| Needs Review | In Progress | Review finds issues |

### Handling Review Fixes (Required)

When a review returns **Warning** or **Critical**:
1. Move task back to **In Progress**
2. Fixes are **mandatory**
3. Move back to **Needs Review**
4. Re-review

**Suggestions** are optional but recommended.

## Review Loop Protocol

After fixes are made, **do NOT auto-trigger re-review** — always confirm with user.

```
Implement → Review → Fix → Ask user "Re-review?"
                              ├─ "yes" → Run reviewer again
                              └─ "no" → End (add needs_review tag)
```

### Rules

1. After fixes complete, Leader MUST ask user if re-review is needed
2. If user wants to stop, add `[needs_review]` tag to the task
3. Prevent infinite loops: only repeat when user explicitly says "continue"
4. **Review Warning/Critical must be fixed** — Suggestions only are optional