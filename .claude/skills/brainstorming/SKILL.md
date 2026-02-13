---
name: brainstorming
description: >
  Structured idea-to-design process for creative work. Use before implementing
  features, building components, or making architectural decisions. Explores user
  intent through questions, proposes approaches with trade-offs, and produces an
  approved design before any code is written.
---

# Brainstorming Ideas Into Designs

## Core Rule

**No code before an approved design.** Explore intent, ask questions, propose
approaches, get user approval. Only then implement.

"Simple" projects need this too — unexamined assumptions cause the most wasted work.
The design can be short (a few sentences) but it must exist and be approved.

## Rationalizations — Do NOT Skip

| Excuse | Reality |
|--------|---------|
| "This is too simple" | Simple projects = most unexamined assumptions |
| "I already know what to build" | You know what YOU think. User may disagree. |
| "Just a quick change" | Quick changes without design = rework |
| "User already described it" | Description != design. Gaps exist. |

## Process

### 1. Explore Context
- Check relevant files, docs, recent commits
- Understand what already exists
- Search past marks for related decisions

### 2. Ask Clarifying Questions (One at a Time)
- Purpose and goals
- Constraints and non-goals
- Success criteria
- Prefer multiple-choice questions when possible
- One question per message — follow up as needed

### 3. Propose 2-3 Approaches
- Present trade-offs for each
- Lead with your recommendation and reasoning
- Consider complexity, maintainability, performance

### 4. Present Design
- Scale each section to its complexity
- Cover: architecture, components, data flow, error handling
- Ask after each section: "Does this look right?"
- Be ready to revise

### 5. Get Approval
- Explicit user confirmation before proceeding
- If rejected, revise and re-present

### 6. Transition to Implementation
- Design approved → begin coding
- Reference the design during implementation

## Design Document Template

For non-trivial features, save the design:

```markdown
# Design: [Feature Name]

## Goal
[1-2 sentences: what and why]

## Approach
[Chosen approach with brief rationale]

## Components
[What will be created/modified]

## Data Flow
[How data moves through the system]

## Edge Cases
[What could go wrong]

## Open Questions
[Anything unresolved]
```

## When to Skip (Confirm First)

- Single-line bug fixes with obvious cause
- Typo corrections
- Configuration changes with no architectural impact

Even then, confirm with user: "This looks like a straightforward fix. Proceed directly?"
