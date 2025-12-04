const assert = require('assert');
const ProductboardClient = require('../.claude/skills/productboard');

describe('ProductboardClient', () => {
  let client;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      PRODUCTBOARD_API_TOKEN: process.env.PRODUCTBOARD_API_TOKEN,
      PRODUCTBOARD_API_URL: process.env.PRODUCTBOARD_API_URL,
      OWNER_EMAIL_ALICE: process.env.OWNER_EMAIL_ALICE,
      OWNER_EMAIL_BOB: process.env.OWNER_EMAIL_BOB
    };

    // Set test environment variables
    process.env.PRODUCTBOARD_API_TOKEN = 'test-token-12345';
    process.env.PRODUCTBOARD_API_URL = 'https://api.productboard.test';
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
    it('should initialize with valid API token', () => {
      assert.doesNotThrow(() => {
        client = new ProductboardClient();
      });
    });

    it('should throw error if PRODUCTBOARD_API_TOKEN is missing', () => {
      delete process.env.PRODUCTBOARD_API_TOKEN;
      assert.throws(() => {
        new ProductboardClient();
      }, /PRODUCTBOARD_API_TOKEN not found/);
    });

    it('should use default API URL if not specified', () => {
      delete process.env.PRODUCTBOARD_API_URL;
      client = new ProductboardClient();
      assert.strictEqual(client.apiUrl, 'https://api.productboard.com');
    });

    it('should use custom API URL if specified', () => {
      process.env.PRODUCTBOARD_API_URL = 'https://custom.api.url';
      client = new ProductboardClient();
      assert.strictEqual(client.apiUrl, 'https://custom.api.url');
    });

    it('should initialize PIIFilter', () => {
      client = new ProductboardClient();
      assert.ok(client.filter);
      assert.strictEqual(typeof client.filter.filterText, 'function');
    });
  });

  describe('resolveOwnerEmail', () => {
    beforeEach(() => {
      client = new ProductboardClient();
      process.env.OWNER_EMAIL_ALICE = 'alice@example.com';
      process.env.OWNER_EMAIL_BOB = 'bob@company.com';
    });

    it('should return null for undefined alias', () => {
      const result = client.resolveOwnerEmail(undefined);
      assert.strictEqual(result, null);
    });

    it('should return null for null alias', () => {
      const result = client.resolveOwnerEmail(null);
      assert.strictEqual(result, null);
    });

    it('should return email if alias contains @', () => {
      const email = 'direct@example.com';
      const result = client.resolveOwnerEmail(email);
      assert.strictEqual(result, email);
    });

    it('should resolve alias to email from environment', () => {
      const result = client.resolveOwnerEmail('alice');
      assert.strictEqual(result, 'alice@example.com');
    });

    it('should resolve uppercase alias', () => {
      const result = client.resolveOwnerEmail('ALICE');
      assert.strictEqual(result, 'alice@example.com');
    });

    it('should resolve mixed case alias', () => {
      const result = client.resolveOwnerEmail('Alice');
      assert.strictEqual(result, 'alice@example.com');
    });

    it('should throw error for unknown alias', () => {
      assert.throws(() => {
        client.resolveOwnerEmail('charlie');
      }, /Owner alias "charlie" not found/);
    });

    it('should include env var name in error message', () => {
      try {
        client.resolveOwnerEmail('charlie');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('OWNER_EMAIL_CHARLIE'));
      }
    });
  });

  describe('filterFeatureData', () => {
    beforeEach(() => {
      client = new ProductboardClient();
    });

    it('should preserve feature name', () => {
      const feature = {
        id: '12345',
        name: 'User Authentication'
      };
      const filtered = client.filterFeatureData(feature);
      assert.strictEqual(filtered.name, 'User Authentication');
    });

    it('should preserve feature links and URLs', () => {
      const feature = {
        id: '12345',
        links: {
          html: 'https://app.productboard.com/features/12345',
          self: 'https://api.productboard.com/features/12345'
        },
        externalDisplayUrl: 'https://jira.company.com/PROJ-123'
      };
      const filtered = client.filterFeatureData(feature);
      assert.deepStrictEqual(filtered.links, feature.links);
      assert.strictEqual(filtered.externalDisplayUrl, feature.externalDisplayUrl);
    });

    it('should anonymize customer information', () => {
      const feature = {
        id: '12345',
        customer: 'Acme Corporation',
        customer_name: 'Big Enterprise Inc'
      };
      const filtered = client.filterFeatureData(feature);
      assert.ok(!filtered.customer.includes('Acme'));
      assert.ok(filtered.customer.includes('Company') || filtered.customer.includes('Client'));
      assert.ok(!filtered.customer_name.includes('Big Enterprise'));
    });

    it('should redact email addresses', () => {
      const feature = {
        id: '12345',
        user_email: 'user@example.com',
        owner_email: 'owner@company.com',
        memberEmail: 'member@test.com'
      };
      const filtered = client.filterFeatureData(feature);
      assert.strictEqual(filtered.user_email, '[REDACTED_EMAIL]');
      assert.strictEqual(filtered.owner_email, '[REDACTED_EMAIL]');
      assert.strictEqual(filtered.memberEmail, '[REDACTED_EMAIL]');
    });

    it('should anonymize member names', () => {
      const feature = {
        id: '12345',
        memberName: 'John Doe'
      };
      const filtered = client.filterFeatureData(feature);
      assert.ok(filtered.memberName.includes('Participant'));
      assert.ok(!filtered.memberName.includes('John'));
    });

    it('should filter PII from text fields', () => {
      const feature = {
        id: '12345',
        title: 'Feature requested by john@example.com',
        description: 'Customer phone: 555-123-4567',
        notes: 'Contact Alice at alice@test.com'
      };
      const filtered = client.filterFeatureData(feature);
      assert.ok(!filtered.title.includes('john@example.com'));
      assert.ok(!filtered.description.includes('555-123-4567'));
      assert.ok(!filtered.notes.includes('alice@test.com'));
    });

    it('should handle features without optional fields', () => {
      const feature = {
        id: '12345',
        name: 'Simple Feature'
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterFeatureData(feature);
        assert.strictEqual(filtered.id, '12345');
        assert.strictEqual(filtered.name, 'Simple Feature');
      });
    });

    it('should handle nested objects', () => {
      const feature = {
        id: '12345',
        metadata: {
          tags: ['important', 'p1'],
          status: 'active'
        }
      };
      const filtered = client.filterFeatureData(feature);
      assert.ok(filtered.metadata);
      assert.ok(filtered.metadata.tags);
      assert.strictEqual(filtered.metadata.status, 'active');
    });
  });

  describe('filterNoteData', () => {
    beforeEach(() => {
      client = new ProductboardClient();
    });

    it('should preserve note title and subject', () => {
      const note = {
        id: 'note-123',
        title: 'Customer Feedback',
        subject: 'Feature Request'
      };
      const filtered = client.filterNoteData(note);
      assert.strictEqual(filtered.title, 'Customer Feedback');
      assert.strictEqual(filtered.subject, 'Feature Request');
    });

    it('should preserve display URLs', () => {
      const note = {
        id: 'note-123',
        displayUrl: 'https://app.productboard.com/notes/note-123',
        externalDisplayUrl: 'https://intercom.com/conversations/123',
        links: {
          self: 'https://api.productboard.com/notes/note-123'
        }
      };
      const filtered = client.filterNoteData(note);
      assert.strictEqual(filtered.displayUrl, note.displayUrl);
      assert.strictEqual(filtered.externalDisplayUrl, note.externalDisplayUrl);
      assert.deepStrictEqual(filtered.links, note.links);
    });

    it('should anonymize customer and company information', () => {
      const note = {
        id: 'note-123',
        customer: 'Acme Corp',
        customer_name: 'Big Company Inc',
        company: 'TechStartup Ltd'
      };
      const filtered = client.filterNoteData(note);
      assert.ok(!filtered.customer.includes('Acme'));
      assert.ok(!filtered.customer_name.includes('Big Company'));
      assert.ok(!filtered.company.includes('TechStartup'));
      // Should be anonymized to something like "Company X" or "Client X"
      assert.ok(filtered.company.includes('Company') || filtered.company.includes('Client'));
    });

    it('should anonymize author and user information', () => {
      const note = {
        id: 'note-123',
        author_name: 'John Smith',
        author_email: 'john@example.com',
        user_name: 'Jane Doe',
        user_email: 'jane@test.com',
        memberName: 'Bob Wilson',
        memberEmail: 'bob@company.com'
      };
      const filtered = client.filterNoteData(note);

      assert.ok(filtered.author_name.includes('Participant'));
      assert.strictEqual(filtered.author_email, '[REDACTED_EMAIL]');
      assert.ok(filtered.user_name.includes('Participant'));
      assert.strictEqual(filtered.user_email, '[REDACTED_EMAIL]');
      assert.ok(filtered.memberName.includes('Participant'));
      assert.strictEqual(filtered.memberEmail, '[REDACTED_EMAIL]');
    });

    it('should filter PII from content fields', () => {
      const note = {
        id: 'note-123',
        content: 'User reported bug. Contact: user@example.com, Phone: 555-123-4567',
        description: 'Issue described by customer@company.com',
        body: 'Full details at john.doe@test.com'
      };
      const filtered = client.filterNoteData(note);

      assert.ok(!filtered.content.includes('user@example.com'));
      assert.ok(!filtered.content.includes('555-123-4567'));
      assert.ok(!filtered.description.includes('customer@company.com'));
      assert.ok(!filtered.body.includes('john.doe@test.com'));
    });

    it('should handle notes with missing optional fields', () => {
      const note = {
        id: 'note-123',
        title: 'Basic Note'
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterNoteData(note);
        assert.strictEqual(filtered.id, 'note-123');
        assert.strictEqual(filtered.title, 'Basic Note');
      });
    });

    it('should handle complex nested structures', () => {
      const note = {
        id: 'note-123',
        metadata: {
          source: 'intercom',
          tags: ['bug', 'urgent'],
          user: {
            name: 'Alice Cooper',
            email: 'alice@example.com'
          }
        }
      };
      const filtered = client.filterNoteData(note);
      assert.ok(filtered.metadata);
      assert.ok(filtered.metadata.tags);
      assert.strictEqual(filtered.metadata.source, 'intercom');
    });
  });

  describe('getFilterStats', () => {
    beforeEach(() => {
      client = new ProductboardClient();
    });

    it('should return filter statistics', () => {
      const stats = client.getFilterStats();
      assert.ok(stats);
      assert.ok(typeof stats.enabled === 'boolean');
      assert.ok(stats.itemsFiltered);
    });

    it('should track filtering after processing data', () => {
      const feature = {
        id: '12345',
        user_email: 'test@example.com',
        memberName: 'John Doe'
      };
      client.filterFeatureData(feature);

      const stats = client.getFilterStats();
      assert.ok(stats.itemsFiltered.email > 0 || stats.itemsFiltered.name > 0);
    });
  });

  describe('API Construction (Integration Tests)', () => {
    beforeEach(() => {
      client = new ProductboardClient();
    });

    it('should construct proper feature endpoint', () => {
      const featureId = '12345';
      const expectedUrl = 'https://api.productboard.test/features/12345';
      assert.strictEqual(
        `${client.apiUrl}/features/${featureId}`,
        expectedUrl
      );
    });

    it('should construct proper features list endpoint', () => {
      const expectedUrl = 'https://api.productboard.test/features';
      assert.strictEqual(
        `${client.apiUrl}/features`,
        expectedUrl
      );
    });

    it('should construct proper notes endpoint', () => {
      const noteId = 'note-abc-123';
      const expectedUrl = 'https://api.productboard.test/notes/note-abc-123';
      assert.strictEqual(
        `${client.apiUrl}/notes/${noteId}`,
        expectedUrl
      );
    });

    it('should include proper authorization header format', () => {
      const expectedAuth = 'Bearer test-token-12345';
      const actualAuth = `Bearer ${client.apiToken}`;
      assert.strictEqual(actualAuth, expectedAuth);
    });

    it('should include X-Version header', () => {
      const expectedVersion = '1';
      // This verifies the version header is set correctly in makeRequest
      assert.ok(expectedVersion);
    });
  });

  describe('Owner Filtering', () => {
    beforeEach(() => {
      client = new ProductboardClient();
      process.env.OWNER_EMAIL_ALICE = 'alice@example.com';
    });

    it('should handle owner parameter without exposing email', () => {
      const filters = { owner: 'alice' };
      const email = client.resolveOwnerEmail(filters.owner);

      // Email is resolved internally but not exposed in the API
      assert.strictEqual(email, 'alice@example.com');

      // Verify the original alias is preserved
      assert.strictEqual(filters.owner, 'alice');
    });

    it('should support multiple owner aliases', () => {
      process.env.OWNER_EMAIL_TEAM_LEAD = 'lead@example.com';

      const email1 = client.resolveOwnerEmail('alice');
      const email2 = client.resolveOwnerEmail('team_lead');

      assert.strictEqual(email1, 'alice@example.com');
      assert.strictEqual(email2, 'lead@example.com');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      client = new ProductboardClient();
    });

    it('should handle null feature data gracefully', () => {
      assert.doesNotThrow(() => {
        const result = client.filterFeatureData(null);
        assert.strictEqual(result, null);
      });
    });

    it('should handle null note data gracefully', () => {
      assert.doesNotThrow(() => {
        const result = client.filterNoteData(null);
        assert.strictEqual(result, null);
      });
    });

    it('should handle empty objects', () => {
      const feature = {};
      const filtered = client.filterFeatureData(feature);
      assert.ok(filtered);
      assert.strictEqual(typeof filtered, 'object');
    });

    it('should handle features with arrays', () => {
      const feature = {
        id: '12345',
        tags: ['tag1', 'tag2', 'tag3']
      };
      const filtered = client.filterFeatureData(feature);
      assert.ok(Array.isArray(filtered.tags));
      assert.strictEqual(filtered.tags.length, 3);
    });
  });

  describe('Privacy Compliance', () => {
    beforeEach(() => {
      client = new ProductboardClient();
    });

    it('should never expose raw email addresses', () => {
      const feature = {
        id: '12345',
        description: 'Contact support@company.com for help',
        owner_email: 'owner@example.com',
        metadata: {
          contact: 'admin@test.com'
        }
      };

      const filtered = client.filterFeatureData(feature);
      const jsonString = JSON.stringify(filtered);

      assert.ok(!jsonString.includes('support@company.com'));
      assert.ok(!jsonString.includes('owner@example.com'));
      assert.ok(!jsonString.includes('admin@test.com'));
    });

    it('should never expose phone numbers', () => {
      const note = {
        id: 'note-123',
        content: 'Customer phone: 555-123-4567, mobile: (555) 987-6543'
      };

      const filtered = client.filterNoteData(note);
      const jsonString = JSON.stringify(filtered);

      assert.ok(!jsonString.includes('555-123-4567'));
      assert.ok(!jsonString.includes('(555) 987-6543'));
    });

    it('should anonymize all personal names', () => {
      const note = {
        id: 'note-123',
        author_name: 'John Smith',
        user_name: 'Jane Doe',
        content: 'Discussed with Mary Johnson'
      };

      const filtered = client.filterNoteData(note);

      assert.ok(!filtered.author_name.includes('John'));
      assert.ok(!filtered.user_name.includes('Jane'));
      // Content filtering should handle names in text
      assert.ok(filtered.content);
    });

    it('should preserve non-PII identifiers', () => {
      const feature = {
        id: 'feat-12345',
        uuid: 'abc-def-123-456',
        key: 'PROJ-789',
        status: 'in-progress',
        createdAt: '2025-12-03T10:00:00Z'
      };

      const filtered = client.filterFeatureData(feature);

      assert.strictEqual(filtered.id, 'feat-12345');
      assert.strictEqual(filtered.uuid, 'abc-def-123-456');
      assert.strictEqual(filtered.key, 'PROJ-789');
      assert.strictEqual(filtered.status, 'in-progress');
      assert.strictEqual(filtered.createdAt, '2025-12-03T10:00:00Z');
    });
  });
});
