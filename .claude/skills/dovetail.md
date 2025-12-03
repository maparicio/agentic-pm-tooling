---
skill: dovetail
description: Fetch user research data from Dovetail with PII filtering
executable: node .claude/skills/dovetail.js
---

# Dovetail Skill

This skill fetches user research data from Dovetail and automatically filters out personally identifiable information (PII) before presenting it to the LLM. This is especially critical for research data which often contains sensitive participant information.

## Privacy Features

- Participant names anonymized as "Participant 1", "Participant 2", etc.
- Interviewer names anonymized
- Email addresses completely redacted
- Phone numbers removed from transcripts and quotes
- Personal identifiers stripped from all text content

## Commands

### List research projects
```bash
node .claude/skills/dovetail.js projects [limit]
```

Example:
```bash
node .claude/skills/dovetail.js projects 10
```

### Fetch a specific project
```bash
node .claude/skills/dovetail.js project <project-id>
```

Example:
```bash
node .claude/skills/dovetail.js project abc123
```

### Fetch insights from a project
```bash
node .claude/skills/dovetail.js insights <project-id> [limit]
```

Example:
```bash
node .claude/skills/dovetail.js insights abc123 50
```

### Fetch highlights from a project
```bash
node .claude/skills/dovetail.js highlights <project-id>
```

Example:
```bash
node .claude/skills/dovetail.js highlights abc123
```

### List tags
```bash
node .claude/skills/dovetail.js tags [project-id]
```

Examples:
```bash
node .claude/skills/dovetail.js tags
node .claude/skills/dovetail.js tags abc123
```

### Search research data
```bash
node .claude/skills/dovetail.js search "<query>"
```

Example:
```bash
node .claude/skills/dovetail.js search "payment issues"
```

## Usage in Claude Code

You can invoke this skill naturally in conversation:

> "Fetch highlights from Dovetail project abc123 about payment flows"

> "Search Dovetail for recent research on mobile app usability"

> "Get insights from project abc123 and summarize the key themes"

> "Analyze the Dovetail highlights and identify pain points"

## Output Format

The skill outputs JSON data with PII already filtered. Statistics about what was filtered are shown in stderr, including counts of:
- Participant names anonymized
- Emails redacted
- Phone numbers removed
- Text passages filtered

## Setup

1. Copy `.env.example` to `.env`
2. Add your Dovetail API token:
   ```
   DOVETAIL_API_TOKEN=your_token_here
   ```
3. Test the skill:
   ```bash
   node .claude/skills/dovetail.js projects
   ```

## Important Notes

Research transcripts and highlights are the most sensitive data types. The skill applies aggressive PII filtering to ensure:
- No participant can be identified
- No personal details leak through
- Direct quotes remain useful but anonymous

Always review the PII filtering statistics to ensure proper anonymization.
