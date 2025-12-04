#!/usr/bin/env node

/**
 * Confluence Skill
 * Manages Confluence pages - read, create, and update operations
 *
 * Usage:
 *   node confluence.js <command> [options]
 *
 * Commands:
 *   read <page-id>                  - Fetch a specific page by ID
 *   create <space-key> <title> [parent-id] - Create a new page (content via stdin)
 *   update <page-id>                - Update an existing page (content via stdin)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();
const PIIFilter = require('../../utils/pii-filter');

class ConfluenceClient {
  constructor() {
    // Support both CONFLUENCE_ and ATLASSIAN_ prefixes
    this.apiToken = process.env.CONFLUENCE_API_TOKEN || process.env.ATLASSIAN_API_TOKEN;
    this.baseUrl = process.env.CONFLUENCE_BASE_URL || process.env.ATLASSIAN_SITE_URL;
    this.userEmail = process.env.CONFLUENCE_USER_EMAIL || process.env.ATLASSIAN_USER_EMAIL;
    this.filter = new PIIFilter();

    if (!this.apiToken) {
      throw new Error('CONFLUENCE_API_TOKEN or ATLASSIAN_API_TOKEN not found in environment');
    }
    if (!this.baseUrl) {
      throw new Error('CONFLUENCE_BASE_URL or ATLASSIAN_SITE_URL not found in environment');
    }
    if (!this.userEmail) {
      throw new Error('CONFLUENCE_USER_EMAIL or ATLASSIAN_USER_EMAIL not found in environment');
    }

    // Remove trailing slash from base URL
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  /**
   * Make API request to Confluence (v2 API)
   */
  async makeRequest(endpoint, options = {}) {
    const fullUrl = `${this.baseUrl}/wiki/api/v2${endpoint}`;
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
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            reject(new Error(`API Error: ${res.statusCode} - ${data}`));
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
   * Read a page by ID
   */
  async readPage(pageId) {
    try {
      const params = {
        'body-format': 'storage'
      };

      const page = await this.makeRequest(`/pages/${pageId}`, { params });
      return this.filterPageData(page);
    } catch (error) {
      throw new Error(`Failed to read page ${pageId}: ${error.message}`);
    }
  }

  /**
   * Create a new page
   * @param {string} spaceKey - Space key (e.g., "PROJ")
   * @param {string} title - Page title
   * @param {string} content - Page content in storage format
   * @param {string} parentId - Optional parent page ID
   */
  async createPage(spaceKey, title, content, parentId = null) {
    try {
      // First, get the space ID from the space key
      const spaceId = await this.getSpaceId(spaceKey);

      const requestBody = {
        spaceId: spaceId,
        status: 'current',
        title: title,
        body: {
          representation: 'storage',
          value: content
        }
      };

      // Add parent ID if provided
      if (parentId) {
        requestBody.parentId = parentId;
      }

      const page = await this.makeRequest('/pages', {
        method: 'POST',
        body: requestBody
      });

      return this.filterPageData(page);
    } catch (error) {
      throw new Error(`Failed to create page: ${error.message}`);
    }
  }

  /**
   * Update an existing page
   * @param {string} pageId - Page ID
   * @param {object} updates - Updates object with optional title, content
   */
  async updatePage(pageId, updates) {
    try {
      // First, fetch the current page to get version and other data
      const currentPage = await this.makeRequest(`/pages/${pageId}`);

      const requestBody = {
        id: pageId,
        status: updates.status || currentPage.status || 'current',
        title: updates.title || currentPage.title,
        version: {
          number: currentPage.version.number + 1,
          message: updates.versionMessage || 'Updated via API'
        }
      };

      // Add body if content is provided
      if (updates.content) {
        requestBody.body = {
          representation: 'storage',
          value: updates.content
        };
      }

      const page = await this.makeRequest(`/pages/${pageId}`, {
        method: 'PUT',
        body: requestBody
      });

      return this.filterPageData(page);
    } catch (error) {
      throw new Error(`Failed to update page ${pageId}: ${error.message}`);
    }
  }

  /**
   * Get space ID from space key
   */
  async getSpaceId(spaceKey) {
    try {
      const response = await this.makeRequest('/spaces', {
        params: { keys: spaceKey }
      });

      if (!response.results || response.results.length === 0) {
        throw new Error(`Space with key "${spaceKey}" not found`);
      }

      return response.results[0].id;
    } catch (error) {
      throw new Error(`Failed to get space ID for key ${spaceKey}: ${error.message}`);
    }
  }

  /**
   * Make API request to Confluence v1 API (for search)
   */
  async makeV1Request(endpoint, options = {}) {
    const fullUrl = `${this.baseUrl}/wiki/rest/api${endpoint}`;
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
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          } else {
            reject(new Error(`API Error: ${res.statusCode} - ${data}`));
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
   * Search for pages by title using CQL
   * @param {string} title - Title to search for
   * @param {string} spaceKey - Optional space key to limit search
   * @param {boolean} exactMatch - Use exact match (=) vs fuzzy match (~)
   * @param {number} limit - Maximum number of results (default: 25)
   */
  async searchPagesByTitle(title, spaceKey = null, exactMatch = false, limit = 25) {
    try {
      // Build CQL query
      const titleOperator = exactMatch ? '=' : '~';
      let cql = `type=page AND title${titleOperator}"${title}"`;

      if (spaceKey) {
        cql = `space=${spaceKey} AND ${cql}`;
      }

      const params = {
        cql: cql,
        limit: limit
      };

      const response = await this.makeV1Request('/search', { params });

      // Filter results for PII
      if (response.results) {
        response.results = response.results.map(result => this.filterPageData(result));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to search pages by title: ${error.message}`);
    }
  }

  /**
   * Filter PII from page data
   */
  filterPageData(page) {
    const fieldRules = {
      // Keep page metadata as-is
      'id': (value) => value,
      'title': (value) => value,
      'spaceId': (value) => value,
      'status': (value) => value,

      // Preserve URLs and links
      '_links': (value) => value,
      'webui': (value) => value,

      // Keep version info
      'version': (value) => value,

      // Filter content for PII
      'body': (value, filter) => {
        if (value && value.storage && value.storage.value) {
          return {
            ...value,
            storage: {
              ...value.storage,
              value: filter.filterText(value.storage.value)
            }
          };
        }
        return value;
      },

      // Anonymize author information
      'authorId': (value) => '[REDACTED_USER_ID]',
      'ownerId': (value) => '[REDACTED_USER_ID]',
      'createdBy': (value, filter) => ({
        ...value,
        displayName: filter.anonymizeName(value.displayName),
        email: '[REDACTED_EMAIL]'
      }),
      'lastModifiedBy': (value, filter) => ({
        ...value,
        displayName: filter.anonymizeName(value.displayName),
        email: '[REDACTED_EMAIL]'
      })
    };

    return this.filter.filterObject(page, fieldRules);
  }

  /**
   * Get filtering statistics
   */
  getFilterStats() {
    return this.filter.getStats();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Confluence Skill - Page Management Client

Usage:
  node confluence.js <command> [options]

Commands:
  read <page-id>                     - Fetch a specific page by ID
  create <space-key> <title> [parent-id] - Create a new page (content via stdin)
  update <page-id>                   - Update an existing page (content via stdin)
  search <title> [--space <key>] [--exact] [--limit <n>] - Search for pages by title

Examples:
  node confluence.js read 123456
  echo '<p>Page content</p>' | node confluence.js create "PROJ" "My Page Title"
  echo '<p>Updated content</p>' | node confluence.js create "PROJ" "Feature Spec" 123456
  echo '{"title":"New Title","content":"<p>Updated</p>"}' | node confluence.js update 123456
  node confluence.js search "Evaluation Toolchain"
  node confluence.js search "PRD" --space AIP --limit 10
  node confluence.js search "Evaluation Toolchain" --exact

Content Format:
  - For create: Provide page content as plain text via stdin (Confluence storage format/XHTML)
  - For update: Provide JSON via stdin with optional fields: title, content, versionMessage

Environment Variables Required:
  CONFLUENCE_API_TOKEN    - Your Confluence API token
  CONFLUENCE_BASE_URL     - Your Confluence base URL (e.g., https://yoursite.atlassian.net)
  CONFLUENCE_USER_EMAIL   - Your email for authentication
    `);
    process.exit(0);
  }

  const command = args[0];
  const client = new ConfluenceClient();

  try {
    let result;

    switch (command) {
      case 'read':
        if (!args[1]) {
          throw new Error('Page ID required');
        }
        result = await client.readPage(args[1]);
        break;

      case 'create':
        if (!args[1] || !args[2]) {
          throw new Error('Space key and title required');
        }

        // Read content from stdin
        const createContent = await readStdin();
        if (!createContent) {
          throw new Error('Page content required via stdin');
        }

        const spaceKey = args[1];
        const title = args[2];
        const parentId = args[3] || null;

        result = await client.createPage(spaceKey, title, createContent, parentId);
        break;

      case 'update':
        if (!args[1]) {
          throw new Error('Page ID required');
        }

        // Read updates from stdin
        const updateInput = await readStdin();
        if (!updateInput) {
          throw new Error('Update data required via stdin (JSON format)');
        }

        let updates;
        try {
          updates = JSON.parse(updateInput);
        } catch (e) {
          // If not JSON, treat as plain content
          updates = { content: updateInput };
        }

        result = await client.updatePage(args[1], updates);
        break;

      case 'search':
        if (!args[1]) {
          throw new Error('Search title required');
        }

        // Parse arguments
        const searchTitle = args[1];
        let searchSpace = null;
        let exactMatch = false;
        let searchLimit = 25;

        // Parse optional flags
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--space' && args[i + 1]) {
            searchSpace = args[i + 1];
            i++;
          } else if (args[i] === '--exact') {
            exactMatch = true;
          } else if (args[i] === '--limit' && args[i + 1]) {
            searchLimit = parseInt(args[i + 1]);
            i++;
          }
        }

        result = await client.searchPagesByTitle(searchTitle, searchSpace, exactMatch, searchLimit);
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

module.exports = ConfluenceClient;
