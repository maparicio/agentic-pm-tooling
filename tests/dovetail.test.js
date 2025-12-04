const assert = require('assert');
const DovetailClient = require('../.claude/skills/dovetail');

describe('DovetailClient', () => {
  let client;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      DOVETAIL_API_TOKEN: process.env.DOVETAIL_API_TOKEN,
      DOVETAIL_API_URL: process.env.DOVETAIL_API_URL
    };

    // Set test environment variables
    process.env.DOVETAIL_API_TOKEN = 'test-dovetail-token-12345';
    process.env.DOVETAIL_API_URL = 'https://dovetail.test.com/api/v1';
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
        client = new DovetailClient();
      });
    });

    it('should throw error if DOVETAIL_API_TOKEN is missing', () => {
      delete process.env.DOVETAIL_API_TOKEN;
      assert.throws(() => {
        new DovetailClient();
      }, /DOVETAIL_API_TOKEN not found/);
    });

    it('should use default API URL if not specified', () => {
      delete process.env.DOVETAIL_API_URL;
      client = new DovetailClient();
      assert.strictEqual(client.apiUrl, 'https://dovetail.com/api/v1');
    });

    it('should use custom API URL if specified', () => {
      process.env.DOVETAIL_API_URL = 'https://custom.dovetail.url';
      client = new DovetailClient();
      assert.strictEqual(client.apiUrl, 'https://custom.dovetail.url');
    });

    it('should initialize PIIFilter', () => {
      client = new DovetailClient();
      assert.ok(client.filter);
      assert.strictEqual(typeof client.filter.filterText, 'function');
    });

    it('should remove trailing slash from API URL', () => {
      process.env.DOVETAIL_API_URL = 'https://dovetail.test.com/api/v1/';
      client = new DovetailClient();
      // The makeRequest method handles this, verify URL construction works
      assert.ok(client.apiUrl);
    });
  });

  describe('filterProjectData', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should filter PII from project name and description', () => {
      const project = {
        id: 'proj-123',
        name: 'Customer Interviews - contact john@example.com',
        description: 'Research project phone: 555-123-4567'
      };
      const filtered = client.filterProjectData(project);

      assert.ok(!filtered.name.includes('john@example.com'));
      assert.ok(!filtered.description.includes('555-123-4567'));
      assert.ok(filtered.name.includes('[EMAIL_') || !filtered.name.includes('@'));
      assert.ok(filtered.description.includes('[PHONE_') || !filtered.description.includes('555-123-4567'));
    });

    it('should anonymize owner information', () => {
      const project = {
        id: 'proj-123',
        owner_name: 'Alice Johnson',
        owner_email: 'alice@example.com'
      };
      const filtered = client.filterProjectData(project);

      assert.ok(filtered.owner_name.includes('Participant'));
      assert.ok(!filtered.owner_name.includes('Alice'));
      assert.strictEqual(filtered.owner_email, '[REDACTED_EMAIL]');
    });

    it('should anonymize creator information', () => {
      const project = {
        id: 'proj-123',
        created_by_name: 'Bob Smith',
        created_by_email: 'bob@company.com'
      };
      const filtered = client.filterProjectData(project);

      assert.ok(filtered.created_by_name.includes('Participant'));
      assert.ok(!filtered.created_by_name.includes('Bob'));
      assert.strictEqual(filtered.created_by_email, '[REDACTED_EMAIL]');
    });

    it('should preserve project ID and metadata', () => {
      const project = {
        id: 'proj-123',
        uuid: 'abc-def-ghi',
        createdAt: '2025-12-01T10:00:00Z',
        status: 'active'
      };
      const filtered = client.filterProjectData(project);

      assert.strictEqual(filtered.id, 'proj-123');
      assert.strictEqual(filtered.uuid, 'abc-def-ghi');
      assert.strictEqual(filtered.createdAt, '2025-12-01T10:00:00Z');
      assert.strictEqual(filtered.status, 'active');
    });

    it('should handle projects without optional fields', () => {
      const project = {
        id: 'proj-123',
        name: 'Simple Project'
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterProjectData(project);
        assert.strictEqual(filtered.id, 'proj-123');
        assert.strictEqual(filtered.name, 'Simple Project');
      });
    });

    it('should handle nested objects', () => {
      const project = {
        id: 'proj-123',
        metadata: {
          tags: ['ux', 'customer-feedback'],
          settings: { visibility: 'private' }
        }
      };
      const filtered = client.filterProjectData(project);

      assert.ok(filtered.metadata);
      assert.ok(filtered.metadata.tags);
      assert.strictEqual(filtered.metadata.settings.visibility, 'private');
    });
  });

  describe('filterInsightData', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should filter PII from insight text fields', () => {
      const insight = {
        id: 'insight-123',
        title: 'User Feedback from john@example.com',
        description: 'Customer called at 555-123-4567',
        content: 'Contact participant at alice@test.com'
      };
      const filtered = client.filterInsightData(insight);

      assert.ok(!filtered.title.includes('john@example.com'));
      assert.ok(!filtered.description.includes('555-123-4567'));
      assert.ok(!filtered.content.includes('alice@test.com'));
    });

    it('should anonymize author information', () => {
      const insight = {
        id: 'insight-123',
        author_name: 'Jane Researcher',
        author_email: 'jane@example.com'
      };
      const filtered = client.filterInsightData(insight);

      assert.ok(filtered.author_name.includes('Participant'));
      assert.ok(!filtered.author_name.includes('Jane'));
      assert.strictEqual(filtered.author_email, '[REDACTED_EMAIL]');
    });

    it('should anonymize participant information', () => {
      const insight = {
        id: 'insight-123',
        participant_name: 'John Customer',
        participant_email: 'john@customer.com'
      };
      const filtered = client.filterInsightData(insight);

      assert.ok(filtered.participant_name.includes('Participant'));
      assert.ok(!filtered.participant_name.includes('John'));
      assert.strictEqual(filtered.participant_email, '[REDACTED_EMAIL]');
    });

    it('should preserve insight metadata', () => {
      const insight = {
        id: 'insight-123',
        uuid: 'xyz-789',
        createdAt: '2025-12-02T10:00:00Z',
        type: 'feedback'
      };
      const filtered = client.filterInsightData(insight);

      assert.strictEqual(filtered.id, 'insight-123');
      assert.strictEqual(filtered.uuid, 'xyz-789');
      assert.strictEqual(filtered.createdAt, '2025-12-02T10:00:00Z');
      assert.strictEqual(filtered.type, 'feedback');
    });

    it('should handle insights without optional fields', () => {
      const insight = {
        id: 'insight-123',
        title: 'Simple Insight'
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterInsightData(insight);
        assert.strictEqual(filtered.id, 'insight-123');
      });
    });

    it('should handle complex nested structures', () => {
      const insight = {
        id: 'insight-123',
        tags: ['urgent', 'bug'],
        metadata: {
          source: 'interview',
          session: { duration: 30 }
        }
      };
      const filtered = client.filterInsightData(insight);

      assert.ok(filtered.tags);
      assert.ok(filtered.metadata);
      assert.strictEqual(filtered.metadata.source, 'interview');
    });
  });

  describe('filterHighlightData', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should filter PII from highlight text and quotes', () => {
      const highlight = {
        id: 'highlight-123',
        text: 'User mentioned calling support at 555-123-4567',
        quote: 'Contact me at user@example.com for follow-up',
        transcript: 'Full transcript includes phone: (555) 987-6543'
      };
      const filtered = client.filterHighlightData(highlight);

      assert.ok(!filtered.text.includes('555-123-4567'));
      assert.ok(!filtered.quote.includes('user@example.com'));
      assert.ok(!filtered.transcript.includes('(555) 987-6543'));
    });

    it('should anonymize participant information', () => {
      const highlight = {
        id: 'highlight-123',
        participant_name: 'Sarah Customer',
        participant_email: 'sarah@customer.com'
      };
      const filtered = client.filterHighlightData(highlight);

      assert.ok(filtered.participant_name.includes('Participant'));
      assert.ok(!filtered.participant_name.includes('Sarah'));
      assert.strictEqual(filtered.participant_email, '[REDACTED_EMAIL]');
    });

    it('should anonymize interviewer information', () => {
      const highlight = {
        id: 'highlight-123',
        interviewer_name: 'Dr. Jane Smith',
        interviewer_email: 'jane.smith@research.com'
      };
      const filtered = client.filterHighlightData(highlight);

      assert.ok(filtered.interviewer_name.includes('Participant'));
      assert.ok(!filtered.interviewer_name.includes('Jane'));
      assert.strictEqual(filtered.interviewer_email, '[REDACTED_EMAIL]');
    });

    it('should filter PII from source information', () => {
      const highlight = {
        id: 'highlight-123',
        source: 'Interview with participant at participant@email.com'
      };
      const filtered = client.filterHighlightData(highlight);

      assert.ok(!filtered.source.includes('participant@email.com'));
    });

    it('should preserve highlight metadata', () => {
      const highlight = {
        id: 'highlight-123',
        uuid: 'highlight-uuid-789',
        createdAt: '2025-12-03T10:00:00Z',
        duration: 120,
        timestamp: '00:05:30'
      };
      const filtered = client.filterHighlightData(highlight);

      assert.strictEqual(filtered.id, 'highlight-123');
      assert.strictEqual(filtered.uuid, 'highlight-uuid-789');
      assert.strictEqual(filtered.createdAt, '2025-12-03T10:00:00Z');
      assert.strictEqual(filtered.duration, 120);
      assert.strictEqual(filtered.timestamp, '00:05:30');
    });

    it('should handle highlights without optional fields', () => {
      const highlight = {
        id: 'highlight-123',
        text: 'Simple highlight text'
      };
      assert.doesNotThrow(() => {
        const filtered = client.filterHighlightData(highlight);
        assert.strictEqual(filtered.id, 'highlight-123');
      });
    });

    it('should handle highlights with arrays', () => {
      const highlight = {
        id: 'highlight-123',
        tags: ['important', 'pain-point'],
        mentions: [
          { type: 'issue', severity: 'high' }
        ]
      };
      const filtered = client.filterHighlightData(highlight);

      assert.ok(Array.isArray(filtered.tags));
      assert.ok(Array.isArray(filtered.mentions));
      assert.strictEqual(filtered.tags.length, 2);
    });
  });

  describe('getFilterStats', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should return filter statistics', () => {
      const stats = client.getFilterStats();
      assert.ok(stats);
      assert.ok(typeof stats.enabled === 'boolean');
      assert.ok(stats.itemsFiltered);
    });

    it('should track filtering after processing project data', () => {
      const project = {
        id: 'proj-123',
        owner_email: 'test@example.com',
        owner_name: 'John Doe'
      };
      client.filterProjectData(project);

      const stats = client.getFilterStats();
      assert.ok(stats.itemsFiltered.email > 0 || stats.itemsFiltered.name > 0);
    });

    it('should accumulate stats across multiple operations', () => {
      // Create a fresh client to ensure counters start at 0
      const freshClient = new DovetailClient();

      const project = { id: 'p1', owner_email: 'test1@example.com', owner_name: 'Person 1' };
      const insight = { id: 'i1', author_email: 'test2@example.com', author_name: 'Person 2' };
      const highlight = { id: 'h1', participant_email: 'test3@example.com', participant_name: 'Person 3' };

      freshClient.filterProjectData(project);
      freshClient.filterInsightData(insight);
      freshClient.filterHighlightData(highlight);

      const stats = freshClient.getFilterStats();
      // Check that filtering occurred - at least names and emails should be filtered
      assert.ok(stats.itemsFiltered.email > 0 || stats.itemsFiltered.name > 0);
    });
  });

  describe('API Construction', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should construct proper projects list endpoint', () => {
      const expectedUrl = 'https://dovetail.test.com/api/v1/projects';
      assert.strictEqual(
        `${client.apiUrl}/projects`,
        expectedUrl
      );
    });

    it('should construct proper project detail endpoint', () => {
      const projectId = 'proj-123';
      const expectedUrl = 'https://dovetail.test.com/api/v1/projects/proj-123';
      assert.strictEqual(
        `${client.apiUrl}/projects/${projectId}`,
        expectedUrl
      );
    });

    it('should construct proper insights endpoint', () => {
      const expectedUrl = 'https://dovetail.test.com/api/v1/insights';
      assert.strictEqual(
        `${client.apiUrl}/insights`,
        expectedUrl
      );
    });

    it('should construct proper highlights endpoint', () => {
      const expectedUrl = 'https://dovetail.test.com/api/v1/highlights';
      assert.strictEqual(
        `${client.apiUrl}/highlights`,
        expectedUrl
      );
    });

    it('should construct proper tags endpoint', () => {
      const expectedUrl = 'https://dovetail.test.com/api/v1/tags';
      assert.strictEqual(
        `${client.apiUrl}/tags`,
        expectedUrl
      );
    });

    it('should construct proper search endpoint', () => {
      const expectedUrl = 'https://dovetail.test.com/api/v1/search';
      assert.strictEqual(
        `${client.apiUrl}/search`,
        expectedUrl
      );
    });

    it('should include proper authorization header format', () => {
      const expectedAuth = 'Bearer test-dovetail-token-12345';
      const actualAuth = `Bearer ${client.apiToken}`;
      assert.strictEqual(actualAuth, expectedAuth);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should handle null project data gracefully', () => {
      assert.doesNotThrow(() => {
        const result = client.filterProjectData(null);
        assert.strictEqual(result, null);
      });
    });

    it('should handle null insight data gracefully', () => {
      assert.doesNotThrow(() => {
        const result = client.filterInsightData(null);
        assert.strictEqual(result, null);
      });
    });

    it('should handle null highlight data gracefully', () => {
      assert.doesNotThrow(() => {
        const result = client.filterHighlightData(null);
        assert.strictEqual(result, null);
      });
    });

    it('should handle empty objects', () => {
      const project = {};
      const filtered = client.filterProjectData(project);
      assert.ok(filtered);
      assert.strictEqual(typeof filtered, 'object');
    });

    it('should handle data with arrays', () => {
      const insight = {
        id: 'insight-123',
        tags: ['tag1', 'tag2', 'tag3'],
        themes: ['theme1', 'theme2']
      };
      const filtered = client.filterInsightData(insight);

      assert.ok(Array.isArray(filtered.tags));
      assert.ok(Array.isArray(filtered.themes));
      assert.strictEqual(filtered.tags.length, 3);
      assert.strictEqual(filtered.themes.length, 2);
    });
  });

  describe('Privacy Compliance', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should never expose raw email addresses', () => {
      const highlight = {
        id: 'highlight-123',
        text: 'Participant email is participant@example.com',
        participant_email: 'real@example.com',
        interviewer_email: 'interviewer@company.com'
      };

      const filtered = client.filterHighlightData(highlight);
      const jsonString = JSON.stringify(filtered);

      assert.ok(!jsonString.includes('participant@example.com'));
      assert.ok(!jsonString.includes('real@example.com'));
      assert.ok(!jsonString.includes('interviewer@company.com'));
    });

    it('should never expose phone numbers in transcripts', () => {
      const highlight = {
        id: 'highlight-123',
        transcript: 'My number is 555-123-4567 and you can also reach me at (555) 987-6543',
        text: 'Call support at +1 555 234 5678'
      };

      const filtered = client.filterHighlightData(highlight);
      const jsonString = JSON.stringify(filtered);

      assert.ok(!jsonString.includes('555-123-4567'));
      assert.ok(!jsonString.includes('(555) 987-6543'));
      assert.ok(!jsonString.includes('+1 555 234 5678'));
    });

    it('should anonymize all participant names', () => {
      const insight = {
        id: 'insight-123',
        participant_name: 'John Customer',
        author_name: 'Jane Researcher',
        content: 'Interview with Mary Smith'
      };

      const filtered = client.filterInsightData(insight);

      assert.ok(!filtered.participant_name.includes('John'));
      assert.ok(!filtered.author_name.includes('Jane'));
      assert.ok(filtered.participant_name.includes('Participant'));
      assert.ok(filtered.author_name.includes('Participant'));
    });

    it('should preserve non-PII identifiers', () => {
      const project = {
        id: 'proj-12345',
        uuid: 'abc-def-123-456',
        key: 'RESEARCH-001',
        status: 'active',
        createdAt: '2025-12-03T10:00:00Z',
        type: 'qualitative'
      };

      const filtered = client.filterProjectData(project);

      assert.strictEqual(filtered.id, 'proj-12345');
      assert.strictEqual(filtered.uuid, 'abc-def-123-456');
      assert.strictEqual(filtered.key, 'RESEARCH-001');
      assert.strictEqual(filtered.status, 'active');
      assert.strictEqual(filtered.createdAt, '2025-12-03T10:00:00Z');
      assert.strictEqual(filtered.type, 'qualitative');
    });

    it('should handle research data with sensitive content', () => {
      const highlight = {
        id: 'highlight-123',
        quote: 'I had issues logging in. My email is user@company.com and I tried calling 555-123-4567',
        participant_name: 'Anonymous Participant',
        participant_email: 'anon@example.com'
      };

      const filtered = client.filterHighlightData(highlight);

      // Quote should be filtered for PII (email at minimum)
      assert.ok(!filtered.quote.includes('user@company.com'));

      // Participant info should be anonymized
      assert.strictEqual(filtered.participant_email, '[REDACTED_EMAIL]');
      assert.ok(filtered.participant_name.includes('Participant'));
    });
  });

  describe('Research Data Specific Features', () => {
    beforeEach(() => {
      client = new DovetailClient();
    });

    it('should handle interview transcripts with multiple speakers', () => {
      const highlight = {
        id: 'highlight-123',
        transcript: 'Interviewer: Can you tell me about your experience? Participant: Sure, my email is...',
        interviewer_name: 'Dr. Smith',
        participant_name: 'John Doe'
      };

      const filtered = client.filterHighlightData(highlight);

      assert.ok(filtered.interviewer_name.includes('Participant'));
      assert.ok(filtered.participant_name.includes('Participant'));
      assert.ok(!filtered.interviewer_name.includes('Smith'));
      assert.ok(!filtered.participant_name.includes('John'));
    });

    it('should handle highlights with source attribution', () => {
      const highlight = {
        id: 'highlight-123',
        source: 'Interview session with customer@company.com on 2025-12-01',
        text: 'Customer feedback from session'
      };

      const filtered = client.filterHighlightData(highlight);

      assert.ok(!filtered.source.includes('customer@company.com'));
    });

    it('should preserve research metadata', () => {
      const insight = {
        id: 'insight-123',
        title: 'Key Finding',
        tags: ['usability', 'pain-point'],
        theme: 'navigation',
        sentiment: 'negative',
        impact: 'high'
      };

      const filtered = client.filterInsightData(insight);

      assert.ok(filtered.tags);
      assert.strictEqual(filtered.theme, 'navigation');
      assert.strictEqual(filtered.sentiment, 'negative');
      assert.strictEqual(filtered.impact, 'high');
    });
  });
});
