# Quick Reference

## Installation

```bash
npm install
cp .env.example .env
# Edit .env with your API tokens
```

## Available Skills

- **Productboard** - Product feature management (6 commands: feature, features, search, get-note, notes, all-notes)
- **Dovetail** - User research analysis (6 commands: projects, project, insights, highlights, tags, search)
- **Confluence** - Documentation management (4 commands: read, create, update, search)
- **Jira** - Issue tracking and project management (5 commands: read, create, update, search, list-children)

## Slash Commands

- `/create-prd` - Create a Product Requirements Document in Confluence with AI assistance. Guides you through gathering product context, selecting a template, and generating a comprehensive PRD with proper Confluence formatting.
- `/update-docs` - Update QUICK_REFERENCE.md and README.md to sync with current skills and features. Analyzes the codebase to find all available commands and skills, then updates documentation to ensure it remains accurate.

## Available Agents

- **productboard-orchestrator** - Specialized agent for Productboard data retrieval and feature exploration. Uses the Productboard skill to fetch features, search features, retrieve notes, and explore product management information. Automatically handles data formatting and PII filtering.
- **quick-reference-sync** - Documentation synchronization specialist. Analyzes the codebase to ensure QUICK_REFERENCE.md and README.md remain accurate with all current skills, commands, and features. Used internally by `/update-docs`.

## Command Summary

### Productboard

```bash
node .claude/skills/productboard.js <command> [options]
```

**Commands:**
- `features [limit] [--owner <alias>]` - List features (default: 100)
- `feature <id>` - Get specific feature
- `notes <feature-id>` - Get notes for a feature
- `get-note <note-id>` - Get specific note
- `all-notes [limit] [--owner <alias>] [--feature <id>]` - List all notes (default: 100)
- `search "<query>"` - Search features by keyword

**Owner Aliases:** Configure `OWNER_EMAIL_<ALIAS>=email@example.com` in `.env`, then use `--owner <alias>`

📖 **Full documentation:** `.claude/skills/productboard.md`

### Dovetail

```bash
node .claude/skills/dovetail.js <command> [options]
```

**Commands:**
- `projects [limit]` - List research projects (default: 20)
- `project <id>` - Get specific project
- `insights <project-id> [limit]` - Get insights (default: 50)
- `highlights <project-id>` - Get highlights
- `tags [project-id]` - List tags (globally or for project)
- `search "<query>"` - Search insights and highlights

📖 **Full documentation:** `.claude/skills/dovetail.md`

### Confluence

```bash
node .claude/skills/confluence.js <command> [options]
```

**Commands:**
- `read <page-id>` - Fetch page by ID
- `create <space-key> "<title>" [parent-id]` - Create page (content via stdin)
- `update <page-id>` - Update page (content via stdin)
- `search "<title>" [--space <key>] [--exact] [--limit <n>]` - Search by title (default limit: 25)

**Search Options:**
- `--space <key>` - Limit to specific space
- `--exact` - Exact match instead of fuzzy
- `--limit <n>` - Max results

**Content via stdin:**
- `create`: Plain storage format (XHTML)
- `update`: Plain text or JSON `{"title":"...","content":"...","versionMessage":"..."}`

📖 **Full documentation:** `.claude/skills/confluence.md`

### Jira

```bash
node .claude/skills/jira.js <command> [options]
```

**Commands:**
- `read <issue-key>` - Fetch issue by key
- `create <project-key> "<summary>" [parent-key]` - Create issue (description via stdin)
- `update <issue-key>` - Update issue (content via stdin)
- `search "<jql>"` - Search issues using JQL
- `list-children <parent-key>` - List child issues of a parent

**Create Options:**
- `--type <type>` - Issue type (default: Task)
- `--priority <priority>` - Priority level (Low, Medium, High)
- `--labels <label1,label2>` - Comma-separated labels

**Description formats:**
- ADF JSON (Atlassian Document Format)
- Markdown (auto-converted to ADF)

**Update via stdin:**
- JSON with fields: `{"summary":"...","description":{...},"priority":"...","labels":[...]}`

