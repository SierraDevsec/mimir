# clnode Skill Conventions

## Table of Contents

- Skill Types: Preloaded vs User-Invoked
- Agent Frontmatter Integration
- MCP Tool Integration
- Interaction with compress-output
- File Locations and Installation
- Version Numbering
- Naming Conventions

---

## Skill Types: Preloaded vs User-Invoked

clnode has two distinct skill usage patterns:

### Preloaded Skills

Loaded automatically via agent frontmatter `skills:` field.
Agent reads the skill as part of its system context on every invocation.

```yaml
# .claude/agents/backend-dev.md
---
skills:
  - compress-output
  - self-mark
---
```

**Characteristics**:
- Token cost every invocation (even when not needed)
- ~100% compliance (always in context)
- Best for: mandatory behaviors, output formatting, marking protocols

**Design rules for preloaded skills**:
- Keep SKILL.md body under 100 lines (loaded every time)
- Move detail to references/ (only loaded when needed)
- Never duplicate information already in rules/
- Core instruction must fit in 5 lines

**Current preloaded skills**:
- `compress-output` — output compression for implementer agents
- `compress-review` — output compression for reviewer agents
- `self-mark` — agent self-marking protocol

### User-Invoked Skills

Triggered by user slash command (e.g., `/clnode-agents`).
Only loaded when explicitly requested.

**Characteristics**:
- Zero token cost until invoked
- Can be much larger (500 lines OK)
- Best for: workflows, generators, discovery tools

**Current user-invoked skills**:
- `clnode-agents` — agent discovery and creation
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
  - compress-output
  - self-mark
---
```

When creating a new preloaded skill, update `clnode-agents` skill's
Step 3-3 to include the new skill in the auto-assignment rules:

```markdown
### Step 3-3: Determine skills
- If role is Reviewer → skills: [compress-review, self-mark]
- All other roles → skills: [compress-output, self-mark]
```

---

## MCP Tool Integration

Some skills instruct agents to call clnode MCP tools. The MCP server
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

## Interaction with compress-output

Most agents preload both a compress skill and other skills.
The compress skill has a hard rule: "return ONLY compressed output."

**Potential conflict**: A skill might say "output X" while compress says
"output only compressed format."

**Resolution rule**: compress-output/compress-review always wins for
the final returned message. Other skill outputs (like MCP tool calls)
happen DURING work, not in the final return. Design skills to produce
their artifacts via tool calls or file writes, not via the return message.

```
Good:  self-mark calls save_observation() during work → compress-output formats final return
Bad:   skill tells agent to "output a detailed report" → conflicts with compress
```

---

## File Locations and Installation

### Template location (source of truth)

```
templates/skills/{skill-name}/
├── SKILL.md
└── references/
```

### Installed location (per-project)

```
.claude/skills/{skill-name}/
├── SKILL.md
└── references/
```

`clnode init` copies from templates/ to .claude/skills/.

### Adding a new skill to init

Update `src/cli/index.ts` to include the new skill directory
in the init copy list, alongside existing skills.

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
| Skill directory | same as name | `templates/skills/self-mark/` |
| Reference files | kebab-case.md | `categories.md`, `clnode-conventions.md` |
| Script files | snake_case | `validate_skill.py` |

**clnode prefix rule**: Use `clnode-` prefix only for skills that are
specific to clnode orchestration (e.g., `clnode-agents`). Generic skills
(e.g., `compress-output`, `self-mark`) don't need the prefix.
