# Jira Skill

Manages Jira issues - read, create, update, and search operations using Jira REST API v3.

## Overview

The Jira skill provides a command-line interface for interacting with Jira issues. It supports:
- Reading individual issues
- Creating new issues with ADF (Atlassian Document Format) descriptions
- Updating existing issues
- Searching issues using JQL (Jira Query Language)
- Listing child issues of a parent (e.g., epic children)
- Automatic PII filtering for sensitive data
- Markdown-to-ADF conversion for easy description creation

## Requirements

### Environment Variables

```bash
ATLASSIAN_API_TOKEN=your_api_token_here
ATLASSIAN_SITE_URL=https://yoursite.atlassian.net
ATLASSIAN_USER_EMAIL=your.email@company.com
PII_FILTER_ENABLED=true  # Optional, defaults to true
```

### Dependencies

- Node.js built-in modules: `https`, `http`, `url`
- Project dependencies: `dotenv`, `pii-filter`

## Commands

### Read Issue

Fetch a specific issue by its key.

```bash
node jira.js read <issue-key>
```

**Example:**
```bash
node jira.js read AI-703
```

**Output:**
Returns a JSON object containing the full issue details with PII filtered.

---

### Create Issue

Create a new issue in a project. The description is provided via stdin and can be either:
1. ADF (Atlassian Document Format) JSON
2. Markdown (automatically converted to ADF)

```bash
echo '<description>' | node jira.js create <project-key> <summary> [parent-key] [options]
```

**Options:**
- `--type <type>`: Issue type (default: "Task")
- `--priority <priority>`: Priority level (e.g., "Low", "Medium", "High")
- `--labels <label1,label2>`: Comma-separated labels

**Example 1: Create with ADF JSON**
```bash
echo '{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [{"type": "text", "text": "This is the task description"}]
    }
  ]
}' | node jira.js create AI "Implement new feature" AI-688 --type Task --priority Medium
```

**Example 2: Create with Markdown (auto-converted to ADF)**
```bash
echo '# Overview

This is a new task for implementing authentication.

## Requirements
- Implement login form
- Add JWT authentication
- Create user session management

**Priority:** High' | node jira.js create AI "Add authentication system" AI-688 --type Story --priority High
```

**Output:**
Returns the created issue with its key and ID.

---

### Update Issue

Update an existing issue. Updates are provided via stdin as a JSON object.

```bash
echo '<updates-json>' | node jira.js update <issue-key>
```

**Update Fields:**
- `summary`: New issue summary
- `description`: New description (ADF format)
- `priority`: New priority (e.g., "Low", "Medium", "High")
- `labels`: Array of labels
- `assignee`: Assignee account ID

**Example 1: Update summary only**
```bash
echo '{"summary": "Updated task title"}' | node jira.js update AI-703
```

**Example 2: Update multiple fields**
```bash
echo '{
  "summary": "Implement authentication - Updated",
  "priority": "High",
  "labels": ["security", "backend"]
}' | node jira.js update AI-703
```

**Example 3: Update description with ADF**
```bash
echo '{
  "summary": "Updated Title",
  "description": {
    "type": "doc",
    "version": 1,
    "content": [
      {"type": "paragraph", "content": [{"type": "text", "text": "Updated description"}]}
    ]
  }
}' | node jira.js update AI-703
```

**Output:**
Returns the updated issue details.

---

### Search Issues

Search for issues using JQL (Jira Query Language).

```bash
node jira.js search <jql> [fields]
```

**Parameters:**
- `jql`: JQL query string
- `fields`: Optional comma-separated list of fields to return

**Example 1: Search by project and status**
```bash
node jira.js search "project=AI AND status='Backlog'"
```

**Example 2: Search with specific fields**
```bash
node jira.js search "project=AI AND assignee=currentUser()" "key,summary,status"
```

**Example 3: Complex JQL query**
```bash
node jira.js search "project=AI AND created >= -7d AND priority in (High, Critical)"
```

**Output:**
Returns a JSON object with:
- `issues`: Array of matching issues (PII filtered)
- `total`: Total number of results
- `maxResults`: Maximum results per page

---

### List Children

List all child issues of a parent issue (e.g., all tasks under an epic).

```bash
node jira.js list-children <parent-key>
```

**Example:**
```bash
node jira.js list-children AI-688
```

**Output:**
Returns all child issues with key, summary, description, status, issue type, and priority.

---

## Atlassian Document Format (ADF)

Jira API v3 requires descriptions to be in ADF, a JSON-based format. The skill includes helper functions to build ADF and convert markdown to ADF.

### ADF Structure

**Simple paragraph:**
```json
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {"type": "text", "text": "This is plain text"}
      ]
    }
  ]
}
```

**Bold text:**
```json
{
  "type": "paragraph",
  "content": [
    {
      "type": "text",
      "text": "Bold text",
      "marks": [{"type": "strong"}]
    }
  ]
}
```

**Heading:**
```json
{
  "type": "heading",
  "attrs": {"level": 3},
  "content": [
    {"type": "text", "text": "Heading Text", "marks": [{"type": "strong"}]}
  ]
}
```

**Bullet list:**
```json
{
  "type": "bulletList",
  "content": [
    {
      "type": "listItem",
      "content": [
        {
          "type": "paragraph",
          "content": [{"type": "text", "text": "Item 1"}]
        }
      ]
    },
    {
      "type": "listItem",
      "content": [
        {
          "type": "paragraph",
          "content": [{"type": "text", "text": "Item 2"}]
        }
      ]
    }
  ]
}
```

### Markdown to ADF Conversion

The skill includes a basic markdown-to-ADF converter that supports:

