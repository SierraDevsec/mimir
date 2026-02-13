# Orchestration Team Structure

```
Leader (orchestrator / opus)
├── backend-dev (sonnet) — Backend development specialist
├── researcher (sonnet) — Research specialist
```

## Communication

- Use `mcp__mimir-messaging__send_message` for all inter-agent messaging
- Report results to orchestrator when task is complete
- Only message other agents when coordination is needed
