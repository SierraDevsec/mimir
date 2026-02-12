---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript Rules

## Code Style
- No comments — code should be self-documenting
- Remove existing comments when editing files
- Use descriptive names instead of comments

## Type Safety
- Avoid `any` — use `unknown` and narrow with type guards
- Prefer interfaces for object shapes, types for unions/intersections
- Use `satisfies` for type-checked object literals
- Export types alongside their related functions

## Error Handling
- Use typed errors or Result patterns at boundaries
- Let unexpected errors propagate — don't catch and ignore
- Validate external input (API responses, user input), trust internal code

## Imports
- Use named imports, avoid default exports
- Group: external libs → internal modules → relative imports
- Avoid barrel imports (index.ts re-exports) in large projects

## Async
- Never use sequential awaits for independent operations
- Bad: `const a = await getA(); const b = await getB();`
- Good: `const [a, b] = await Promise.all([getA(), getB()]);`
