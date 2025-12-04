# Claude Code Guidelines for Agentic PM Tooling

## Project Progress Tracking

- **ALWAYS** keep `project-progress.md` up to date when the project changes
- **ALWAYS** update `project-progress.md` before making any changes
- Use git history as a helper if necessary
- Focus on **facts only** in project-progress.md:
  - What's implemented (with line counts, test counts)
  - Outstanding tasks (simple checklist)
  - Known limitations (factual constraints)
  - Objective metrics (lines of code, test coverage, etc.)
- **NO** subjective recommendations, priorities, or assessments

## Git Commit Practices

- **AUTOMATICALLY** commit to git frequently with clear summaries
- Commits serve as pointers when context is cleared
- Include "🤖 Generated with [Claude Code](https://claude.com/claude-code)" in commit messages
- Include "Co-Authored-By: Claude <noreply@anthropic.com>"
- Write clear, factual commit messages documenting what changed and why

## Documentation Structure

### QUICK_REFERENCE.md (163 lines)
- **Purpose:** Quick command lookup, environment variables, troubleshooting
- **Content:** Command one-liners with essential parameters, not detailed examples
- **Include:** Pointers (📖) to detailed skill documentation
- **Target:** ~150-165 lines for fast scanning
- **Avoid:** Duplicating detailed examples that live in skill docs

### Individual Skill Docs (.claude/skills/*.md)
- **Purpose:** Comprehensive documentation for each skill
- **Content:** Detailed examples, edge cases, API details, all parameters
- **Target:** ~150 lines each
- **Include:** Everything needed for deep understanding of the skill

### Test Documentation (TESTING.md)
- **Purpose:** Single source of truth for testing information
- **Content:** Test status, patterns, instructions
- **Avoid:** Multiple redundant test documentation files

## Testing Requirements

- **ALWAYS** update tests when implementing new features
- Target: Maintain ~80% code coverage
- Run `npm test` after changes to verify all tests pass
- Document test additions in project-progress.md with:
  - Number of tests added
  - Coverage improvements
  - File line count changes

## Code Implementation

- When adding features:
  1. Implement the feature
  2. Add comprehensive tests (10+ tests for significant features)
  3. Update skill documentation (.md file)
  4. Update QUICK_REFERENCE.md (command summary only)
  5. Update project-progress.md with metrics
  6. Commit with detailed message

## Environment Variables

- Support dual prefixes when beneficial (e.g., CONFLUENCE_* and ATLASSIAN_*)
- Document both in QUICK_REFERENCE.md and .env.example
- Update tests to handle both prefixes

## Privacy-First Development

- All skills must use PIIFilter for data anonymization
- Never expose raw emails, names, phone numbers, or company names
- Track and report filtering statistics
- Maintain zero PII leakage to LLM

## Documentation Principles

1. **Single Source of Truth:** Detailed examples live in skill docs only
2. **Quick Reference:** QUICK_REFERENCE.md is for lookup, not learning
3. **No Duplication:** Don't repeat detailed examples across multiple docs
4. **Factual Progress:** project-progress.md tracks facts, not opinions
5. **Test Documentation:** Single TESTING.md file, no redundant test docs

## When Making Changes

1. Read relevant files first (don't guess implementation)
2. Update tests alongside code changes
3. Update documentation (skill .md and QUICK_REFERENCE.md)
4. Update project-progress.md with metrics
5. Run tests to verify everything passes
6. Commit with clear, factual message
7. Update project-progress.md with the commit details

## Skill Architecture

Each skill should:
- Use consistent command-line interface patterns
- Support both required and optional parameters
- Output JSON with PII filtering
- Report filtering statistics to stderr
- Handle errors gracefully with helpful messages
- Include comprehensive tests (~40-50 tests per skill)
- Have detailed documentation in .claude/skills/*.md

## Current Project State

- **3 skills implemented:** Productboard (6 commands), Dovetail (6 commands), Confluence (4 commands)
- **159 tests, all passing, ~80% coverage**
- **Core code: ~1,638 lines**
- **Test code: ~2,046 lines**
- **Status:** Production ready with comprehensive testing and documentation
