---
name: mcp-builder
description: >
  Guide for building high-quality MCP (Model Context Protocol) servers in TypeScript.
  Use when creating a new MCP server, adding tools to an existing one, or reviewing
  MCP server quality. Covers agent-centric design, tool naming, Zod schemas,
  response formats, error handling, and evaluation.
---

# MCP Server Development Guide

## Core Principle

Build tools for **agent workflows**, not API wrappers. Every tool should enable
a complete task, not just call an endpoint.

## Design Principles

| Principle | Do | Don't |
|-----------|-----|-------|
| **Workflows over endpoints** | `schedule_event` (checks + creates) | `check_availability` + `create_event` |
| **Optimize for context** | Return high-signal data, support concise/detailed modes | Dump entire API response |
| **Actionable errors** | "Try filter='active' to reduce results" | "400 Bad Request" |
| **Natural task names** | `search_users`, `create_issue` | `api_v2_user_get` |

## Development Process

### Phase 1: Research & Plan
1. Study MCP protocol docs: `https://modelcontextprotocol.io/llms-full.txt`
2. Read TypeScript SDK: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
3. Study target API documentation exhaustively
4. Plan tools — prioritize by workflow value, not API coverage

### Phase 2: Implement
1. Set up project structure (see references/typescript-guide.md)
2. Build shared utilities first (API client, error handler, formatters)
3. Implement tools with Zod schemas, annotations, comprehensive descriptions
4. Support JSON + Markdown response formats

### Phase 3: Review
1. Run quality checklist (see references/typescript-guide.md)
2. Build and verify: `npm run build`
3. Test with evaluation harness if applicable

## Quick Reference — Tool Registration

```typescript
server.registerTool("service_action_resource", {
  title: "Human-Readable Title",
  description: "What + When + Args + Returns + Examples + Errors",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search term"),
    limit: z.number().int().min(1).max(100).default(20),
  }).strict(),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  }
}, async (params) => {
  // implementation
});
```

## Naming Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| Server name | `{service}-mcp-server` | `mimir-mcp-server` |
| Tool name | `{service}_{action}_{resource}` | `mimir_search_observations` |
| Tool case | snake_case | `save_observation` |

## Error Handling Pattern

```typescript
// Report errors in result, not protocol-level
return {
  isError: true,
  content: [{ type: "text", text: `Error: ${actionableMessage}` }]
};
```

## References

- **[typescript-guide.md](references/typescript-guide.md)** — Full TypeScript implementation guide, project structure, Zod patterns, quality checklist
- **[best-practices.md](references/best-practices.md)** — MCP protocol best practices: naming, pagination, character limits, security, transport options
