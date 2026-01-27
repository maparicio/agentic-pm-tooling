#!/usr/bin/env node

/**
 * Jira Skill
 * Manages Jira issues - read, create, update, and search operations
 *
 * Usage:
 *   node jira.js <command> [options]
 *
 * Commands:
 *   read <issue-key>                     - Fetch a specific issue by key
 *   create <project-key> <summary> [parent-key] - Create a new issue (description via stdin)
 *   update <issue-key>                   - Update an existing issue (content via stdin)
 *   search <jql>                         - Search issues using JQL
 *   list-children <parent-key>           - List all child issues of a parent
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();
const PIIFilter = require('../../utils/pii-filter');

class JiraClient {
  constructor() {
    this.apiToken = process.env.ATLASSIAN_API_TOKEN;
    this.baseUrl = process.env.ATLASSIAN_SITE_URL;
    this.userEmail = process.env.ATLASSIAN_USER_EMAIL;
    this.filter = new PIIFilter();

    // Validate environment variables
    if (!this.apiToken) {
      throw new Error('ATLASSIAN_API_TOKEN not found in environment');
    }
    if (!this.baseUrl) {
      throw new Error('ATLASSIAN_SITE_URL not found in environment');
    }
    if (!this.userEmail) {
      throw new Error('ATLASSIAN_USER_EMAIL not found in environment');
    }

    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  /**
   * Make API request to Jira (v3 API)
   */
  async makeRequest(endpoint, options = {}) {
    const fullUrl = `${this.baseUrl}/rest/api/3${endpoint}`;
    const url = new URL(fullUrl);

    // Add query parameters
    if (options.params) {
      Object.keys(options.params).forEach(key => {
        url.searchParams.append(key, options.params[key]);
      });
    }

    const parsedUrl = url;
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    // Create Basic Auth token
    const authString = Buffer.from(`${this.userEmail}:${this.apiToken}`).toString('base64');

    return new Promise((resolve, reject) => {
      const requestOptions = {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      const req = protocol.request(parsedUrl, requestOptions, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch (e) {
              resolve(data);
            }
          } else {
            let errorMessage = `API Error: ${res.statusCode}`;
            try {
              const errorData = JSON.parse(data);
              if (errorData.errorMessages && errorData.errorMessages.length > 0) {
                errorMessage += ` - ${errorData.errorMessages.join(', ')}`;
              } else if (errorData.errors) {
                const errors = Object.entries(errorData.errors).map(([k, v]) => `${k}: ${v}`).join(', ');
                errorMessage += ` - ${errors}`;
              }
            } catch (e) {
              errorMessage += ` - ${data}`;
            }
            reject(new Error(errorMessage));
          }
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  /**
   * Read an issue by key
   */
  async readIssue(issueKey) {
    try {
      const issue = await this.makeRequest(`/issue/${issueKey}`);
      return this.filterIssueData(issue);
    } catch (error) {
      throw new Error(`Failed to read issue ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Create a new issue
   * @param {string} projectKey - Project key (e.g., "AI")
   * @param {string} summary - Issue summary
   * @param {object} description - Description in ADF format
   * @param {object} options - Additional options (parentKey, issueType, priority, labels, etc.)
   */
  async createIssue(projectKey, summary, description, options = {}) {
    try {
      const requestBody = {
        fields: {
          project: { key: projectKey },
          summary: summary,
          issuetype: { name: options.issueType || 'Task' },
          description: description
        }
      };

      // Add optional fields
      if (options.parentKey) {
        requestBody.fields.parent = { key: options.parentKey };
      }

      if (options.priority) {
        requestBody.fields.priority = { name: options.priority };
      }

      if (options.labels && options.labels.length > 0) {
        requestBody.fields.labels = options.labels;
      }

      if (options.assignee) {
        requestBody.fields.assignee = { accountId: options.assignee };
      }

      const issue = await this.makeRequest('/issue', {
        method: 'POST',
        body: requestBody
      });

      return issue;
    } catch (error) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  /**
   * Update an existing issue
   * @param {string} issueKey - Issue key
   * @param {object} updates - Updates object with optional summary, description, or other fields
   */
  async updateIssue(issueKey, updates) {
    try {
      const requestBody = {
        fields: {}
      };

      if (updates.summary) {
        requestBody.fields.summary = updates.summary;
      }

      if (updates.description) {
        requestBody.fields.description = updates.description;
      }

      if (updates.priority) {
        requestBody.fields.priority = { name: updates.priority };
      }

      if (updates.labels) {
        requestBody.fields.labels = updates.labels;
      }

      if (updates.assignee) {
        requestBody.fields.assignee = { accountId: updates.assignee };
      }

      await this.makeRequest(`/issue/${issueKey}`, {
        method: 'PUT',
        body: requestBody
      });

      // Return the updated issue
      return await this.readIssue(issueKey);
    } catch (error) {
      throw new Error(`Failed to update issue ${issueKey}: ${error.message}`);
    }
  }

  /**
   * Search issues using JQL
   * @param {string} jql - JQL query string
   * @param {array} fields - Optional array of fields to return
   * @param {number} maxResults - Maximum number of results (default: 50)
   */
  async searchIssues(jql, fields = [], maxResults = 50) {
    try {
      const requestBody = {
        jql: jql,
        maxResults: maxResults
      };

      if (fields && fields.length > 0) {
        requestBody.fields = fields;
      }

      const response = await this.makeRequest('/search/jql', {
        method: 'POST',
        body: requestBody
      });

      // Filter issues for PII
      if (response.issues) {
        response.issues = response.issues.map(issue => this.filterIssueData(issue));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to search issues: ${error.message}`);
    }
  }

  /**
   * List all child issues of a parent
   * @param {string} parentKey - Parent issue key
   */
  async listChildren(parentKey) {
    try {
      return await this.searchIssues(
        `parent=${parentKey}`,
        ['key', 'summary', 'description', 'status', 'issuetype', 'priority']
      );
    } catch (error) {
      throw new Error(`Failed to list children of ${parentKey}: ${error.message}`);
    }
  }

  /**
   * Filter PII from issue data
   */
  filterIssueData(issue) {
    if (!issue) return issue;

    const filtered = {
      id: issue.id,
      key: issue.key,
      self: issue.self
    };

    // Handle fields
    if (issue.fields) {
      const fields = issue.fields;
      filtered.fields = {};

      // Keep safe fields as-is (without filtering)
      const safeFields = [
        'summary', 'description', 'status', 'priority', 'issuetype',
        'project', 'parent', 'labels', 'created', 'updated',
        'timetracking', 'duedate', 'components', 'versions'
      ];

      for (const field of safeFields) {
        if (fields[field] !== undefined) {
          filtered.fields[field] = fields[field];
        }
      }

      // Anonymize user fields
      if (fields.reporter) {
        filtered.fields.reporter = {
          accountId: '[REDACTED_USER_ID]',
          displayName: this.filter.anonymizeName(fields.reporter.displayName || 'User'),
          emailAddress: '[REDACTED_EMAIL]'
        };
      }

      if (fields.assignee) {
        filtered.fields.assignee = {
          accountId: '[REDACTED_USER_ID]',
          displayName: this.filter.anonymizeName(fields.assignee.displayName || 'User'),
          emailAddress: '[REDACTED_EMAIL]'
        };
      }

      if (fields.creator) {
        filtered.fields.creator = {
          accountId: '[REDACTED_USER_ID]',
          displayName: this.filter.anonymizeName(fields.creator.displayName || 'User'),
          emailAddress: '[REDACTED_EMAIL]'
        };
      }
    }

    // Keep other top-level fields
    if (issue.transitions) {
      filtered.transitions = issue.transitions;
    }

    if (issue.changelog) {
      filtered.changelog = issue.changelog;
    }

    return filtered;
  }

  /**
   * Get filtering statistics
   */
  getFilterStats() {
    return this.filter.getStats();
  }
}

// ============================================================================
// ADF Helper Functions
// ============================================================================

/**
 * Create a simple paragraph in ADF format
 */
function buildParagraph(text, marks = []) {
  return {
    type: "paragraph",
    content: [{ type: "text", text, marks }]
  };
}

/**
 * Create a heading in ADF format
 */
function buildHeading(text, level = 3) {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text, marks: [{ type: "strong" }] }]
  };
}

