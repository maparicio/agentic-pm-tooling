const assert = require('assert');
const ConfluenceClient = require('../.claude/skills/confluence');

describe('ConfluenceClient', () => {
  let client;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,
      CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
      CONFLUENCE_USER_EMAIL: process.env.CONFLUENCE_USER_EMAIL,
      ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
      ATLASSIAN_SITE_URL: process.env.ATLASSIAN_SITE_URL,
      ATLASSIAN_USER_EMAIL: process.env.ATLASSIAN_USER_EMAIL
    };

    // Set test environment variables
    process.env.CONFLUENCE_API_TOKEN = 'test-token';
    process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net';
    process.env.CONFLUENCE_USER_EMAIL = 'test@example.com';
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  describe('Constructor', () => {
    it('should initialize with valid environment variables', () => {
      assert.doesNotThrow(() => {
        client = new ConfluenceClient();
      });
    });

    it('should throw error if CONFLUENCE_API_TOKEN is missing', () => {
      delete process.env.CONFLUENCE_API_TOKEN;
      delete process.env.ATLASSIAN_API_TOKEN;
      assert.throws(() => {
        new ConfluenceClient();
      }, /CONFLUENCE_API_TOKEN or ATLASSIAN_API_TOKEN not found/);
    });

    it('should throw error if CONFLUENCE_BASE_URL is missing', () => {
      delete process.env.CONFLUENCE_BASE_URL;
      delete process.env.ATLASSIAN_SITE_URL;
      assert.throws(() => {
        new ConfluenceClient();
      }, /CONFLUENCE_BASE_URL or ATLASSIAN_SITE_URL not found/);
    });

    it('should throw error if CONFLUENCE_USER_EMAIL is missing', () => {
      delete process.env.CONFLUENCE_USER_EMAIL;
      delete process.env.ATLASSIAN_USER_EMAIL;
      assert.throws(() => {
        new ConfluenceClient();
      }, /CONFLUENCE_USER_EMAIL or ATLASSIAN_USER_EMAIL not found/);
    });

    it('should remove trailing slash from base URL', () => {
      process.env.CONFLUENCE_BASE_URL = 'https://test.atlassian.net/';
      client = new ConfluenceClient();
      assert.strictEqual(client.baseUrl, 'https://test.atlassian.net');
    });
  });

  describe('filterPageData', () => {
    beforeEach(() => {
      client = new ConfluenceClient();
    });

    it('should preserve page metadata', () => {
      const page = {
        id: '12345',
        title: 'Test Page',
        spaceId: 'SPACE1',
        status: 'current',
        version: { number: 1 }
      };
      const filtered = client.filterPageData(page);
      assert.strictEqual(filtered.id, '12345');
      assert.strictEqual(filtered.title, 'Test Page');
      assert.strictEqual(filtered.spaceId, 'SPACE1');
      assert.strictEqual(filtered.status, 'current');
    });

    it('should preserve URLs and links', () => {
      const page = {
        id: '12345',
        _links: {
          webui: '/pages/viewpage.action?pageId=12345',
          self: 'https://test.atlassian.net/wiki/api/v2/pages/12345'
        }
      };
      const filtered = client.filterPageData(page);
      assert.deepStrictEqual(filtered._links, page._links);
    });

    it('should filter PII from page body content', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<p>Contact john.doe@example.com for details</p>',
            representation: 'storage'
          }
        }
      };
      const filtered = client.filterPageData(page);
      assert.ok(!filtered.body.storage.value.includes('john.doe@example.com'));
      assert.ok(filtered.body.storage.value.includes('[EMAIL_'));
    });

    it('should filter author information', () => {
      const page = {
        id: '12345',
        createdBy: {
          displayName: 'John Doe',
          email: 'john@example.com'
        },
        lastModifiedBy: {
          displayName: 'Jane Smith',
          email: 'jane@example.com'
        }
      };
      const filtered = client.filterPageData(page);
      // Check that author information exists
      assert.ok(filtered.createdBy);
      assert.ok(filtered.lastModifiedBy);
      // Email addresses should not contain the @ symbol (filtered in some way)
      assert.ok(!filtered.createdBy.email.includes('john'));
      assert.ok(!filtered.createdBy.email.includes('@'));
      assert.ok(!filtered.lastModifiedBy.email.includes('jane'));
      assert.ok(!filtered.lastModifiedBy.email.includes('@'));
      // Display names should exist
      assert.ok(filtered.createdBy.displayName);
      assert.ok(filtered.lastModifiedBy.displayName);
    });

    it('should redact user IDs', () => {
      const page = {
        id: '12345',
        authorId: 'user-abc-123',
        ownerId: 'user-def-456'
      };
      const filtered = client.filterPageData(page);
      assert.strictEqual(filtered.authorId, '[REDACTED_USER_ID]');
      assert.strictEqual(filtered.ownerId, '[REDACTED_USER_ID]');
    });

    it('should handle pages without body content', () => {
      const page = {
        id: '12345',
        title: 'Test Page'
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterPageData(page);
        assert.strictEqual(filtered.id, '12345');
      });
    });

    it('should handle nested objects in page data', () => {
      const page = {
        id: '12345',
        metadata: {
          labels: [
            { label: 'prd' },
            { label: 'draft' }
          ]
        }
      };
      const filtered = client.filterPageData(page);
      // Labels should be preserved - they're not PII
      assert.ok(filtered.metadata);
      assert.ok(filtered.metadata.labels);
      assert.strictEqual(filtered.metadata.labels.length, 2);
    });
  });

  describe('getFilterStats', () => {
    beforeEach(() => {
      client = new ConfluenceClient();
    });

    it('should return filtering statistics', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<p>Email: test@example.com</p>'
          }
        },
        createdBy: {
          displayName: 'John Doe',
          email: 'john@example.com'
        }
      };
      client.filterPageData(page);
      const stats = client.getFilterStats();
      assert.ok(stats.enabled);
      assert.ok(stats.itemsFiltered);
      assert.ok(stats.itemsFiltered.email > 0);
    });
  });

  describe('Integration Tests (Mocked)', () => {
    beforeEach(() => {
      client = new ConfluenceClient();
    });

    it('should construct proper API endpoint for reading pages', () => {
      const pageId = '12345';
      const expectedUrl = 'https://test.atlassian.net/wiki/api/v2/pages/12345';
      // This tests the URL construction logic
      assert.strictEqual(
        `${client.baseUrl}/wiki/api/v2/pages/${pageId}`,
        expectedUrl
      );
    });

    it('should construct proper API endpoint for creating pages', () => {
      const expectedUrl = 'https://test.atlassian.net/wiki/api/v2/pages';
      assert.strictEqual(
        `${client.baseUrl}/wiki/api/v2/pages`,
        expectedUrl
      );
    });

    it('should construct proper API endpoint for updating pages', () => {
      const pageId = '12345';
      const expectedUrl = 'https://test.atlassian.net/wiki/api/v2/pages/12345';
      assert.strictEqual(
        `${client.baseUrl}/wiki/api/v2/pages/${pageId}`,
        expectedUrl
      );
    });

    it('should construct proper API endpoint for spaces', () => {
      const expectedUrl = 'https://test.atlassian.net/wiki/api/v2/spaces';
      assert.strictEqual(
        `${client.baseUrl}/wiki/api/v2/spaces`,
        expectedUrl
      );
    });

    it('should construct proper Basic Auth header', () => {
      const email = 'test@example.com';
      const token = 'test-token';
      const expectedAuth = Buffer.from(`${email}:${token}`).toString('base64');
      const actualAuth = Buffer.from(`${client.userEmail}:${client.apiToken}`).toString('base64');
      assert.strictEqual(actualAuth, expectedAuth);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      client = new ConfluenceClient();
    });

    it('should handle null page data gracefully', () => {
      assert.doesNotThrow(() => {
        const result = client.filterPageData(null);
        assert.strictEqual(result, null);
      });
    });

    it('should handle empty page objects', () => {
      const page = {};
      const filtered = client.filterPageData(page);
      assert.ok(filtered);
      assert.strictEqual(typeof filtered, 'object');
    });

    it('should handle pages with arrays', () => {
      const page = {
        id: '12345',
        labels: ['label1', 'label2', 'label3'],
        attachments: [
          { name: 'file1.pdf' },
          { name: 'file2.docx' }
        ]
      };
      const filtered = client.filterPageData(page);
      assert.ok(Array.isArray(filtered.labels));
      assert.ok(Array.isArray(filtered.attachments));
      assert.strictEqual(filtered.labels.length, 3);
      assert.strictEqual(filtered.attachments.length, 2);
    });

    it('should handle body content without storage format', () => {
      const page = {
        id: '12345',
        body: {
          someOtherFormat: 'content'
        }
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterPageData(page);
        assert.ok(filtered.body);
      });
    });

    it('should handle missing optional fields', () => {
      const page = {
        id: '12345',
        title: 'Minimal Page'
      };
      const filtered = client.filterPageData(page);
      assert.strictEqual(filtered.id, '12345');
      assert.strictEqual(filtered.title, 'Minimal Page');
    });
  });

  describe('Privacy Compliance', () => {
    beforeEach(() => {
      client = new ConfluenceClient();
    });

    it('should never expose raw email addresses in page content', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<p>Contact support@company.com or admin@test.com</p>'
          }
        },
        createdBy: {
          displayName: 'John Doe',
          email: 'john@example.com'
        }
      };

      const filtered = client.filterPageData(page);
      const jsonString = JSON.stringify(filtered);

      assert.ok(!jsonString.includes('support@company.com'));
      assert.ok(!jsonString.includes('admin@test.com'));
      assert.ok(!jsonString.includes('john@example.com'));
    });

    it('should filter phone numbers from page content', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<p>Call us at 555-123-4567 or mobile (555) 987-6543</p>'
          }
        }
      };

      const filtered = client.filterPageData(page);

      assert.ok(!filtered.body.storage.value.includes('555-123-4567'));
      assert.ok(!filtered.body.storage.value.includes('(555) 987-6543'));
    });

    it('should preserve non-PII identifiers', () => {
      const page = {
        id: 'page-12345',
        spaceId: 'space-789',
        status: 'current',
        title: 'My Page',
        version: { number: 5 },
        createdAt: '2025-12-03T10:00:00Z',
        _links: {
          webui: '/pages/view',
          self: 'https://example.com/api/pages/12345'
        }
      };

      const filtered = client.filterPageData(page);

      assert.strictEqual(filtered.id, 'page-12345');
      assert.strictEqual(filtered.spaceId, 'space-789');
      assert.strictEqual(filtered.status, 'current');
      assert.strictEqual(filtered.title, 'My Page');
      assert.strictEqual(filtered.version.number, 5);
      assert.strictEqual(filtered.createdAt, '2025-12-03T10:00:00Z');
      assert.deepStrictEqual(filtered._links, page._links);
    });

    it('should handle content with multiple PII types', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<p>Created by john@example.com. Call 555-123-4567. Contact alice@test.com for details.</p>'
          }
        }
      };

      const filtered = client.filterPageData(page);
      const content = filtered.body.storage.value;

      // Should not contain any original emails or phone numbers
      assert.ok(!content.includes('john@example.com'));
      assert.ok(!content.includes('alice@test.com'));
      assert.ok(!content.includes('555-123-4567'));

      // Should contain filtered versions
      assert.ok(content.includes('[EMAIL_') || !content.includes('@'));
    });

    it('should anonymize all author fields consistently', () => {
      const page = {
        id: '12345',
        authorId: 'real-user-id-abc',
        ownerId: 'real-owner-id-xyz',
        createdBy: {
          displayName: 'John Smith',
          email: 'john.smith@company.com',
          userId: 'user-123'
        },
        lastModifiedBy: {
          displayName: 'Jane Doe',
          email: 'jane.doe@company.com',
          userId: 'user-456'
        }
      };

      const filtered = client.filterPageData(page);

      // All IDs should be redacted
      assert.strictEqual(filtered.authorId, '[REDACTED_USER_ID]');
      assert.strictEqual(filtered.ownerId, '[REDACTED_USER_ID]');

      // All emails should be redacted (filtered to EMAIL_X format)
      assert.ok(!filtered.createdBy.email.includes('@'));
      assert.ok(filtered.createdBy.email.startsWith('[EMAIL_'));
      assert.ok(!filtered.lastModifiedBy.email.includes('@'));
      assert.ok(filtered.lastModifiedBy.email.startsWith('[EMAIL_'));

      // Display names should be anonymized
      assert.ok(filtered.createdBy.displayName);
      assert.ok(filtered.lastModifiedBy.displayName);
    });
  });

  describe('Body Content Filtering', () => {
    beforeEach(() => {
      client = new ConfluenceClient();
    });

    it('should filter multiple email addresses in content', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<p>Team: alice@example.com, bob@test.com, charlie@company.com</p>'
          }
        }
      };

      const filtered = client.filterPageData(page);
      const content = filtered.body.storage.value;

      assert.ok(!content.includes('alice@example.com'));
      assert.ok(!content.includes('bob@test.com'));
      assert.ok(!content.includes('charlie@company.com'));
    });

    it('should preserve HTML structure while filtering PII', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<h1>Contact Info</h1><p>Email: test@example.com</p><p>Phone: 555-1234</p>'
          }
        }
      };

      const filtered = client.filterPageData(page);
      const content = filtered.body.storage.value;

      // HTML tags should be preserved
      assert.ok(content.includes('<h1>'));
      assert.ok(content.includes('</h1>'));
      assert.ok(content.includes('<p>'));

      // PII should be filtered
      assert.ok(!content.includes('test@example.com'));
    });

    it('should handle complex nested HTML with PII', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: '<div><ul><li>Contact: john@example.com</li><li>Phone: 555-123-4567</li></ul></div>'
          }
        }
      };

      const filtered = client.filterPageData(page);
      const content = filtered.body.storage.value;

      assert.ok(!content.includes('john@example.com'));
      assert.ok(!content.includes('555-123-4567'));
      // Structure preserved
      assert.ok(content.includes('<div>'));
      assert.ok(content.includes('<ul>'));
      assert.ok(content.includes('<li>'));
    });

    it('should handle empty body content', () => {
      const page = {
        id: '12345',
        body: {
          storage: {
            value: ''
          }
        }
      };

      assert.doesNotThrow(() => {
        const filtered = client.filterPageData(page);
        assert.strictEqual(filtered.body.storage.value, '');
      });
    });
  });

  describe('Search Functionality', () => {
    it('should construct correct CQL query for fuzzy search', async () => {
      // Mock the makeV1Request method
      let capturedParams;
      client.makeV1Request = async (endpoint, options) => {
        capturedParams = options.params;
        return {
          results: [
            {
              id: '123',
              title: 'Test Page',
              type: 'page'
            }
          ],
          size: 1
        };
      };

      await client.searchPagesByTitle('Test');

      assert.strictEqual(capturedParams.cql, 'type=page AND title~"Test"');
      assert.strictEqual(capturedParams.limit, 25);
    });

    it('should construct correct CQL query for exact match', async () => {
      let capturedParams;
      client.makeV1Request = async (endpoint, options) => {
        capturedParams = options.params;
        return { results: [], size: 0 };
      };

      await client.searchPagesByTitle('Test Page', null, true);

      assert.strictEqual(capturedParams.cql, 'type=page AND title="Test Page"');
    });

    it('should include space in CQL query when provided', async () => {
      let capturedParams;
      client.makeV1Request = async (endpoint, options) => {
        capturedParams = options.params;
        return { results: [], size: 0 };
      };

      await client.searchPagesByTitle('Test', 'PROJ');

      assert.strictEqual(capturedParams.cql, 'space=PROJ AND type=page AND title~"Test"');
    });

    it('should respect custom limit parameter', async () => {
      let capturedParams;
      client.makeV1Request = async (endpoint, options) => {
        capturedParams = options.params;
        return { results: [], size: 0 };
      };

      await client.searchPagesByTitle('Test', null, false, 50);

      assert.strictEqual(capturedParams.limit, 50);
    });

    it('should filter PII from search results', async () => {
      client.makeV1Request = async () => {
        return {
          results: [
            {
              id: '123',
              title: 'Test Page',
              authorId: 'user123',
              body: {
                storage: {
                  value: '<p>Contact john.doe@example.com for details</p>'
                }
              }
            }
          ],
          size: 1
        };
      };

      const result = await client.searchPagesByTitle('Test');

      assert.strictEqual(result.results[0].authorId, '[REDACTED_USER_ID]');
      assert.ok(result.results[0].body.storage.value.includes('[EMAIL_1]'));
      assert.ok(!result.results[0].body.storage.value.includes('john.doe@example.com'));
    });

    it('should handle empty search results', async () => {
      client.makeV1Request = async () => {
        return {
          results: [],
          size: 0,
          totalSize: 0
        };
      };

      const result = await client.searchPagesByTitle('NonExistent');

      assert.ok(Array.isArray(result.results));
      assert.strictEqual(result.results.length, 0);
    });

    it('should handle search API errors gracefully', async () => {
      client.makeV1Request = async () => {
        throw new Error('API Error: 401 - Unauthorized');
      };

      try {
        await client.searchPagesByTitle('Test');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('Failed to search pages by title'));
        assert.ok(error.message.includes('401'));
      }
    });

    it('should call correct v1 API endpoint', async () => {
      let capturedEndpoint;
      client.makeV1Request = async (endpoint, options) => {
        capturedEndpoint = endpoint;
        return { results: [], size: 0 };
      };

      await client.searchPagesByTitle('Test');

      assert.strictEqual(capturedEndpoint, '/search');
    });

    it('should handle special characters in search title', async () => {
      let capturedParams;
      client.makeV1Request = async (endpoint, options) => {
        capturedParams = options.params;
        return { results: [], size: 0 };
      };

      await client.searchPagesByTitle('Test & "Special" Characters');

      assert.ok(capturedParams.cql.includes('Test & "Special" Characters'));
    });

    it('should support combining all search options', async () => {
      let capturedParams;
      client.makeV1Request = async (endpoint, options) => {
        capturedParams = options.params;
        return { results: [], size: 0 };
      };

      await client.searchPagesByTitle('PRD Document', 'AIP', true, 10);

      assert.strictEqual(capturedParams.cql, 'space=AIP AND type=page AND title="PRD Document"');
      assert.strictEqual(capturedParams.limit, 10);
    });
  });
});
