# Team Workflow Rules (Swarm Mode)

## Team Structure

```
Leader (Main Session / Opus)
├── Implementer A (Sonnet) — feature implementation
├── Implementer B (Sonnet) — feature implementation
├── Reviewer (Sonnet) — code review
└── Test Writer (Sonnet) — test coverage
```

## Development Flow

1. **Plan**: Leader explores codebase and creates plan
2. **Distribute**: Leader spawns implementers with task assignments
3. **Implement**: Implementers complete work and return reports
4. **Review**: Leader spawns reviewer to check implementers' work
5. **Test**: Leader spawns test-writer if needed
6. **Report**: Leader summarizes all results to user

## Parallel vs Sequential

### Parallelizable when:
- Tasks have no file-level dependencies
- Independent domain work (e.g., backend + frontend)
- Test writing for already-completed implementation

### Must be sequential when:
- One task depends on another's output
- Schema/API changes must come before consumers
- Review must happen after implementation

### Leader decides:
- After exploration, determine parallel vs sequential
- If independent: spawn implementers in parallel
- If dependent: spawn sequentially, pass results forward

## Context Optimization

- **Implementers**: report concisely — changed files list and key decisions only
- **Reviewer**: report by priority — critical / warning / suggestion
- **Leader**: summarize to user in 3-5 lines per agent, do NOT relay full agent output

## Cost Optimization

- Use Opus for Leader and architectural decisions
- Use Sonnet for implementation, review, and test writing
- Use Haiku for simple, mechanical tasks only

## Progress Reporting

- Report to user after each phase starts
- Report to user after each phase completes
- Include summary of completed work and next steps
