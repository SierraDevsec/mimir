---
name: changelog-generator
description: >
  Generate user-facing changelogs from git commit history. Use when preparing
  release notes, weekly updates, or version changelogs. Analyzes commits,
  categorizes changes, translates technical language to customer-friendly
  descriptions, and filters internal noise.
---

# Changelog Generator

Transform git commits into polished, user-friendly release notes.

## Process

### 1. Determine Scope

Ask the user if not clear:
- **Version-based**: `git log v1.0.0..HEAD`
- **Date-based**: `git log --after="2025-01-01"`
- **Recent**: `git log --oneline -50`

### 2. Analyze Commits

Read the git log and categorize each commit:

| Category | Commit Patterns | Emoji |
|----------|----------------|-------|
| **New Features** | `feat:`, `add:`, new functionality | New |
| **Improvements** | `improve:`, `enhance:`, `update:` | Improved |
| **Bug Fixes** | `fix:`, `bugfix:`, `resolve:` | Fixed |
| **Breaking Changes** | `BREAKING:`, `breaking:` | Breaking |
| **Security** | `security:`, CVE fixes | Security |

### 3. Filter Out Internal Noise

Exclude these from user-facing changelog:
- `refactor:`, `chore:`, `ci:`, `test:`, `docs:` (internal)
- Merge commits
- Dependency bumps (unless user-facing impact)
- Code style / formatting changes

### 4. Translate to User Language

| Technical Commit | User-Friendly |
|-----------------|---------------|
| `fix: handle null in getUserById` | Fixed: User profiles now load correctly in all cases |
| `feat: add WebSocket reconnection` | New: Real-time updates now automatically reconnect after network interruptions |
| `fix: race condition in session cleanup` | Fixed: Sessions no longer unexpectedly end during heavy usage |

Rules:
- Lead with **what changed for the user**, not how
- Use active voice ("Added", "Fixed", "Improved")
- Be specific about the benefit
- Group related changes into single entries

### 5. Output Format

```markdown
# Changelog — [Version or Date Range]

## New
- **[Feature Name]**: Description of what users can now do

## Improved
- **[Area]**: What got better and why it matters

## Fixed
- Description of what was broken and that it's now resolved

## Breaking Changes
- **[What changed]**: Migration steps if needed
```

### Variations

**For app store / short format:**
```
- New: Feature description
- Improved: Enhancement description
- Fixed: Bug fix description
```

**For internal / detailed format:**
Include commit hashes, affected files, and technical details.

## Tips

- Run from the git repository root
- Review output before publishing — AI may misinterpret commit intent
- Save to `CHANGELOG.md` if maintaining a running changelog
- For monorepos, filter by path: `git log -- src/web/`
