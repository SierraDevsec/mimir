# TypeScript MCP Server Implementation Guide

## Table of Contents

- Project Structure
- Key Imports
- Server Initialization
- Tool Registration Pattern
- Zod Schema Patterns
- Response Formats
- Pagination
- Character Limits
- Error Handling
- Complete Example
- Quality Checklist

---

## Project Structure

```
{service}-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # McpServer initialization + transport
│   ├── types.ts           # TypeScript interfaces
│   ├── tools/             # One file per domain
│   ├── services/          # API clients, shared utilities
│   ├── schemas/           # Zod validation schemas
│   └── constants.ts       # API_URL, CHARACTER_LIMIT
└── dist/                  # Built JS (entry: dist/index.js)
```

## Key Imports

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
```

## Server Initialization

```typescript
const server = new McpServer({
  name: "service-mcp-server",
  version: "1.0.0"
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Tool Registration Pattern

```typescript
server.registerTool("service_action_resource", {
  title: "Human-Readable Title",
  description: `What the tool does.

Args:
  - param (type): Description
Returns:
  Schema description
Examples:
  - Use when: "scenario" -> params
  - Don't use when: "scenario"
Error Handling:
  - Returns "Error: ..." when ...`,
  inputSchema: MyZodSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
}, async (params) => {
  try {
    const result = await doWork(params);
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: handleError(error) }]
    };
  }
});
```

## Zod Schema Patterns

```typescript
// Strict schema with validation + defaults
const SearchSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200)
    .describe("Search term"),
  limit: z.number().int().min(1).max(100).default(20)
    .describe("Maximum results"),
  offset: z.number().int().min(0).default(0)
    .describe("Pagination offset"),
  response_format: z.enum(["markdown", "json"]).default("markdown")
    .describe("Output format")
}).strict();

type SearchInput = z.infer<typeof SearchSchema>;
```

Rules:
- Always use `.strict()` to reject unknown fields
- Always use `.describe()` for every field
- Add `.min()`, `.max()` constraints
- Provide `.default()` for optional fields

## Response Formats

Support both JSON (programmatic) and Markdown (human-readable):

**Markdown**: Headers, lists, display names with IDs, human-readable timestamps.
**JSON**: Complete structured data, consistent field names, pagination metadata.

## Pagination

```typescript
const response = {
  total: data.total,
  count: items.length,
  offset: params.offset,
  items,
  has_more: data.total > params.offset + items.length,
  next_offset: params.offset + items.length
};
```

Default to 20-50 items. Always respect `limit` parameter.

## Character Limits

```typescript
const CHARACTER_LIMIT = 25000;

if (result.length > CHARACTER_LIMIT) {
  // Truncate and notify
  response.truncated = true;
  response.truncation_message =
    `Truncated. Use offset/filters to see more.`;
}
```

## Error Handling

```typescript
function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    switch (error.response.status) {
      case 404: return "Error: Not found. Check the ID.";
      case 403: return "Error: Permission denied.";
      case 429: return "Error: Rate limited. Wait and retry.";
      default: return `Error: API returned ${error.response.status}`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
```

Rules:
- Report errors in result content, not protocol-level
- Set `isError: true` in return
- Make messages actionable (suggest next steps)
- Don't expose internals

---

## Quality Checklist

### Design
- [ ] Tools enable workflows, not just endpoint wrappers
- [ ] Names reflect natural task subdivisions
- [ ] Response formats optimize for agent context

### Implementation
- [ ] All tools use `registerTool` with title, description, inputSchema, annotations
- [ ] Zod schemas with `.strict()` and `.describe()`
- [ ] Comprehensive descriptions with Args/Returns/Examples/Errors
- [ ] Annotations correctly set (readOnlyHint, destructiveHint, etc.)

### TypeScript
- [ ] Strict mode enabled
- [ ] No `any` — use proper types or `unknown`
- [ ] Interfaces for all data structures
- [ ] Async functions have explicit `Promise<T>` return types

### Quality
- [ ] Pagination implemented for list operations
- [ ] CHARACTER_LIMIT check with graceful truncation
- [ ] Common logic extracted into shared functions
- [ ] `npm run build` passes without errors