- **Headings:** `# Heading`, `## Heading`, etc. (levels 1-6)
- **Bold text:** `**bold**` (marks entire paragraph as bold if present)
- **Bullet lists:** `* item` or `- item`
- **Ordered lists:** `1. item`, `2. item`, etc.
- **Paragraphs:** Regular text lines

**Example:**
```markdown
# Overview

This is a description with **bold** text.

## Requirements
- Requirement 1
- Requirement 2

## Implementation Steps
1. Step 1
2. Step 2
```

This markdown will be automatically converted to proper ADF when used with the `create` command.

---

## PII Filtering

The Jira skill automatically filters Personal Identifiable Information (PII) from API responses:

### Filtered Fields
- **User information:**
  - Reporter, assignee, creator display names → anonymized (e.g., "Participant 1", "Participant 2")
  - Email addresses → `[REDACTED_EMAIL]`
  - Account IDs → `[REDACTED_USER_ID]`

### Preserved Fields
- Issue metadata (key, id, summary, description, status, priority)
- Project information
- Timestamps (created, updated)
- Labels, components, versions
- Parent/child relationships

### Filtering Statistics

After each command, filtering statistics are output to stderr:

```json
{
  "totalFilters": 15,
  "emailsRedacted": 3,
  "namesAnonymized": 5,
  "enabled": true
}
```

---

## Error Handling

The skill provides clear error messages for common issues:

### HTTP 404: Issue Not Found
```
Error: Failed to read issue AI-9999: API Error: 404 - Issue does not exist or you do not have permission to see it.
```

### HTTP 400: Invalid Request
```
Error: Failed to create issue: API Error: 400 - description: ADF node is required for description field
```

### HTTP 401: Authentication Failed
```
Error: Failed to read issue AI-703: API Error: 401 - Authentication failed
```

### HTTP 403: Permission Denied
```
Error: Failed to update issue AI-703: API Error: 403 - You do not have permission to edit this issue
```

### Missing Environment Variables
```
Error: ATLASSIAN_API_TOKEN not found in environment
```

---

## Advanced Usage

### Using as a Module

The skill can also be imported as a Node.js module:

```javascript
const { JiraClient, markdownToADF } = require('./jira.js');

const client = new JiraClient();

// Read an issue
const issue = await client.readIssue('AI-703');

// Create an issue with markdown
const description = markdownToADF('# Description\n\nThis is a test issue.');
const newIssue = await client.createIssue('AI', 'Test Issue', description, {
  parentKey: 'AI-688',
  issueType: 'Task',
  priority: 'Low'
});

// Search issues
const results = await client.searchIssues('project=AI AND status=Open');

// List children
const children = await client.listChildren('AI-688');
```

### Exported Functions

- `JiraClient`: Main client class
- `markdownToADF(markdown)`: Convert markdown string to ADF
- `wrapInADF(content)`: Wrap content array in ADF document structure
- `buildParagraph(text, marks)`: Create ADF paragraph
- `buildHeading(text, level)`: Create ADF heading
- `buildBulletList(items)`: Create ADF bullet list
- `buildOrderedList(items)`: Create ADF ordered list

---

## Common JQL Queries

Here are some useful JQL queries for the `search` command:

```bash
# All open issues in project AI
node jira.js search "project=AI AND status in (Open, 'In Progress')"

# Issues assigned to current user
node jira.js search "assignee=currentUser() AND status!=Done"

# High priority issues created in the last week
node jira.js search "priority=High AND created >= -7d"

# Issues with specific label
node jira.js search "labels=backend AND project=AI"

# Issues updated today
node jira.js search "updated >= startOfDay()"

# Epics with incomplete children
node jira.js search "issuetype=Epic AND issueFunction in subtasksOf('status!=Done')"

# Child tasks of a specific epic
node jira.js search "parent=AI-688"
```

---

## Best Practices

1. **Use markdown for descriptions:** The markdown-to-ADF converter makes it easier to create readable descriptions without manually crafting ADF JSON.

2. **Leverage JQL for complex searches:** JQL is powerful - use it to find exactly what you need instead of filtering results manually.

3. **Use list-children for epic management:** When working with epics, use `list-children` to quickly see all child issues.

4. **Check filtering stats:** Always review the PII filtering stats to ensure sensitive data is being properly anonymized.

5. **Test with read first:** Before creating or updating issues, test the connection with a simple `read` command.

6. **Use labels for organization:** When creating issues, add relevant labels to make them easier to find later.

7. **Store ADF templates:** For complex descriptions you use frequently, save the ADF JSON to a file and use it with stdin.

---

## Troubleshooting

### "ATLASSIAN_API_TOKEN not found"
- Ensure your `.env` file contains all required environment variables
- Run `source .env` if using bash to load environment variables
- Check that the `.env` file is in the project root

### "API Error: 401 - Authentication failed"
- Verify your API token is correct
- Check that your email matches the account that generated the token
- Ensure the token hasn't expired

### "API Error: 404 - Issue does not exist"
- Verify the issue key is correct
- Check that you have permission to view the issue
- Ensure the issue hasn't been deleted

### "ADF node is required for description field"
- Make sure your description is in proper ADF format
- Use the markdown converter if you're not familiar with ADF
- Check that the description has the required `type: "doc"` and `version: 1` fields

### PII not being filtered
- Check that `PII_FILTER_ENABLED` is set to `true` in your `.env`
- Review the filtering stats in stderr after each command
- Verify the `pii-filter` module is installed and working

---

## Related Skills

- **confluence.js**: Manage Confluence pages (similar API pattern)
- **productboard.js**: Integrate with ProductBoard for product management

---

## References

- [Jira REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Atlassian Document Format (ADF) Specification](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
- [JQL (Jira Query Language) Reference](https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-searching-in-jira-cloud/)