📖 **Full documentation:** `.claude/skills/jira.md`

## Natural Language Usage

Ask Claude Code naturally:

```
"Fetch Productboard feature 12345 and create a PRD in Confluence"
"Search Dovetail for research about checkout and summarize themes"
"Find all PRD documents in Confluence that mention authentication"
"Get highlights from Dovetail project abc123 and analyze patterns"
"Read Jira issue AI-688 and list all its child tasks"
"Create a Jira task under epic AI-688 with priority High"
```

## Environment Variables

### Productboard (Required)
```env
PRODUCTBOARD_API_TOKEN=your_token
PRODUCTBOARD_API_URL=https://api.productboard.com  # Optional
```

### Dovetail (Required)
```env
DOVETAIL_API_TOKEN=your_token
DOVETAIL_API_URL=https://dovetail.com/api/v1  # Optional
```

### Confluence (Required - use either prefix)
```env
# Option 1: CONFLUENCE_* prefix (recommended)
CONFLUENCE_API_TOKEN=your_token
CONFLUENCE_BASE_URL=https://yoursite.atlassian.net
CONFLUENCE_USER_EMAIL=your.email@example.com

# Option 2: ATLASSIAN_* prefix (alternative)
ATLASSIAN_API_TOKEN=your_token
ATLASSIAN_SITE_URL=https://yoursite.atlassian.net
ATLASSIAN_USER_EMAIL=your.email@example.com
```

### Jira (Required - uses ATLASSIAN_* prefix)
```env
ATLASSIAN_API_TOKEN=your_token
ATLASSIAN_SITE_URL=https://yoursite.atlassian.net
ATLASSIAN_USER_EMAIL=your.email@example.com
```

**Note:** Jira and Confluence can share the same ATLASSIAN_* credentials.

### PII Filtering (Optional - all default to true)
```env
PII_FILTER_ENABLED=true
PII_ANONYMIZE_EMAILS=true
PII_ANONYMIZE_NAMES=true
PII_ANONYMIZE_PHONE=true
```

## Privacy Features

All skills automatically filter PII before sending data to the LLM:
- Email addresses → `[EMAIL_1]`, `[EMAIL_2]`
- Names → `Participant 1`, `Participant 2`
- Phone numbers → `[PHONE_1]`, `[PHONE_2]`
- Companies → `Company 1`, `Enterprise Client 2`

Check stderr for filtering statistics after each command.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API token not found" | Check `.env` has correct tokens for the skill |
| "Permission denied" | Run `chmod +x .claude/skills/*.js` |
| "Module not found" | Run `npm install` |
| PII still visible | Check `PII_FILTER_ENABLED=true` in `.env` |
| API errors | Verify tokens are valid and not expired |
| Confluence: Authentication failed | Verify `CONFLUENCE_USER_EMAIL` or `ATLASSIAN_USER_EMAIL` is correct |
| Confluence: Space not found | Use space key (e.g., "PROJ" not "Project Name") |
| Confluence: Search no results | Try without `--exact` flag, or verify page exists and is indexed |
| Jira: Issue not found | Verify issue key format (e.g., "AI-123") and permissions |
| Jira: ADF format error | Use markdown input instead, or check ADF JSON structure |
| Jira: Invalid JQL query | Verify JQL syntax, use quotes for field values with spaces |

## Quick Test

```bash
# Test each skill
node .claude/skills/productboard.js features 5
node .claude/skills/dovetail.js projects
node .claude/skills/confluence.js search "PRD" --limit 5
node .claude/skills/jira.js search "project=AI" key,summary
```

All commands output JSON with PII automatically filtered.

## Full Documentation

- **README.md** - Setup guide and overview
- **PM_ASSISTANT_GUIDE.md** - Architecture and workflows
- **TESTING.md** - Test guide and patterns
- **.claude/skills/productboard.md** - Productboard details & examples
- **.claude/skills/dovetail.md** - Dovetail details & examples
- **.claude/skills/confluence.md** - Confluence details & examples
- **.claude/skills/jira.md** - Jira details & examples
