---
skill: productboard
description: Fetch product features and insights from Productboard with PII filtering
executable: node .claude/skills/productboard.js
---

# Productboard Skill

This skill fetches product data from Productboard and automatically filters out personally identifiable information (PII) before presenting it to the LLM.

## Privacy Features

- Customer names anonymized as "Company 1", "Enterprise Client 2", etc.
- Email addresses completely redacted
- Phone numbers removed from all text
- URLs with personal identifiers sanitized
- Use aliases to filter by owner without exposing email addresses to the LLM

## Commands

### Fetch a specific feature
```bash
node .claude/skills/productboard.js feature <feature-id>
```

Example:
```bash
node .claude/skills/productboard.js feature 12345
```

### List features
```bash
node .claude/skills/productboard.js features [limit] [--owner <alias>]
```

Examples:
```bash
node .claude/skills/productboard.js features
node .claude/skills/productboard.js features 10
node .claude/skills/productboard.js features 20 --owner bob
```

### Search features
```bash
node .claude/skills/productboard.js search "<query>"
```

Example:
```bash
node .claude/skills/productboard.js search "checkout flow"
```

### Fetch a specific note
```bash
node .claude/skills/productboard.js get-note <note-id>
```

Example:
```bash
node .claude/skills/productboard.js get-note abc-123-def-456
```

### List all notes from workspace
```bash
node .claude/skills/productboard.js all-notes [limit] [--owner <alias>]
```

Examples:
```bash
node .claude/skills/productboard.js all-notes
node .claude/skills/productboard.js all-notes 50
node .claude/skills/productboard.js all-notes 25 --owner alice
```

**Important:** Notes are ordered by creation date (descending). The `pageCursor` for pagination expires in 1 minute.

### Fetch notes for a specific feature
```bash
node .claude/skills/productboard.js notes <feature-id>
```

Example:
```bash
node .claude/skills/productboard.js notes 12345
```

## Usage in Claude Code

You can invoke this skill naturally in conversation:

> "Can you fetch the Productboard feature 12345 and analyze it?"

> "Search Productboard for features related to payment processing"

> "Get Productboard note abc-123-def-456 and summarize it"

> "List the latest 20 notes from Productboard"

> "Get all notes from Productboard owned by alice"

> "Show me features owned by bob"

> "Get all notes from Productboard and identify common themes"

> "Get insights from Productboard feature 67890 and help me write a PRD"

**Note:** When filtering by owner, you'll reference them by their alias (e.g., "alice", "bob") which must be configured in your `.env` file. Claude never sees the actual email addresses.

## Output Format

The skill outputs JSON data with PII already filtered. Each item includes URLs for navigation:

**Features:**
- `links.html` - Direct link to view the feature in Productboard
- `links.self` - API endpoint URL

**Notes:**
- `displayUrl` - Direct link to view the note in Productboard
- `externalDisplayUrl` - Link to the original source (Intercom, Slack, etc.) or null

Statistics about what was filtered are shown in stderr, including counts of:
- Emails redacted
- Names anonymized
- Phone numbers removed
- Companies anonymized

## CRITICAL: Data Accuracy Guidelines

**When analyzing Productboard data, you MUST:**

1. **Only report on actual data returned** - Never fabricate or invent notes, features, or insights that are not in the API response
2. **Use exact URLs from the response** - Copy URLs directly from `displayUrl`, `externalDisplayUrl`, or `links.html` fields without modification
3. **Be truthful when data doesn't match filters** - If asked to find notes about a specific theme (e.g., "Reports and Dashboards") but none exist in the results, clearly state that no matching notes were found
4. **Suggest alternatives when no matches found** - Offer to fetch more data or search with different keywords if the initial results don't contain the requested information

**Example of correct behavior:**
- User: "Show me notes about dashboards"
- Response: "I fetched 25 notes but none are specifically about dashboards. Would you like me to fetch more notes (50-100) or search for keywords like 'dashboard', 'report', or 'analytics'?"

**Never do this:**
- Making up note titles, URLs, or content that don't exist in the response
- Modifying or "fixing" URLs from the API response
- Claiming notes exist when they don't appear in the actual data

## Owner Filtering (Privacy-Preserving)

Filter notes and features by owner email without exposing email addresses to Claude.

### Setup Owner Aliases

Add owner email aliases to your `.env` file:

```bash
# Owner Email Aliases
OWNER_EMAIL_ALICE=alice@example.com
OWNER_EMAIL_BOB=bob@example.com
OWNER_EMAIL_JOHN=john.doe@company.com
```

### Usage

Use the `--owner` flag with the alias (not the email):

```bash
# Filter notes by owner
node .claude/skills/productboard.js all-notes 25 --owner alice

# Filter features by owner
node .claude/skills/productboard.js features 20 --owner bob
```

**How it works:**
1. You add email aliases to your `.env` file (e.g., `OWNER_EMAIL_ALICE=alice@example.com`)
2. When you use `--owner alice`, the script resolves it to the actual email
3. The API request includes the email filter
4. Claude only sees the alias "alice", never the actual email address

**Benefits:**
- Keep email addresses private from the LLM
- Easily share commands without exposing emails
- Maintain team member privacy while enabling filtering

## Setup

1. Copy `.env.example` to `.env`
2. Add your Productboard API token:
   ```
   PRODUCTBOARD_API_TOKEN=your_token_here
   ```
3. (Optional) Add owner email aliases for filtering:
   ```
   OWNER_EMAIL_ALICE=alice@example.com
   ```
4. Test the skill:
   ```bash
   node .claude/skills/productboard.js features 5
   ```
