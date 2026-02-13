---
name: test-driven-development
version: 1.0.0
description: >
  Enforce TDD discipline when implementing features or bugfixes. Preload this
  skill on implementation agents (backend-dev, frontend-dev) to ensure
  Red-Green-Refactor cycle is followed. Covers test-first workflow, minimal
  implementation, and rationalization resistance.
---

# Test-Driven Development

## Core Rule

Write the test first. Watch it fail. Write minimal code to pass. Refactor.

**If you didn't watch the test fail, you don't know if it tests the right thing.**

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions.

## Red-Green-Refactor Cycle

| Phase | Action | Verify |
|-------|--------|--------|
| **RED** | Write one failing test for one behavior | `pnpm test` — test fails for expected reason (missing feature, not typo) |
| **GREEN** | Write simplest code to pass | `pnpm test` — all tests pass, output clean |
| **REFACTOR** | Remove duplication, improve names | `pnpm test` — still green |
| **REPEAT** | Next failing test for next behavior | — |

## Rationalizations — Do NOT Skip TDD

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Need to explore first" | Fine. Throw away exploration, start fresh with TDD. |
| "This will slow me down" | TDD is faster than debugging. |
| "Keep as reference" | You'll adapt it. That's testing after. Delete means delete. |
| "Already manually tested" | Ad-hoc is not systematic. Can't re-run. |
| "Existing code has no tests" | You're improving it. Add tests for what you change. |

## Quick Reference — Good Tests

| Quality | Do | Don't |
|---------|-----|-------|
| **Minimal** | One behavior per test | "and" in test name = split it |
| **Clear** | Name describes behavior | `test('test1')` |
| **Real** | Test real code | Mock everything |
| **Intent** | Shows desired API | Obscures what code does |

## Exceptions (Confirm with Leader)

- Throwaway prototypes
- Generated code / configuration files
- Pure refactoring with existing test coverage

## Verification Checklist

- [ ] Every new function has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason
- [ ] Wrote minimal code to pass
- [ ] All tests pass (`pnpm test`)
- [ ] Edge cases and errors covered

## Deep Dive

For detailed examples, anti-patterns, and debugging guidance:
- **[examples.md](references/examples.md)** — Red-Green-Refactor worked examples
