#!/usr/bin/env node

/**
 * Dovetail Skill
 * Fetches user research data from Dovetail and filters PII before presenting to LLM
 *
 * Usage:
 *   node dovetail.js <command> [options]
 *
 * Commands:
 *   projects [limit]              - List research projects (default limit: 20)
 *   project <id>                  - Fetch a specific project by ID
 *   insights <project-id> [limit] - Fetch insights from a project
 *   highlights <project-id>       - Fetch highlights from a project
 *   tags [project-id]             - List tags (optionally filtered by project)
 *   search <query>                - Search across insights and highlights
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();
const PIIFilter = require('../../utils/pii-filter');

class DovetailClient {
  constructor() {
    this.apiToken = process.env.DOVETAIL_API_TOKEN;
    this.apiUrl = process.env.DOVETAIL_API_URL || 'https://dovetail.com/api/v1';
    this.filter = new PIIFilter();

    if (!this.apiToken) {
      throw new Error('DOVETAIL_API_TOKEN not found in environment');
    }
  }

  /**
   * Make API request to Dovetail
   */
  async makeRequest(endpoint, options = {}) {
    // Remove leading slash from endpoint if present
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const fullUrl = `${this.apiUrl.replace(/\/$/, '')}/${cleanEndpoint}`;
    const url = new URL(fullUrl);

    // Add query parameters
    if (options.params) {
      Object.keys(options.params).forEach(key => {
        url.searchParams.append(key, options.params[key]);
      });
    }

    const parsedUrl = url;
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
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
   * List research projects
   */
  async listProjects(limit = 20) {
    try {
      const response = await this.makeRequest('/projects', {
        params: { limit }
      });

      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.map(p => this.filterProjectData(p));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  /**
   * Fetch a specific project by ID
   */
  async getProject(projectId) {
    try {
      const project = await this.makeRequest(`/projects/${projectId}`);
      return this.filterProjectData(project);
    } catch (error) {
      throw new Error(`Failed to fetch project ${projectId}: ${error.message}`);
    }
  }

  /**
   * Fetch insights from a project
   */
  async getInsights(projectId, limit = 50) {
    try {
      const response = await this.makeRequest('/insights', {
        params: {
          project_id: projectId,
          limit
        }
      });

      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.map(i => this.filterInsightData(i));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch insights: ${error.message}`);
    }
  }

  /**
   * Fetch highlights from a project
   */
  async getHighlights(projectId, limit = 100) {
    try {
      const response = await this.makeRequest('/highlights', {
        params: {
          project_id: projectId,
          limit
        }
      });

      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.map(h => this.filterHighlightData(h));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch highlights: ${error.message}`);
    }
  }

  /**
   * List tags (optionally filtered by project)
   */
  async getTags(projectId = null) {
    try {
      const endpoint = projectId
        ? `/projects/${projectId}/tags`
        : '/tags';

      const response = await this.makeRequest(endpoint);

      // Tags usually don't contain PII, but filter just in case
      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.map(t => this.filter.filterObject(t));
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch tags: ${error.message}`);
    }
  }

  /**
   * Search across insights and highlights
   */
  async search(query) {
    try {
      const response = await this.makeRequest('/search', {
        method: 'POST',
        body: {
          query: query
        }
      });

      // The search API returns a different structure with categories
      if (response.data) {
        const results = {
          highlights: response.data.highlights || [],
          insights: response.data.insights || [],
          notes: response.data.notes || [],
          tags: response.data.tags || [],
          total: response.data.total || 0
        };

        // Filter PII from results
        results.highlights = results.highlights.map(h => this.filterHighlightData(h));
        results.insights = results.insights.map(i => this.filterInsightData(i));
        results.notes = results.notes.map(n => this.filter.filterObject(n));
        results.tags = results.tags.map(t => this.filter.filterObject(t));

        return { data: results };
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to search: ${error.message}`);
    }
  }

  /**
   * Filter PII from project data
   */
  filterProjectData(project) {
    const fieldRules = {
      'name': (value, filter) => filter.filterText(value),
      'description': (value, filter) => filter.filterText(value),
      'owner_name': (value, filter) => filter.anonymizeName(value),
      'owner_email': (value) => '[REDACTED_EMAIL]',
      'created_by_name': (value, filter) => filter.anonymizeName(value),
      'created_by_email': (value) => '[REDACTED_EMAIL]',
    };

    return this.filter.filterObject(project, fieldRules);
  }

  /**
   * Filter PII from insight data
   */
  filterInsightData(insight) {
    const fieldRules = {
      'title': (value, filter) => filter.filterText(value),
      'description': (value, filter) => filter.filterText(value),
      'content': (value, filter) => filter.filterText(value),
      'author_name': (value, filter) => filter.anonymizeName(value),
      'author_email': (value) => '[REDACTED_EMAIL]',
      'participant_name': (value, filter) => filter.anonymizeName(value),
      'participant_email': (value) => '[REDACTED_EMAIL]',
    };

    return this.filter.filterObject(insight, fieldRules);
  }

  /**
   * Filter PII from highlight data (most sensitive - contains interview excerpts)
   */
  filterHighlightData(highlight) {
    const fieldRules = {
      'text': (value, filter) => filter.filterText(value),
      'quote': (value, filter) => filter.filterText(value),
      'transcript': (value, filter) => filter.filterText(value),
      'participant_name': (value, filter) => filter.anonymizeName(value),
      'participant_email': (value) => '[REDACTED_EMAIL]',
      'participant_id': (value, filter) => {
        filter.filter.counters.name++;
        return `PARTICIPANT_${filter.filter.counters.name}`;
      },
      'interviewer_name': (value, filter) => filter.anonymizeName(value),
      'interviewer_email': (value) => '[REDACTED_EMAIL]',
      'source': (value, filter) => filter.filterText(value),
    };

    return this.filter.filterObject(highlight, fieldRules);
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
Dovetail Skill - Privacy-First Research Data Client

Usage:
  node dovetail.js <command> [options]

Commands:
  projects [limit]              - List research projects (default limit: 20)
  project <id>                  - Fetch a specific project by ID
  insights <project-id> [limit] - Fetch insights from a project (default: 50)
  highlights <project-id>       - Fetch highlights from a project
  tags [project-id]             - List tags (optionally filtered by project)
  search <query>                - Search across insights and highlights

Examples:
  node dovetail.js projects
  node dovetail.js project abc123
  node dovetail.js insights abc123 100
  node dovetail.js highlights abc123
  node dovetail.js search "payment issues"
  node dovetail.js tags abc123

Environment Variables Required:
  DOVETAIL_API_TOKEN    - Your Dovetail API token
  DOVETAIL_API_URL      - API base URL (optional, defaults to https://dovetail.com/api/v1)

Privacy Features:
  - Participant names anonymized as "Participant 1", "Participant 2", etc.
  - Email addresses redacted
  - Phone numbers filtered from transcripts
  - Personal identifiers removed from all text content
    `);
    process.exit(0);
  }

  const command = args[0];
  const client = new DovetailClient();

  try {
    let result;

    switch (command) {
      case 'projects':
        const projectsLimit = args[1] ? parseInt(args[1]) : 20;
        result = await client.listProjects(projectsLimit);
        break;

      case 'project':
        if (!args[1]) {
          throw new Error('Project ID required');
        }
        result = await client.getProject(args[1]);
        break;

      case 'insights':
        if (!args[1]) {
          throw new Error('Project ID required');
        }
        const insightsLimit = args[2] ? parseInt(args[2]) : 50;
        result = await client.getInsights(args[1], insightsLimit);
        break;

      case 'highlights':
        if (!args[1]) {
          throw new Error('Project ID required');
        }
        result = await client.getHighlights(args[1]);
        break;

      case 'tags':
        const projectId = args[1] || null;
        result = await client.getTags(projectId);
        break;

      case 'search':
        if (!args[1]) {
          throw new Error('Search query required');
        }
        result = await client.search(args.slice(1).join(' '));
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

// Run CLI if executed directly
if (require.main === module) {
  main();
}

module.exports = DovetailClient;
