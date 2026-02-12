# Progressive Disclosure — Deep Guide

## Table of Contents

- The 3-Level System
- Level 1: Metadata Design
- Level 2: SKILL.md Body Design
- Level 3: Reference File Design
- Splitting Strategies
- Token Budget Estimation

---

## The 3-Level System

```
Agent context window (200k tokens shared)
│
├── System prompt, conversation, other skills...
│
├── Level 1: Skill metadata ──────── ALWAYS loaded (~100 words each)
│   "name: pdf-editor"
│   "description: Edit PDF files..."
│
├── Level 2: SKILL.md body ────────── Loaded ONLY when skill triggers
│   Core workflow, decision trees,     (<500 lines, ~2k-4k tokens)
│   quick reference, checklists
│
└── Level 3: references/ ─────────── Loaded ONLY when Claude decides
    categories.md, patterns.md,        (unlimited, pay-per-read)
    examples.md
```

Each level costs more tokens but provides more detail.
The goal: agent gets exactly the information it needs, nothing more.

---

## Level 1: Metadata Design

The `description` field is the **only trigger mechanism**. Claude reads all
skill descriptions to decide which skill to activate. This means:

**Good description** (comprehensive trigger):
```yaml
description: >
  Guide for creating well-structured Claude Code skills. Use when creating
  a new skill, refactoring an existing skill, or reviewing skill quality.
  Covers Progressive Disclosure, modular file structure, and clnode patterns.
```

**Bad description** (vague, won't trigger correctly):
```yaml
description: Skill creation helper
```

Rules:
- Include WHAT the skill does (purpose)
- Include WHEN to use it (trigger conditions) — be exhaustive
- Include WHAT it covers (scope) — helps Claude decide relevance
- Keep under 100 words (this loads into every conversation)

---

## Level 2: SKILL.md Body Design

Body loads only after the skill triggers. Optimize for:

### Structure for scanning

Agents don't read linearly. They scan for relevant sections.
Use clear headers, tables, and decision trees for fast navigation.

```markdown
## Decision Tree
├─ Creating a new skill?      → Read Section 3
├─ Refactoring existing?      → Read Section 4
└─ Just need the checklist?   → Jump to Quality Checklist
```

### Principle: Core workflow in body, variants in references

```
SKILL.md:
  "To create a mark, call save_observation with type, text, concepts."
  "For type selection guidance, see references/categories.md"

references/categories.md:
  Detailed examples for each type with edge cases
```

The agent can complete the happy path from SKILL.md alone.
References are for edge cases and deep dives.

### Budget: 500 lines maximum

| Skill complexity | SKILL.md lines | Reference files |
|-----------------|----------------|-----------------|
| Simple (single workflow) | 50-100 | 0 |
| Medium (2-3 workflows) | 100-300 | 1-2 |
| Complex (multi-domain) | 300-500 | 3-5 |

---

## Level 3: Reference File Design

### When Claude reads a reference

Claude decides to read a reference when:
1. SKILL.md explicitly says "Read X for this situation"
2. The decision tree routes to it
3. Claude encounters an edge case not covered in SKILL.md

### Optimizing reference files

**For files under 100 lines**: No special structure needed.

**For files 100-300 lines**: Add a table of contents at the top:
```markdown
# Categories Guide

## Table of Contents
- Warning type
- Decision type
- Discovery type
- Note type
- Edge cases
```

**For files over 300 lines**: Consider splitting further or add
grep-friendly section markers:
```markdown
## [CATEGORY: warning]
...
## [CATEGORY: decision]
...
```

### Reference naming conventions

| Content type | Naming pattern | Example |
|-------------|---------------|---------|
| Type/category guides | `categories.md` | Mark types |
| Workflow variants | `{variant}.md` | `aws.md`, `gcp.md` |
| Output templates | `templates.md` | Report formats |
| Domain knowledge | `{domain}.md` | `finance.md` |
| Examples collection | `examples.md` | Input/output pairs |

---

## Splitting Strategies

### Strategy 1: Domain split

When a skill serves multiple independent domains:

```
bigquery-skill/
├── SKILL.md (overview + domain selection)
└── references/
    ├── finance.md     (only loaded for finance queries)
    ├── sales.md       (only loaded for sales queries)
    └── product.md     (only loaded for product queries)
```

### Strategy 2: Workflow phase split (Trail of Bits pattern)

When a skill has sequential phases where agents may enter at different points:

```
differential-review/
├── SKILL.md (triage + decision tree + quick reference)
├── methodology.md    (Phase 0-4: detailed workflow)
├── adversarial.md    (Phase 5: attack modeling, HIGH RISK only)
├── reporting.md      (Phase 6: report template)
└── patterns.md       (reference: vulnerability patterns)
```

### Strategy 3: Complexity escalation

When most uses are simple but some need deep detail:

```
self-mark/
├── SKILL.md (core rule + quick reference + examples)
└── references/
    ├── categories.md  (detailed type guide, edge cases)
    └── surfacing.md   (how marks reach other agents)
```

---

## Token Budget Estimation

Rough token costs (1 token ≈ 4 characters ≈ 0.75 words):

| Content | Lines | Tokens (approx) |
|---------|-------|-----------------|
| Metadata (name + description) | 5 | 50-100 |
| SKILL.md body (compact) | 100 | 800-1200 |
| SKILL.md body (max) | 500 | 4000-6000 |
| Reference file (small) | 50 | 400-600 |
| Reference file (medium) | 200 | 1500-2500 |

**Context budget rule of thumb**:
- A skill's total loaded content (SKILL.md + referenced files for one invocation)
  should stay under 10k tokens
- If an agent needs 3 reference files simultaneously, the skill is too monolithic — redesign
