# MCP Best Practices

## Table of Contents

- Server Naming
- Tool Naming and Design
- Tool Annotations
- Transport Options
- Security
- Testing

---

## Server Naming

- **TypeScript**: `{service}-mcp-server` (kebab-case)
- Name should be general, descriptive, no version numbers

## Tool Naming

- **snake_case**: `search_users`, `create_project`
- **Service prefix**: `slack_send_message` (avoid conflicts with other MCP servers)
- **Action-oriented**: Start with verbs (get, list, search, create, update, delete)

## Tool Design

| Principle | Explanation |
|-----------|------------|
| Build for workflows | Consolidate related operations into complete tasks |
| Optimize for context | Return high-signal data, support concise/detailed modes |
| Actionable errors | Suggest next steps in error messages |
| Natural subdivisions | Names reflect how humans think about tasks |

## Tool Annotations

| Annotation | Type | Default | When |
|------------|------|---------|------|
| `readOnlyHint` | boolean | false | True if tool doesn't modify state |
| `destructiveHint` | boolean | true | True if tool may destructively update |
| `idempotentHint` | boolean | false | True if repeated calls have no additional effect |
| `openWorldHint` | boolean | true | True if tool interacts with external entities |

Annotations are hints — not security guarantees.

## Transport Options

| Transport | Best For | Clients | Real-time |
|-----------|----------|---------|-----------|
| **Stdio** | CLI tools, local dev | Single | No |
| **HTTP** | Web services, remote | Multiple | No |
| **SSE** | Real-time updates | Multiple | Yes |

**Stdio notes**: Don't log to stdout (interferes with protocol). Use stderr.

## Security

### Input Validation
- Validate all params against schema (Zod)
- Sanitize file paths and system commands
- Validate URLs and external identifiers
- Prevent command injection

### Access Control
- API keys in environment variables, never in code
- Validate keys on startup
- Rate limit requests

### Privacy
- Only collect data necessary for functionality
- Don't send data outside your organization without disclosure
- Use HTTPS for all network communication

## Testing

| Type | Focus |
|------|-------|
| Functional | Valid/invalid inputs, correct execution |
| Integration | External system interaction |
| Security | Auth, sanitization, rate limiting |
| Performance | Load behavior, timeouts |
| Error handling | Proper reporting, resource cleanup |

**Important**: MCP servers are long-running (stdio/SSE). Don't run directly in tests.
Use evaluation harness or run in tmux with timeout.
