#!/usr/bin/env node

/**
 * Productboard Skill
 * Fetches product data from Productboard and filters PII before presenting to LLM
 *
 * Usage:
 *   node productboard.js <command> [options]
 *
 * Commands:
 *   feature <id>          - Fetch a specific feature by ID
 *   features [limit]      - List features (default limit: 20)
 *   get-note <note-id>    - Fetch a specific note by ID
 *   notes <feature-id>    - Fetch notes/insights for a feature
 *   search <query>        - Search features by keyword
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
require('dotenv').config();
const PIIFilter = require('../../utils/pii-filter');

class ProductboardClient {
  constructor() {
    this.apiToken = process.env.PRODUCTBOARD_API_TOKEN;
    this.apiUrl = process.env.PRODUCTBOARD_API_URL || 'https://api.productboard.com';
    this.filter = new PIIFilter();

    if (!this.apiToken) {
      throw new Error('PRODUCTBOARD_API_TOKEN not found in environment');
    }
  }

  /**
   * Resolve owner email alias from environment variables
   * Allows filtering by owner without exposing emails to the LLM
   */
  resolveOwnerEmail(alias) {
    if (!alias) return null;

    // Check if it's already an email (contains @)
    if (alias.includes('@')) {
      return alias;
    }

    // Convert alias to env var name (e.g., "alice" -> "OWNER_EMAIL_ALICE")
    const envVarName = `OWNER_EMAIL_${alias.toUpperCase()}`;
    const email = process.env[envVarName];

    if (!email) {
      throw new Error(`Owner alias "${alias}" not found. Add ${envVarName}=email@example.com to your .env file`);
    }

    return email;
  }

  /**
   * Make API request to Productboard
   */
  async makeRequest(endpoint, options = {}) {
    const url = new URL(endpoint, this.apiUrl);

    // Add query parameters
    if (options.params) {
      Object.keys(options.params).forEach(key => {
        url.searchParams.append(key, options.params[key]);
      });
    }

    const parsedUrl = new URL(url.toString());
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'X-Version': '1',
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
   * Fetch a specific feature by ID
   */
  async getFeature(featureId) {
    try {
      const feature = await this.makeRequest(`/features/${featureId}`);
      return this.filterFeatureData(feature);
    } catch (error) {
      throw new Error(`Failed to fetch feature ${featureId}: ${error.message}`);
    }
  }

  /**
   * List features with optional filters
   * Supports pagination via pageLimit and pageOffset
   * @param {number} maxResults - Maximum number of results to return
   * @param {object} filters - Additional filters (e.g., { ownerEmail: 'user@example.com' })
   */
  async listFeatures(maxResults = 100, filters = {}) {
    try {
      const params = {
        pageLimit: Math.min(maxResults, 100), // API max is 100 per page
        ...filters
      };

      // Handle owner email alias resolution
      if (filters.owner) {
        params['owner.email'] = this.resolveOwnerEmail(filters.owner);
        delete params.owner; // Remove the alias, use the resolved email
      }

      const response = await this.makeRequest('/features', { params });

      // Filter the array of features
      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.map(f => this.filterFeatureData(f));
      }

      // If we need more results and there's a next page, fetch it
      if (response.data && response.data.length < maxResults && response.links && response.links.next) {
        // Note: For simplicity, we're only returning the first page
        // To implement full pagination, recursively fetch links.next
        response._paginationNote = 'More results available. Use links.next for pagination.';
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to list features: ${error.message}`);
    }
  }

  /**
   * Search features by keyword (client-side filtering)
   * Note: Productboard API v1 doesn't have a direct search parameter
   * This fetches features and filters them locally
   */
  async searchFeatures(query) {
    try {
      // Fetch all features (up to 100)
      const response = await this.listFeatures(100);

      // Filter features that match the query in name or description
      if (response.data && Array.isArray(response.data)) {
        const lowerQuery = query.toLowerCase();
        response.data = response.data.filter(feature => {
          const name = (feature.name || '').toLowerCase();
          const description = (feature.description || '').toLowerCase();
          return name.includes(lowerQuery) || description.includes(lowerQuery);
        });
        response._searchNote = 'Client-side search performed on first 100 features';
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to search features: ${error.message}`);
    }
  }

  /**
   * Fetch notes/insights for a feature
   * Uses the /notes endpoint with featureId filter
   */
  async getFeatureNotes(featureId) {
    try {
      const params = {
        pageLimit: 100,
        featureId: featureId
      };

      const notes = await this.makeRequest('/notes', { params });

      if (notes.data && Array.isArray(notes.data)) {
        notes.data = notes.data.map(note => this.filterNoteData(note));
      }

      return notes;
    } catch (error) {
      throw new Error(`Failed to fetch notes for feature ${featureId}: ${error.message}`);
    }
  }

  /**
   * Fetch a specific note by ID
   */
  async getNote(noteId) {
    try {
      const note = await this.makeRequest(`/notes/${noteId}`);
      return this.filterNoteData(note);
    } catch (error) {
      throw new Error(`Failed to fetch note ${noteId}: ${error.message}`);
    }
  }

  /**
   * List all notes from the workspace
   * Ordered by creation date (descending)
   * Note: pageCursor is valid for 1 minute only
   * @param {number} maxResults - Maximum number of results to return
   * @param {object} filters - Additional filters (e.g., { owner: 'alice', featureId: 'xxx' })
   */
  async listAllNotes(maxResults = 100, filters = {}) {
    try {
      const params = {
        pageLimit: Math.min(maxResults, 100) // API max is 100 per page
      };

      // Handle owner email alias resolution
      if (filters.owner) {
        params.ownerEmail = this.resolveOwnerEmail(filters.owner);
      }

      // Handle feature filtering
      if (filters.featureId) {
        params.featureId = filters.featureId;
      }

      const response = await this.makeRequest('/notes', { params });

      // Filter the array of notes
      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.map(note => this.filterNoteData(note));
      }

      // Add pagination note
      if (response.data && response.data.length < maxResults && response.links && response.links.next) {
        response._paginationNote = 'More results available. Use links.next for pagination. Note: pageCursor expires in 1 minute.';
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to list all notes: ${error.message}`);
    }
  }

  /**
   * Filter PII from feature data
   */
  filterFeatureData(feature) {
    // Custom filtering rules for Productboard-specific fields
    const fieldRules = {
      // Keep feature name as-is (it's product data, not PII)
      'name': (value) => value,

      // Preserve URLs for navigation
      'externalDisplayUrl': (value) => value,
      'links': (value) => value,

      // Anonymize customer/user information
      'customer': (value, filter) => filter.anonymizeCompany(value),
      'customer_name': (value, filter) => filter.anonymizeCompany(value),
      'user_email': (value) => '[REDACTED_EMAIL]',
      'owner_email': (value) => '[REDACTED_EMAIL]',
      'memberName': (value, filter) => filter.anonymizeName(value),
      'memberEmail': (value) => '[REDACTED_EMAIL]',

      // Keep these fields but filter text content
      'title': (value, filter) => filter.filterText(value),
      'description': (value, filter) => filter.filterText(value),
      'notes': (value, filter) => filter.filterText(value),
    };

    return this.filter.filterObject(feature, fieldRules);
  }

  /**
   * Filter PII from note data
   */
  filterNoteData(note) {
    const fieldRules = {
      // Keep note title/subject as-is (it's product feedback, not PII)
      'title': (value) => value,
      'subject': (value) => value,

      // Preserve URLs for navigation
      'displayUrl': (value) => value,
      'externalDisplayUrl': (value) => value,
      'links': (value) => value,

      // Anonymize user/customer information
      'customer': (value, filter) => filter.anonymizeCompany(value),
      'customer_name': (value, filter) => filter.anonymizeCompany(value),
      'company': (value, filter) => filter.anonymizeCompany(value),
      'author_name': (value, filter) => filter.anonymizeName(value),
      'author_email': (value) => '[REDACTED_EMAIL]',
      'user_name': (value, filter) => filter.anonymizeName(value),
      'user_email': (value) => '[REDACTED_EMAIL]',
      'memberName': (value, filter) => filter.anonymizeName(value),
      'memberEmail': (value) => '[REDACTED_EMAIL]',

      // Filter text content for PII
      'content': (value, filter) => filter.filterText(value),
      'description': (value, filter) => filter.filterText(value),
      'body': (value, filter) => filter.filterText(value),
    };

    return this.filter.filterObject(note, fieldRules);
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
Productboard Skill - Privacy-First API Client

Usage:
  node productboard.js <command> [options]

Commands:
  feature <id>          - Fetch a specific feature by ID
  features [limit]      - List features (default limit: 100)
  get-note <note-id>    - Fetch a specific note by ID
  all-notes [limit]     - List all notes from workspace (default limit: 100)
  notes <feature-id>    - Fetch notes/insights for a specific feature
  search <query>        - Search features by keyword

Options:
  --owner <alias>       - Filter by owner email alias (see .env for setup)
  --feature <id>        - Filter notes by feature ID

Examples:
  node productboard.js feature 12345
  node productboard.js features 10
  node productboard.js features 20 --owner alice
  node productboard.js get-note abc-123-def-456
  node productboard.js all-notes 50 --owner bob
  node productboard.js all-notes 50 --feature abc-123
  node productboard.js notes 12345
  node productboard.js search "checkout flow"

Owner Email Aliases:
  To filter by owner without exposing emails, add aliases to your .env file:
    OWNER_EMAIL_ALICE=alice@example.com
    OWNER_EMAIL_BOB=bob@example.com
  Then use: --owner alice

Important Notes:
  - pageCursor for notes pagination expires in 1 minute
  - Maximum 100 items per page for notes and features
  - The 'notes <feature-id>' command is equivalent to 'all-notes --feature <id>'

Environment Variables Required:
  PRODUCTBOARD_API_TOKEN    - Your Productboard API token
  PRODUCTBOARD_API_URL      - API base URL (optional, defaults to https://api.productboard.com)
    `);
    process.exit(0);
  }

  const command = args[0];
  const client = new ProductboardClient();

  // Parse options
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--owner' && args[i + 1]) {
      options.owner = args[i + 1];
      args.splice(i, 2); // Remove --owner and its value from args
      i--;
    } else if (args[i] === '--feature' && args[i + 1]) {
      options.featureId = args[i + 1];
      args.splice(i, 2); // Remove --feature and its value from args
      i--;
    }
  }

  try {
    let result;

    switch (command) {
      case 'feature':
        if (!args[1]) {
          throw new Error('Feature ID required');
        }
        result = await client.getFeature(args[1]);
        break;

      case 'features':
        const featuresLimit = args[1] ? parseInt(args[1]) : 100;
        result = await client.listFeatures(featuresLimit, options);
        break;

      case 'all-notes':
        const notesLimit = args[1] ? parseInt(args[1]) : 100;
        result = await client.listAllNotes(notesLimit, options);
        break;

      case 'notes':
        if (!args[1]) {
          throw new Error('Feature ID required');
        }
        result = await client.getFeatureNotes(args[1]);
        break;

      case 'get-note':
        if (!args[1]) {
          throw new Error('Note ID required');
        }
        result = await client.getNote(args[1]);
        break;

      case 'search':
        if (!args[1]) {
          throw new Error('Search query required');
        }
        result = await client.searchFeatures(args.slice(1).join(' '));
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

module.exports = ProductboardClient;