/**
 * Create a bullet list in ADF format
 */
function buildBulletList(items) {
  return {
    type: "bulletList",
    content: items.map(item => ({
      type: "listItem",
      content: [buildParagraph(item)]
    }))
  };
}

/**
 * Create an ordered list in ADF format
 */
function buildOrderedList(items) {
  return {
    type: "orderedList",
    content: items.map(item => ({
      type: "listItem",
      content: [buildParagraph(item)]
    }))
  };
}

/**
 * Wrap content in ADF document format
 */
function wrapInADF(content) {
  return {
    type: "doc",
    version: 1,
    content: Array.isArray(content) ? content : [content]
  };
}

/**
 * Convert simple markdown to ADF (basic implementation)
 * Supports: headings, bold, bullet lists, ordered lists
 */
function markdownToADF(markdown) {
  const lines = markdown.split('\n');
  const content = [];
  let currentList = null;
  let currentListType = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Empty line - close any open list
    if (line.trim() === '') {
      if (currentList) {
        content.push(currentList);
        currentList = null;
        currentListType = null;
      }
      continue;
    }

    // Heading (# Header)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentList) {
        content.push(currentList);
        currentList = null;
        currentListType = null;
      }
      const level = headingMatch[1].length;
      content.push(buildHeading(headingMatch[2], level));
      continue;
    }

    // Bullet list (* item or - item)
    const bulletMatch = line.match(/^[\*\-]\s+(.+)$/);
    if (bulletMatch) {
      if (currentListType !== 'bullet') {
        if (currentList) {
          content.push(currentList);
        }
        currentList = { type: "bulletList", content: [] };
        currentListType = 'bullet';
      }
      currentList.content.push({
        type: "listItem",
        content: [buildParagraph(bulletMatch[1])]
      });
      continue;
    }

    // Ordered list (1. item)
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      if (currentListType !== 'ordered') {
        if (currentList) {
          content.push(currentList);
        }
        currentList = { type: "orderedList", content: [] };
        currentListType = 'ordered';
      }
      currentList.content.push({
        type: "listItem",
        content: [buildParagraph(orderedMatch[1])]
      });
      continue;
    }

    // Regular paragraph
    if (currentList) {
      content.push(currentList);
      currentList = null;
      currentListType = null;
    }

    // Check for bold text (**text**)
    const marks = [];
    let text = line;
    if (text.includes('**')) {
      // For simplicity, if line contains **, mark entire line as bold
      // A more sophisticated implementation would handle inline bold
      marks.push({ type: "strong" });
      text = text.replace(/\*\*/g, '');
    }

    content.push(buildParagraph(text, marks));
  }

  // Close any remaining list
  if (currentList) {
    content.push(currentList);
  }

  return wrapInADF(content);
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Jira Skill - Issue Management Client

