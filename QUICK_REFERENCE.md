# Quick Reference

## Installation

```bash
npm install
cp .env.example .env
# Edit .env with your API tokens
```

## Skill Commands

### Productboard

```bash
# List features (default limit: 100)
node .claude/skills/productboard.js features 20

# Get specific feature
node .claude/skills/productboard.js feature 12345

# Get notes for a specific feature
node .claude/skills/productboard.js notes 12345

# Get specific note by ID
node .claude/skills/productboard.js get-note abc-123-def-456

# List all notes from workspace (default limit: 100)
node .claude/skills/productboard.js all-notes 50

# List all notes filtered by owner alias
node .claude/skills/productboard.js all-notes 50 --owner alice

# List all notes filtered by feature ID
node .claude/skills/productboard.js all-notes 50 --feature feature-123

# Search features by keyword
node .claude/skills/productboard.js search "checkout"
```

**Owner Email Aliases:** Configure in `.env` to filter by owner without exposing emails:
```env
OWNER_EMAIL_ALICE=alice@example.com
OWNER_EMAIL_BOB=bob@example.com
```
Then use: `--owner alice`

### Dovetail

```bash
# List research projects (default limit: 20)
node .claude/skills/dovetail.js projects

# Get specific project details
node .claude/skills/dovetail.js project abc123

# Get insights from a project (default limit: 50)
node .claude/skills/dovetail.js insights abc123 100

# Get highlights from a project
node .claude/skills/dovetail.js highlights abc123

# List all tags globally
node .claude/skills/dovetail.js tags

# List tags for a specific project
node .claude/skills/dovetail.js tags abc123

# Search across insights and highlights
node .claude/skills/dovetail.js search "payment issues"
```

### Confluence

```bash
# Read a specific page by ID
node .claude/skills/confluence.js read 123456

# Create a new page (content via stdin)
echo '<p>Page content here</p>' | node .claude/skills/confluence.js create "PROJ" "Page Title"

# Create a page as a child of another page
echo '<p>Content</p>' | node .claude/skills/confluence.js create "PROJ" "Subpage Title" 123456

# Update an existing page (content via stdin as plain text or JSON)
echo '<p>Updated content</p>' | node .claude/skills/confluence.js update 123456

# Update with title change
echo '{"title":"New Title","content":"<p>Updated</p>"}' | node .claude/skills/confluence.js update 123456
```

**Content Format:**
- For `create`: Plain text via stdin (Confluence storage format/XHTML)
- For `update`: JSON via stdin with optional fields: `title`, `content`, `versionMessage`

## Natural Language with Claude Code

Simply ask Claude Code:

```
"Fetch Productboard feature 12345 and create a PRD"
"Search Dovetail for research about mobile checkout"
"Get highlights from project abc123 and analyze themes"
"Compare Productboard features with Dovetail insights on payments"
"Create a page in Confluence with the PRD from Productboard"
```

## Environment Variables

### Productboard (Required)

```env
PRODUCTBOARD_API_TOKEN=your_token
PRODUCTBOARD_API_URL=https://api.productboard.com  # Optional, defaults to shown value
```

### Dovetail (Required)

```env
DOVETAIL_API_TOKEN=your_token
DOVETAIL_API_URL=https://dovetail.com/api/v1  # Optional, defaults to shown value
```

### Confluence (Required)

```env

ATLASSIAN_API_TOKEN=your_token  # or ATLASSIAN_API_TOKEN
ATLASSIAN_BASE_URL=https://yoursite.atlassian.net  # or ATLASSIAN_SITE_URL
ATLASSIAN_USER_EMAIL=your.email@example.com  # or ATLASSIAN_USER_EMAIL
```

### PII Filtering (Optional, all default to true)

```env
PII_FILTER_ENABLED=true
PII_ANONYMIZE_EMAILS=true
PII_ANONYMIZE_NAMES=true
PII_ANONYMIZE_PHONE=true
```

### Productboard Owner Aliases (Optional)

```env
OWNER_EMAIL_ALICE=alice@example.com
OWNER_EMAIL_BOB=bob@example.com
```

## Privacy Features

All skills automatically filter PII before sending data to the LLM:
- Email addresses → `[EMAIL_1]`, `[EMAIL_2]`
- Names → `Participant 1`, `Participant 2`
- Phone numbers → `[PHONE_1]`, `[PHONE_2]`
- Companies → `Company 1`, `Enterprise Client 2`

Check stderr output for filtering statistics after each command.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API token not found" | Check `.env` file exists with correct tokens for the skill you're using |
| "Permission denied" | Run `chmod +x .claude/skills/*.js` |
| "Module not found" | Run `npm install` |
| PII still visible | Check `PII_FILTER_ENABLED=true` in `.env` |
| API errors | Verify tokens are valid and not expired |
| Confluence: Authentication failed | Verify `CONFLUENCE_USER_EMAIL` or `ATLASSIAN_USER_EMAIL` is correct |
| Confluence: Space not found | Use the correct space key (e.g., "PROJ" not "Project Name") |

## Quick Test

```bash
# Test Productboard
node .claude/skills/productboard.js features 5

# Test Dovetail
node .claude/skills/dovetail.js projects

# Test Confluence (requires page ID to exist)
node .claude/skills/confluence.js read 123456
```

All commands output JSON with PII automatically filtered.

## Documentation

- **README.md** - Setup guide and overview
- **PM_ASSISTANT_GUIDE.md** - Architecture and workflows
- **TESTING.md** - Test guide and patterns
- **.claude/skills/productboard.md** - Productboard skill documentation
- **.claude/skills/dovetail.md** - Dovetail skill documentation
- **.claude/skills/confluence.md** - Confluence skill documentation
