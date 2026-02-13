# mimir Skill Conventions

## Table of Contents

- Skill Types: Preloaded vs User-Invoked
- Agent Frontmatter Integration
- MCP Tool Integration
- File Locations and Installation
- Version Numbering
- Naming Conventions

---

## Skill Types: Preloaded vs User-Invoked

mimir has two distinct skill usage patterns:

### Preloaded Skills

Loaded automatically via agent frontmatter `skills:` field.
Agent reads the skill as part of its system context on every invocation.

```yaml
# .claude/agents/backend-dev.md
---
skills:
  - self-mark
  - self-search
  - self-memory
---
```

**Characteristics**:
- Token cost every invocation (even when not needed)
- ~100% compliance (always in context)
- Best for: mandatory behaviors, marking protocols

**Design rules for preloaded skills**:
- Keep SKILL.md body under 100 lines (loaded every time)
- Move detail to references/ (only loaded when needed)
- Never duplicate information already in rules/
- Core instruction must fit in 5 lines

**Current preloaded skills**:
- `self-mark` — agent self-marking protocol (write marks)
- `self-search` — past mark search protocol (read marks)
- `self-memory` — agent memory update protocol (persist lasting patterns)

### User-Invoked Skills

Triggered by user slash command (e.g., `/skill-authoring-guide`).
Only loaded when explicitly requested.

**Characteristics**:
- Zero token cost until invoked
- Can be much larger (500 lines OK)
- Best for: workflows, generators, discovery tools

**Current user-invoked skills**:
- `skill-authoring-guide` — this skill

---

## Agent Frontmatter Integration

Skills are assigned to agents via the `skills:` field in agent markdown:

```yaml
# .claude/agents/my-agent.md
---
name: my-agent
description: Backend development agent
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
skills:
  - self-mark
  - self-search
  - self-memory
---
```

---

## MCP Tool Integration

Some skills instruct agents to call mimir MCP tools. The MCP server
(`src/mcp/server.ts`) runs as a sidecar process providing:

### Available MCP Tools

| Tool | Purpose | Use from skill |
|------|---------|---------------|
| `save_observation` | Store a mark/observation | self-mark |
| `search_observations` | Search past marks | Pull-based retrieval |
| `get_timeline` | Chronological context | Deep investigation |
| `get_details` | Full mark content | After search |
| `send_message` | Agent-to-agent messaging | Coordination |
| `read_messages` | Check inbox | Coordination |

### Skill ↔ MCP Tool Pattern

The skill provides the **behavioral instruction** (when and why to call),
the MCP tool provides the **mechanism** (how to call):

```
Skill (in system prompt):
  "When you discover something important, call save_observation"
  "Use type: warning for gotchas, decision for A-over-B choices"

MCP Tool (available in tool list):
  save_observation({ text, type, concepts })
```

**Do NOT duplicate MCP tool parameter docs in the skill.**
The agent can see tool schemas directly. The skill should explain
WHEN and WHY to use the tool, not HOW (the tool schema handles that).

---

## File Locations and Installation

### Source of truth

```
.claude/skills/{skill-name}/
├── SKILL.md
└── references/
```

`mimir init` copies skills listed in `.claude/init-manifest.json` to the target project.

### Adding a new skill to init

Add the skill name to `.claude/init-manifest.json` `skills` array.

---

## Version Numbering

Use semver in frontmatter (optional but recommended for preloaded skills):

```yaml
---
name: my-skill
description: ...
version: 1.0.0
---
```

- **Major**: Breaking change to skill behavior or output format
- **Minor**: New capability, backward compatible
- **Patch**: Fix, clarification, example addition

User-invoked skills don't need version (they're not cached in agent context).

---

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Skill name | kebab-case | `self-mark`, `skill-authoring-guide` |
| Skill directory | same as name | `.claude/skills/self-mark/` |
| Reference files | kebab-case.md | `categories.md`, `mimir-conventions.md` |
| Script files | snake_case | `validate_skill.py` |

**mimir prefix rule**: Use `mimir-` prefix only for skills that are
specific to mimir orchestration. Generic skills
(e.g., `self-mark`, `self-search`) don't need the prefix.