Usage:
  node jira.js <command> [options]

Commands:
  read <issue-key>                     - Fetch a specific issue by key
  create <project-key> <summary> [parent-key] - Create a new issue (description via stdin)
  update <issue-key>                   - Update an existing issue (content via stdin)
  search <jql>                         - Search issues using JQL
  list-children <parent-key>           - List all child issues of a parent

Create Options:
  --type <type>        - Issue type (default: Task)
  --priority <priority> - Priority (e.g., Low, Medium, High)
  --labels <label1,label2> - Comma-separated labels

Examples:
  node jira.js read AI-703
  echo '{"type":"doc","version":1,"content":[{"type":"paragraph","content":[{"type":"text","text":"Description"}]}]}' | \\
    node jira.js create AI "New Task" AI-688 --type Task --priority Low
  echo '{"summary":"Updated Title"}' | node jira.js update AI-703
  node jira.js search "project=AI AND status='Backlog'"
  node jira.js list-children AI-688

Description Format:
  - For create: Provide ADF (Atlassian Document Format) JSON via stdin
  - For update: Provide JSON via stdin with optional fields: summary, description, priority, labels
  - Use markdown format: The tool will attempt to convert it to ADF

Environment Variables Required:
  ATLASSIAN_API_TOKEN    - Your Atlassian API token
  ATLASSIAN_SITE_URL     - Your Atlassian site URL (e.g., https://yoursite.atlassian.net)
  ATLASSIAN_USER_EMAIL   - Your email for authentication
    `);
    process.exit(0);
  }

  const command = args[0];
  const client = new JiraClient();

  try {
    let result;

    switch (command) {
      case 'read':
        if (!args[1]) {
          throw new Error('Issue key required');
        }
        result = await client.readIssue(args[1]);
        break;

      case 'create':
        if (!args[1] || !args[2]) {
          throw new Error('Project key and summary required');
        }

        // Read description from stdin
        const createInput = await readStdin();
        if (!createInput) {
          throw new Error('Description required via stdin (ADF JSON or markdown)');
        }

        const projectKey = args[1];
        const summary = args[2];
        const parentKey = args[3] && !args[3].startsWith('--') ? args[3] : null;

        // Parse options
        const createOptions = {};
        for (let i = (parentKey ? 4 : 3); i < args.length; i++) {
          if (args[i] === '--type' && args[i + 1]) {
            createOptions.issueType = args[i + 1];
            i++;
          } else if (args[i] === '--priority' && args[i + 1]) {
            createOptions.priority = args[i + 1];
            i++;
          } else if (args[i] === '--labels' && args[i + 1]) {
            createOptions.labels = args[i + 1].split(',');
            i++;
          }
        }

        if (parentKey) {
          createOptions.parentKey = parentKey;
        }

        // Try to parse as JSON (ADF), otherwise treat as markdown
        let description;
        try {
          description = JSON.parse(createInput);
        } catch (e) {
          // Convert markdown to ADF
          description = markdownToADF(createInput);
        }

        result = await client.createIssue(projectKey, summary, description, createOptions);
        break;

      case 'update':
        if (!args[1]) {
          throw new Error('Issue key required');
        }

        // Read updates from stdin
        const updateInput = await readStdin();
        if (!updateInput) {
          throw new Error('Update data required via stdin (JSON format)');
        }

        const updates = JSON.parse(updateInput);
        result = await client.updateIssue(args[1], updates);
        break;

      case 'search':
        if (!args[1]) {
          throw new Error('JQL query required');
        }

        const jql = args[1];
        const fields = args[2] ? args[2].split(',') : [];
        result = await client.searchIssues(jql, fields);
        break;

      case 'list-children':
        if (!args[1]) {
          throw new Error('Parent issue key required');
        }

        result = await client.listChildren(args[1]);
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Output result as JSON
    console.log(JSON.stringify(result, null, 2));

    // Output filtering stats to stderr
    console.error('\n--- PII Filtering Stats ---');
    console.error(JSON.stringify(client.getFilterStats(), null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Read from stdin
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';

    // Check if stdin is a TTY (terminal)
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data.trim()));

    // Set a timeout in case stdin is not closed
    setTimeout(() => {
      if (!data) {
        resolve('');
      }
    }, 100);
  });
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

module.exports = { JiraClient, markdownToADF, wrapInADF, buildParagraph, buildHeading, buildBulletList, buildOrderedList };
