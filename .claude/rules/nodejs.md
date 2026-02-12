---
paths:
  - "src/server/**/*.ts"
  - "src/api/**/*.ts"
  - "server/**/*.ts"
---

# Node.js Backend Rules

## API Design
- RESTful conventions: GET (list/get), POST (create), PUT (update), DELETE (delete)
- Consistent response format: `{ success, data, message }` or `{ ok, error }`
- Return proper HTTP status codes (400 for bad input, 404 for not found, 500 for server errors)

## Structure
- Route handler → Service → Repository/DB (layered architecture)
- Route handlers: parse input, call service, format response
- Services: business logic, no HTTP concepts (no req/res)
- Keep dependencies injectable for testing

## Database
- Use parameterized queries — never interpolate user input into SQL
- Keep queries in service/repository layer, not in route handlers
- Use transactions for multi-step operations

## Security
- Use environment variables for secrets, never hardcode
- Set appropriate CORS, rate limiting, and security headers