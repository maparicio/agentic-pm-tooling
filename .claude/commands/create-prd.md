---
description: Create a Product Requirements Document (PRD) in Confluence with AI assistance
---

Create a new Product Requirements Document (PRD) in Confluence. This command will guide you through gathering requirements and generating a comprehensive PRD.

**Step 1: Gather Required Information**

Use the AskUserQuestion tool to collect the following information:

1. **Product/Initiative Context**: Ask the user to provide high-level context about the product or initiative. What problem are we solving? What are the key goals?

2. **Confluence Location** (REQUIRED): Ask the user to provide the Confluence URL where the PRD should be created. This should be a URL to either:
   - A parent page (the PRD will be created as a child page)
   - A space (the PRD will be created at the top level)

   Example: `https://your-domain.atlassian.net/wiki/spaces/PROJ/pages/123456/Product+Docs`

3. **Template Choice** (REQUIRED): Ask the user to choose ONE of the following options:
   - **Option A**: Provide a URL to a template document that will be used as the structure
   - **Option B**: Provide a URL to an existing PRD that will be used as an example (I will remove the content but keep the section structure)

**Step 2: Parse Confluence URL**

Extract the following from the provided URL:
- Space key (e.g., "PROJ", "AIP")
- Parent page ID (if applicable)
- Base URL

**Step 3: Fetch and Process Template**

Based on the user's template choice:
- If Option A (template URL): Fetch the template and use it as-is
- If Option B (example PRD URL):
  - Read the existing PRD from Confluence using the confluence skill
  - Extract the section structure
  - Remove all content, keeping only headings and structure

**Step 4: Generate PRD Content**

Create a comprehensive PRD that includes:
- **AI-Generated Disclaimer** (MUST be at the very top)
- All sections from the template/example structure
- Content based on the user's product/initiative context
- Standard PRD elements: Overview, Problem Statement, Goals, User Stories, Requirements, Success Metrics, Timeline, Dependencies, Open Questions, Out of Scope

**Step 5: Create in Confluence**

Use the Confluence skill to create the new PRD page:
```bash
node .claude/skills/confluence.js create <space-key> "<PRD-title>" [parent-id]
```

Provide the generated content via stdin in Confluence storage format (XHTML).

**Important Requirements:**
- ALL generated PRDs MUST include an AI-generated disclaimer at the top (e.g., "⚠️ This document was generated with AI assistance. Please review and validate all content.")
- The Confluence location is REQUIRED - do not proceed without it
- The user MUST choose a template option - do not proceed without this choice
- Convert markdown content to Confluence storage format (XHTML) before creating the page
- Return the URL to the newly created PRD page when complete

Ask clarifying questions as needed to create a high-quality, comprehensive PRD that serves as the single source of truth for the feature/product development.
