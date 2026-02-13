# TDD Worked Examples

## Table of Contents

- RED Phase — Writing Failing Tests
- GREEN Phase — Minimal Implementation
- Bug Fix Example
- When Stuck
- Testing Anti-Patterns
- Why Order Matters

---

## RED Phase — Writing Failing Tests

Write one minimal test showing what should happen.

**Good:**
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
Clear name, tests real behavior, one thing.

**Bad:**
```typescript
test('retry works', async () => {
  const mock = vi.fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(2);
});
```
Vague name, tests mock not code.

### Verify RED

```bash
pnpm test path/to/test.test.ts
```

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

Test passes? You're testing existing behavior. Fix test.
Test errors? Fix error, re-run until it fails correctly.

---

## GREEN Phase — Minimal Implementation

Write simplest code to pass the test.

**Good:**
```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```
Just enough to pass.

**Bad:**
```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> { /* YAGNI */ }
```
Over-engineered. Don't add features beyond the test.

---

## Bug Fix Example

**Bug:** Empty email accepted

**RED:**
```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED:**
```
FAIL: expected 'Email required', got undefined
```

**GREEN:**
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' };
  }
  // ...existing logic
}
```

**Verify GREEN:**
```
PASS
```

**REFACTOR:** Extract validation for multiple fields if needed.

---

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write wished-for API. Write assertion first. Ask Leader. |
| Test too complicated | Design too complicated. Simplify interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup huge | Extract helpers. Still complex? Simplify design. |

---

## Testing Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Testing mock behavior | Proves mock works, not code | Test real implementations |
| Test-only methods on production code | Leaky abstraction | Use public API only |
| Snapshot tests for logic | Brittle, don't explain intent | Assert specific values |
| Testing implementation details | Breaks on refactor | Test behavior/output |

---

## Why Order Matters

**"I'll write tests after to verify it works"**

Tests written after code pass immediately. Passing immediately proves nothing:
- Might test wrong thing
- Might test implementation, not behavior
- You never saw it catch the bug

**"Deleting X hours of work is wasteful"**

Sunk cost fallacy. The time is already gone. Your choice now:
- Delete and rewrite with TDD → high confidence
- Keep and add tests after → low confidence, likely bugs

**"TDD is dogmatic, being pragmatic means adapting"**

TDD IS pragmatic:
- Finds bugs before commit
- Prevents regressions
- Documents behavior
- Enables safe refactoring

"Pragmatic" shortcuts = debugging in production = slower.

---

## Red Flags — STOP and Start Over

- Code before test
- Test passes immediately (didn't see RED)
- Can't explain why test failed
- Rationalizing "just this once"
- "Keep as reference" instead of delete
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**
