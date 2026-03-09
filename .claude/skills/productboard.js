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
const fs = require('fs');
const path = require('path');
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
   * @param {object} filters - Additional filters (e.g., { owner: 'alice', featureId: 'xxx', state: 'unprocessed' })
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

        // Apply state filtering (client-side since API doesn't support it)
        // Valid states: unprocessed, processed, archived, all
        if (filters.state && filters.state !== 'all') {
          const validStates = ['unprocessed', 'processed', 'archived'];
          if (!validStates.includes(filters.state)) {
            throw new Error(`Invalid state filter: "${filters.state}". Valid values: ${validStates.join(', ')}, all`);
          }
          response.data = response.data.filter(note => note.state === filters.state);
          response._stateFilterNote = `Filtered to ${filters.state} notes (client-side filter)`;
        }
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

  /**
   * Extract strategic domains and keywords from PRODUCT_STRATEGY.md
   * @param {string} strategyPath - Path to the strategy file (default: PRODUCT_STRATEGY.md)
   * @returns {object} Map of domain names to keyword arrays
   */
  extractDomainsFromStrategy(strategyPath = 'PRODUCT_STRATEGY.md') {
    const domains = {};

    // Resolve path relative to project root
    const projectRoot = path.resolve(__dirname, '../..');
    const fullPath = path.resolve(projectRoot, strategyPath);

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Split by domain headers (### Domain N - <name>)
      const domainRegex = /###\s+Domain\s+\d+\s*[-–]\s*(.+?)(?=\n)/gi;
      const matches = [...content.matchAll(domainRegex)];

      for (const match of matches) {
        const domainName = match[1].trim();

        // Find the section content for this domain
        const sectionStart = match.index + match[0].length;
        const nextDomainMatch = content.slice(sectionStart).search(/###\s+Domain\s+\d+/i);
        const nextSectionMatch = content.slice(sectionStart).search(/^---$/m);
        const sectionEnd = Math.min(
          nextDomainMatch !== -1 ? sectionStart + nextDomainMatch : content.length,
          nextSectionMatch !== -1 ? sectionStart + nextSectionMatch : content.length
        );
        const sectionContent = content.slice(sectionStart, sectionEnd);

        // Extract keywords from Special Instructions or derive from domain name and description
        const keywords = this._extractKeywordsFromSection(sectionContent, domainName);
        domains[domainName] = keywords;
      }
    } catch (error) {
      // If file doesn't exist, return default domains
      console.error(`Warning: Could not read strategy file: ${error.message}`);
      return this._getDefaultDomains();
    }

    // If no domains found, return defaults
    if (Object.keys(domains).length === 0) {
      return this._getDefaultDomains();
    }

    return domains;
  }

  /**
   * Extract keywords from a domain section
   * @private
   */
  _extractKeywordsFromSection(sectionContent, domainName) {
    const keywords = new Set();

    // Add keywords from domain name
    const nameWords = domainName.toLowerCase()
      .replace(/[&]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['and', 'the', 'for'].includes(w));
    nameWords.forEach(w => keywords.add(w));

    // Look for Special Instructions section and extract key terms
    const specialInstructionsMatch = sectionContent.match(/\*\*Special Instructions:\*\*([\s\S]*?)(?=\*\*|$)/i);
    if (specialInstructionsMatch) {
      const instructionsText = specialInstructionsMatch[1].toLowerCase();
      // Extract meaningful words (4+ chars, not common words)
      const commonWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'being', 'other', 'more', 'some', 'what', 'when', 'which', 'their', 'about', 'could', 'would', 'should', 'these', 'into', 'than', 'such', 'make', 'like', 'just', 'over', 'also', 'after', 'most'];
      const words = instructionsText.match(/\b[a-z]{4,}\b/g) || [];
      words.filter(w => !commonWords.includes(w)).forEach(w => keywords.add(w));
    }

    // Also check description for key terms
    const descriptionMatch = sectionContent.match(/\*\*Description:\*\*([\s\S]*?)(?=\*\*|$)/i);
    if (descriptionMatch) {
      const descText = descriptionMatch[1].toLowerCase();
      const words = descText.match(/\b[a-z]{4,}\b/g) || [];
      const commonWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'being', 'other', 'more', 'some', 'what', 'when', 'which', 'their', 'about', 'could', 'would', 'should', 'these', 'into', 'than', 'such', 'make', 'like', 'just', 'over', 'also', 'after', 'most'];
      words.filter(w => !commonWords.includes(w)).slice(0, 5).forEach(w => keywords.add(w));
    }

    return Array.from(keywords);
  }

  /**
   * Get default domains if no strategy file exists
   * @private
   */
  _getDefaultDomains() {
    return {
      'AI & Agents': ['ai', 'agent', 'chat', 'assistant', 'llm', 'intelligent', 'automation', 'evaluate', 'quality'],
      'Better Dashboard Stories': ['dashboard', 'report', 'widget', 'filter', 'gauge', 'percentage', 'story', 'visualization', 'chart'],
      'Less GREMLIN Confusion': ['gremlin', 'query', 'search', 'advanced search', 'natural language'],
      'Future State Step 1': ['scenario', 'transformation', 'roadmap', 'compare', 'future state']
    };
  }

  /**
   * Analyze notes against strategic domains
   * @param {Array} notes - Array of note objects
   * @param {object} domains - Map of domain names to keyword arrays
   * @returns {object} Analysis result with domain alignment and insights
   */
  analyzeNotes(notes, domains) {
    const analysis = {
      overview: {
        totalNotes: notes.length,
        byState: {},
        sources: {}
      },
      domainAlignment: {},
      highImpactNotes: [],
      emergingThemes: [],
      topTags: []
    };

    // Initialize domain alignment
    Object.keys(domains).forEach(domain => {
      analysis.domainAlignment[domain] = {
        totalNotes: 0,
        topNotes: []
      };
    });

    const tagCounts = {};
    const contentWords = {};
    const allStrategicKeywords = Object.values(domains).flat();

    // Process each note
    notes.forEach(note => {
      // Count by state
      const state = note.state || 'unknown';
      analysis.overview.byState[state] = (analysis.overview.byState[state] || 0) + 1;

      // Count by source
      const source = note.source?.origin || 'unknown';
      analysis.overview.sources[source] = (analysis.overview.sources[source] || 0) + 1;

      // Domain alignment analysis
      const noteText = ((note.title || '') + ' ' + (note.content || '')).toLowerCase();
      Object.keys(domains).forEach(domain => {
        const keywords = domains[domain];
        const matches = keywords.filter(keyword => noteText.includes(keyword.toLowerCase()));
        if (matches.length > 0) {
          analysis.domainAlignment[domain].totalNotes++;
          analysis.domainAlignment[domain].topNotes.push({
            id: note.id,
            title: note.title,
            url: note.displayUrl,
            keywords: matches,
            relevanceScore: matches.length
          });
        }
      });

      // Extract tags
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }

      // High-impact note detection
      const linkedFeatures = note.features?.length || 0;
      const followers = note.followers?.length || 0;
      if (linkedFeatures > 0 || followers > 1) {
        analysis.highImpactNotes.push({
          id: note.id,
          title: note.title,
          url: note.displayUrl,
          linkedFeatures,
          followers,
          state: note.state
        });
      }

      // Extract words for emerging themes
      const words = noteText.match(/\b[a-z]{4,}\b/g) || [];
      words.forEach(word => {
        if (!allStrategicKeywords.includes(word)) {
          contentWords[word] = (contentWords[word] || 0) + 1;
        }
      });
    });

    // Sort domain alignments by relevance
    Object.keys(analysis.domainAlignment).forEach(domain => {
      analysis.domainAlignment[domain].topNotes.sort((a, b) => b.relevanceScore - a.relevanceScore);
      analysis.domainAlignment[domain].topNotes = analysis.domainAlignment[domain].topNotes.slice(0, 5);
    });

    // Sort high-impact notes
    analysis.highImpactNotes.sort((a, b) =>
      (b.linkedFeatures + b.followers) - (a.linkedFeatures + a.followers)
    );

    // Get emerging themes (top 20 non-strategic keywords)
    const commonWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'being', 'other', 'more', 'some', 'what', 'when', 'which', 'their', 'about', 'could', 'would', 'should', 'these', 'into', 'than', 'such', 'make', 'like', 'just', 'over', 'also', 'after', 'most', 'class', 'margin', 'https', 'href', 'span', 'link', 'style', 'color', 'font', 'text', 'html'];
    analysis.emergingThemes = Object.entries(contentWords)
      .filter(([word]) => !commonWords.includes(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    // Get top tags
    analysis.topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return analysis;
  }

  /**
   * Format notes for export in CSV or JSON format
   * @param {Array} notes - Array of note objects
   * @param {string} format - Export format ('csv' or 'json')
   * @returns {string} Formatted export data
   */
  formatNotesForExport(notes, format = 'csv') {
    if (format === 'json') {
      const exportData = notes.map(note => ({
        id: note.id,
        title: note.title,
        url: note.displayUrl,
        state: note.state,
        createdAt: note.createdAt,
        source: note.source?.origin || 'unknown',
        linkedFeatures: note.features?.length || 0,
        tags: note.tags || []
      }));
      return JSON.stringify(exportData, null, 2);
    }

    // CSV format
    const headers = ['ID', 'Title', 'URL', 'State', 'Created', 'Source', 'Linked Features', 'Tags'];
    let csv = headers.join(',') + '\n';

    notes.forEach(note => {
      const tags = (note.tags || []).join('; ');
      const title = (note.title || '').replace(/"/g, '""');
      const created = (note.createdAt || '').split('T')[0];
      const source = note.source?.origin || 'unknown';
      const linkedFeatures = note.features?.length || 0;

      csv += `"${note.id}","${title}","${note.displayUrl || ''}","${note.state || ''}","${created}","${source}","${linkedFeatures}","${tags}"\n`;
    });

    return csv;
  }

  /**
   * Generate a markdown report from analysis data
   * @param {object} analysis - Analysis result from analyzeNotes
   * @param {object} options - Report options
   * @returns {string} Markdown formatted report
   */
  generateMarkdownReport(analysis, options = {}) {
    const date = new Date().toISOString().split('T')[0];
    let markdown = `# Productboard Notes Analysis Report
## Generated: ${date}

---

## Executive Summary

**Total Notes Analyzed:** ${analysis.overview.totalNotes}

### State Distribution
`;

    Object.entries(analysis.overview.byState).forEach(([state, count]) => {
      const percentage = Math.round(count / analysis.overview.totalNotes * 100);
      markdown += `- **${state}:** ${count} (${percentage}%)\n`;
    });

    markdown += `\n### Source Distribution\n`;
    Object.entries(analysis.overview.sources)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        const percentage = Math.round(count / analysis.overview.totalNotes * 100);
        markdown += `- **${source}:** ${count} (${percentage}%)\n`;
      });

    markdown += `\n---\n\n## Strategic Domain Alignment\n\n`;

    // Domain alignment sections
    Object.entries(analysis.domainAlignment).forEach(([domain, data]) => {
      const percentage = analysis.overview.totalNotes > 0
        ? Math.round(data.totalNotes / analysis.overview.totalNotes * 100)
        : 0;
      markdown += `### ${domain}\n\n`;
      markdown += `**Total Aligned Notes:** ${data.totalNotes} (${percentage}% of all notes)\n\n`;

      if (data.topNotes.length > 0) {
        markdown += `**Top Notes:**\n\n`;
        data.topNotes.forEach((note, idx) => {
          markdown += `${idx + 1}. **[${note.title}](${note.url})**\n`;
          markdown += `   - Keywords: ${note.keywords.join(', ')}\n\n`;
        });
      } else {
        markdown += `_No notes aligned to this domain._\n\n`;
      }
    });

    // High-impact insights
    markdown += `---\n\n## High-Impact Insights\n\n`;
    markdown += `These notes have been identified as high-impact based on linked features and follower count:\n\n`;

    if (analysis.highImpactNotes.length > 0) {
      analysis.highImpactNotes.slice(0, 10).forEach((note, idx) => {
        markdown += `${idx + 1}. **[${note.title}](${note.url})**\n`;
        markdown += `   - State: ${note.state}\n`;
        markdown += `   - Linked Features: ${note.linkedFeatures}\n`;
        markdown += `   - Followers: ${note.followers}\n\n`;
      });
    } else {
      markdown += `_No high-impact notes identified._\n\n`;
    }

    // Emerging themes
    markdown += `---\n\n## Emerging Themes\n\n`;
    markdown += `Keywords appearing frequently that are not part of strategic domains:\n\n`;

    if (analysis.emergingThemes.length > 0) {
      analysis.emergingThemes.slice(0, 10).forEach(theme => {
        markdown += `- **${theme.word}:** ${theme.count} occurrences\n`;
      });
    } else {
      markdown += `_No emerging themes identified._\n\n`;
    }

    // Top tags
    markdown += `\n---\n\n## Top Tags\n\n`;

    if (analysis.topTags.length > 0) {
      analysis.topTags.forEach(tag => {
        markdown += `- **${tag.tag}:** ${tag.count} notes\n`;
      });
    } else {
      markdown += `_No tags found._\n\n`;
    }

    // Recommendations
    markdown += `\n---\n\n## Recommendations\n\n`;
    markdown += `### Immediate Actions\n\n`;

    // Generate dynamic recommendations based on analysis
    const unprocessedCount = analysis.overview.byState.unprocessed || 0;
    if (unprocessedCount > 0) {
      const unprocessedPercentage = Math.round(unprocessedCount / analysis.overview.totalNotes * 100);
      markdown += `1. **Process Unprocessed Notes (${unprocessedCount} notes, ${unprocessedPercentage}%)**\n`;
      markdown += `   - Review and triage unprocessed notes\n`;
      markdown += `   - Focus on notes with multiple followers first\n\n`;
    }

    // Find top domains
    const sortedDomains = Object.entries(analysis.domainAlignment)
      .sort((a, b) => b[1].totalNotes - a[1].totalNotes)
      .slice(0, 3);

    sortedDomains.forEach(([domain, data], idx) => {
      if (data.totalNotes > 0) {
        markdown += `${idx + 2}. **Address ${domain} Feedback (${data.totalNotes} notes)**\n`;
        markdown += `   - Review aligned notes for actionable insights\n`;
        markdown += `   - Connect relevant notes to features in backlog\n\n`;
      }
    });

    markdown += `### Strategic Considerations\n\n`;

    // Source analysis
    const topSource = Object.entries(analysis.overview.sources)
      .sort((a, b) => b[1] - a[1])[0];
    if (topSource) {
      const sourcePercentage = Math.round(topSource[1] / analysis.overview.totalNotes * 100);
      markdown += `1. **${topSource[0]} Engagement:**\n`;
      markdown += `   - ${sourcePercentage}% of notes come from ${topSource[0]}\n`;
      markdown += `   - Ensure these requests are addressed visibly\n\n`;
    }

    markdown += `---\n\n*Report generated by AI on ${new Date().toISOString()}*\n`;

    return markdown;
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
  analyze [limit]       - Analyze notes against strategic domains
  export [limit]        - Export notes to CSV or JSON format
  report [limit]        - Generate a markdown analysis report

Options:
  --owner <alias>       - Filter by owner email alias (see .env for setup)
  --feature <id>        - Filter notes by feature ID
  --state <state>       - Filter notes by state: unprocessed, processed, archived, all (default: all)
  --strategy <path>     - Path to strategy file (default: PRODUCT_STRATEGY.md)
  --format <format>     - Export format: csv, json (default: csv)
  --output <file>       - Write output to file instead of stdout

Examples:
  node productboard.js feature 12345
  node productboard.js features 10
  node productboard.js features 20 --owner alice
  node productboard.js get-note abc-123-def-456
  node productboard.js all-notes 50 --owner bob
  node productboard.js all-notes 50 --feature abc-123
  node productboard.js all-notes 50 --state unprocessed
  node productboard.js all-notes 100 --state processed --owner alice
  node productboard.js notes 12345
  node productboard.js search "checkout flow"
  node productboard.js analyze 100
  node productboard.js analyze 50 --state unprocessed
  node productboard.js export 100 --format csv
  node productboard.js export 50 --format json --output workspace/notes.json
  node productboard.js report 100 --output workspace/analysis-report.md

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
    } else if (args[i] === '--state' && args[i + 1]) {
      options.state = args[i + 1];
      args.splice(i, 2); // Remove --state and its value from args
      i--;
    } else if (args[i] === '--strategy' && args[i + 1]) {
      options.strategy = args[i + 1];
      args.splice(i, 2); // Remove --strategy and its value from args
      i--;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      args.splice(i, 2); // Remove --format and its value from args
      i--;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      args.splice(i, 2); // Remove --output and its value from args
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

      case 'analyze': {
        const analyzeLimit = args[1] ? parseInt(args[1]) : 100;
        const domains = client.extractDomainsFromStrategy(options.strategy);
        const notesResponse = await client.listAllNotes(analyzeLimit, options);
        result = client.analyzeNotes(notesResponse.data || [], domains);
        console.error(`\n--- Analysis Summary ---`);
        console.error(`Notes analyzed: ${result.overview.totalNotes}`);
        console.error(`Domains: ${Object.keys(result.domainAlignment).join(', ')}`);
        break;
      }

      case 'export': {
        const exportLimit = args[1] ? parseInt(args[1]) : 100;
        const format = options.format || 'csv';
        if (!['csv', 'json'].includes(format)) {
          throw new Error(`Invalid format: ${format}. Use 'csv' or 'json'`);
        }
        const exportNotesResponse = await client.listAllNotes(exportLimit, options);
        result = client.formatNotesForExport(exportNotesResponse.data || [], format);

        if (options.output) {
          const outputPath = path.resolve(process.cwd(), options.output);
          fs.writeFileSync(outputPath, result);
          console.error(`\n--- Export Complete ---`);
          console.error(`File written to: ${outputPath}`);
          console.error(`Format: ${format}`);
          console.error(`Notes exported: ${exportNotesResponse.data?.length || 0}`);
          process.exit(0);
        }
        // For non-file output, result is printed below
        break;
      }

      case 'report': {
        const reportLimit = args[1] ? parseInt(args[1]) : 100;
        const reportDomains = client.extractDomainsFromStrategy(options.strategy);
        const reportNotesResponse = await client.listAllNotes(reportLimit, options);
        const analysis = client.analyzeNotes(reportNotesResponse.data || [], reportDomains);
        result = client.generateMarkdownReport(analysis);

        if (options.output) {
          const reportOutputPath = path.resolve(process.cwd(), options.output);
          fs.writeFileSync(reportOutputPath, result);
          console.error(`\n--- Report Complete ---`);
          console.error(`File written to: ${reportOutputPath}`);
          console.error(`Notes analyzed: ${analysis.overview.totalNotes}`);
          process.exit(0);
        }
        // For non-file output, result is printed below
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Output result as JSON (or raw string for export/report)
    if (typeof result === 'string') {
      console.log(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    // Output filtering stats to stderr (skip for export/report with file output)
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
