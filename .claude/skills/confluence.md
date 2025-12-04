---
skill: confluence
description: Manage Confluence pages - read, create, and update pages for PRD management
executable: node .claude/skills/confluence.js
---

# Confluence Skill

This skill provides operations to manage Confluence pages, enabling you to read existing pages, create new pages, and update page content. Designed for creating and managing PRD (Product Requirements Document) drafts.

## Commands

### Read a page by ID
```bash
node .claude/skills/confluence.js read <page-id>
```

Example:
```bash
node .claude/skills/confluence.js read 123456
```

### Create a new page
```bash
node .claude/skills/confluence.js create <space-key> "<title>" [parent-id]
```

Examples:
```bash
node .claude/skills/confluence.js create "PROJ" "My New PRD"
node .claude/skills/confluence.js create "PROJ" "Feature Spec" 123456
```

Note: Page content should be provided via stdin in Confluence storage format (XHTML).

### Update an existing page
```bash
node .claude/skills/confluence.js update <page-id>
```

Example:
```bash
node .claude/skills/confluence.js update 123456
```

Note:
- The skill automatically fetches the current version and increments it
- Updated content should be provided via stdin in Confluence storage format (XHTML)
- Title and other metadata can be updated by providing them in the stdin JSON

### Search for pages by title
```bash
node .claude/skills/confluence.js search "<title>" [--space <space-key>] [--exact] [--limit <n>]
```

Examples:
```bash
# Fuzzy search across all spaces
node .claude/skills/confluence.js search "Evaluation Toolchain"

# Search in specific space
node .claude/skills/confluence.js search "PRD" --space AIP

# Exact title match
node .claude/skills/confluence.js search "Evaluation Toolchain" --exact

# Limit results
node .claude/skills/confluence.js search "PRD" --limit 10
```

Note:
- Uses CQL (Confluence Query Language) via REST API v1
- Default: fuzzy matching (contains) with 25 result limit
- Use `--exact` for exact title matches
- Use `--space` to limit search to a specific space

## Usage in Claude Code

You can invoke this skill naturally in conversation:

> "Read Confluence page 123456 and summarize it"

> "Create a new PRD in Confluence space PROJ called 'User Authentication Feature' under the folder with id 78902"

> "Update Confluence page 123456 with the revised content"

> "Search for pages with 'Evaluation' in the title in the AIP space"

> "Find the page ID for 'Evaluation Toolchain' in Confluence"

> "Get the content from Confluence page 123456 and cross-reference with Productboard feature 789"

## Output Format

The skill outputs JSON data containing:

**For read operations:**
- `id` - Page ID
- `title` - Page title
- `spaceId` - Space identifier
- `body` - Page content in storage format
- `version` - Current version information
- `_links` - Navigation links

**For create/update operations:**
- Similar structure to read operations
- Includes the newly created/updated page details

**For search operations:**
- `results` - Array of matching pages
- Each result includes: `id`, `title`, `type`, `_links`
- `size` - Number of results returned
- `totalSize` - Total number of matching pages

## Integration with Other Tools

This skill is designed to work seamlessly with Productboard and Dovetail:

- Fetch insights from Productboard and create PRD drafts in Confluence
- Pull user research from Dovetail and update Confluence documentation
- Cross-reference PRD content with product features and user feedback

## Setup

1. Copy `.env.example` to `.env`
2. Add your Confluence credentials:
   ```
   ATLASSIAN_API_TOKEN=your_token_here
   ATLASSIAN_BASE_URL=https://your-domain.atlassian.net
   ATLASSIAN_USER_EMAIL=your-email@example.com
   ```
3. Test the skill:
   ```bash
   node .claude/skills/confluence.js read <existing-page-id>
   ```

## API Details

- Uses Confluence REST API v2 for page operations (read, create, update)
- Uses Confluence REST API v1 for search (CQL queries)
- Supports Confluence Cloud instances
- Authentication via API tokens (Basic Auth)
- Content format: Storage (Confluence's native XHTML format)

## Important Notes

- **Version Management**: Updates automatically increment the version number by fetching current version first.
- **Permissions**: Ensure the API token has read/write permissions for the target space.
- **Content Format**: Page bodies use Confluence storage format (XHTML).
- **Parent Pages**: When creating pages, you can optionally specify a parent page ID to create a hierarchical structure.
