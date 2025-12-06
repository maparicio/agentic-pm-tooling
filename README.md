# Agentic PM Tooling

A privacy-first AI assistant for Product Management work, powered by Claude Code.

## Overview

This project provides intelligent automation for PM tasks while maintaining strict privacy controls. All integrations fetch data locally and filter personally identifiable information (PII) before any data is sent to the LLM.

**Privacy Architecture:**
```
API Request → Local Fetch → PII Filter → Clean Data → LLM → Analysis
```

You maintain full control over what data the AI sees. All sensitive data (emails, names, phones, company names) is anonymized locally before LLM processing.

## Features

- **PRD Generation** - Create product requirement documents from Productboard features
- **User Research Analysis** - Analyze Dovetail research with participant anonymization
- **Feature Management** - Fetch and analyze Productboard features with customer anonymization
- **Cross-Platform Insights** - Synthesize data from multiple sources while preserving privacy

## Current Integrations

- **Productboard** - Feature management and roadmapping
- **Dovetail** - User research and insights
- **Confluence** - Documentation and PRD management

## Setup

### Prerequisites

- Node.js 14+
- API tokens for Productboard and Dovetail

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API tokens
   ```

3. **Get API tokens:**
   - **Productboard**: Settings → Integrations → API → Generate token
   - **Dovetail**: Settings → Integrations → API → Generate token
   - **Confluence**: Atlassian Account → Security → API tokens → Create token

   Add tokens to `.env`:
   ```env
   PRODUCTBOARD_API_TOKEN=pb_xxxxxxxxxxxxxxxxxxxxx
   DOVETAIL_API_TOKEN=dvt_xxxxxxxxxxxxxxxxxxxxx
   CONFLUENCE_API_TOKEN=your_confluence_token
   CONFLUENCE_SITE_URL=https://your-site.atlassian.net
   CONFLUENCE_USER_EMAIL=your@email.com
   ```

4. **Make skills executable:**
   ```bash
   chmod +x .claude/skills/*.js utils/pii-filter.js
   ```

5. **Test setup:**
   ```bash
   node .claude/skills/productboard.js features 5
   node .claude/skills/dovetail.js projects
   node .claude/skills/confluence.js search "Product Requirements"
   ```

## Usage

Simply ask Claude Code to help with PM tasks:

```
"Fetch Productboard feature 12345 and create a PRD in Confluence"
"Analyze Dovetail highlights from project abc123 about checkout flows"
"Compare Productboard requests with Dovetail research on mobile payments"
"Update Confluence page 123456 with the latest feature requirements"
```

Claude will:
1. Fetch data with PII filtering applied
2. Analyze the anonymized information
3. Generate insights while preserving privacy

**Verify PII filtering:** Check stderr output for filtering statistics showing emails, names, phones, and companies anonymized.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API token not found" | Create `.env` file (not just `.env.example`) with correct tokens |
| "Failed to fetch" | Verify tokens are valid and account has proper permissions |
| Skills not working | Ensure files are executable (`chmod +x`) and Node.js is in PATH |
| PII still visible | Check `PII_FILTER_ENABLED=true` in `.env` and review stderr stats |

## Project Structure

```
.claude/
  agents/              # Agent configurations
  skills/              # Integration scripts (productboard.js, dovetail.js, confluence.js)
utils/
  pii-filter.js        # PII filtering utility
.env.example           # Configuration template
README.md              # This file
```

## Security

**Best Practices:**
- Never commit `.env` (already in `.gitignore`)
- Rotate API tokens every 90 days
- Use read-only tokens when possible
- Review PII filtering stats in stderr output
- Run `npm audit` regularly

**Built-in Security:**
- All API tokens stored locally in `.env`
- PII filtering before LLM interaction
- No permanent data storage
- Audit trail of filtered items

## Documentation

- **[PM Assistant Guide](PM_ASSISTANT_GUIDE.md)** - Architecture and workflows
- **[Quick Reference](QUICK_REFERENCE.md)** - Command reference
- **[Productboard Skill](.claude/skills/productboard.md)** - Productboard integration
- **[Dovetail Skill](.claude/skills/dovetail.md)** - Dovetail integration
- **[Confluence Skill](.claude/skills/confluence.md)** - Confluence integration

## Advanced

**Custom PII Filtering:** Edit filter rules in `.claude/skills/productboard.js` or `.claude/skills/dovetail.js`

**Add Integrations:** Create new skill in `.claude/skills/`, use `PIIFilter` from `utils/pii-filter.js`, document privacy features

**API Rate Limits:** Reduce `limit` parameter or add delays between requests if needed

## License

MIT

---

Built with [Claude Code](https://github.com/anthropics/claude-code) • [Productboard API](https://developer.productboard.com/) • [Dovetail API](https://dovetail.com/help/api/)
