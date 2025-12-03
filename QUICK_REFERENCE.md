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
# List features
node .claude/skills/productboard.js features 20

# Get specific feature
node .claude/skills/productboard.js feature 12345

# Get notes for a feature
node .claude/skills/productboard.js notes 12345

# List all notes
node .claude/skills/productboard.js all-notes 50

# Search features
node .claude/skills/productboard.js search "checkout"
```

### Dovetail

```bash
# List projects
node .claude/skills/dovetail.js projects

# Get project details
node .claude/skills/dovetail.js project abc123

# Get insights from a project
node .claude/skills/dovetail.js insights abc123 50

# Get highlights
node .claude/skills/dovetail.js highlights abc123

# List tags
node .claude/skills/dovetail.js tags abc123

# Search research
node .claude/skills/dovetail.js search "payment issues"
```

## Natural Language with Claude Code

Simply ask Claude Code:

```
"Fetch Productboard feature 12345 and create a PRD"
"Search Dovetail for research about mobile checkout"
"Get highlights from project abc123 and analyze themes"
"Compare Productboard features with Dovetail insights on payments"
```

## Environment Variables

Required in `.env`:

```env
PRODUCTBOARD_API_TOKEN=your_token
DOVETAIL_API_TOKEN=your_token
```

Optional (PII filtering - defaults to true):

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

Check stderr output for filtering statistics after each command.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API token not found" | Check `.env` file exists with correct tokens |
| "Permission denied" | Run `chmod +x .claude/skills/*.js` |
| "Module not found" | Run `npm install` |
| PII still visible | Check `PII_FILTER_ENABLED=true` in `.env` |
| API errors | Verify tokens are valid and not expired |

## Quick Test

```bash
# Test Productboard
node .claude/skills/productboard.js features 5

# Test Dovetail
node .claude/skills/dovetail.js projects
```

Both should output JSON with PII automatically filtered.

## Documentation

- **README.md** - Setup guide and overview
- **PM_ASSISTANT_GUIDE.md** - Architecture and workflows
- **.claude/skills/productboard.md** - Productboard skill documentation
- **.claude/skills/dovetail.md** - Dovetail skill documentation
