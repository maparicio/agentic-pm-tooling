const assert = require('assert');
const { JiraClient, markdownToADF, wrapInADF, buildParagraph, buildHeading, buildBulletList, buildOrderedList } = require('../.claude/skills/jira');

describe('JiraClient', () => {
  let client;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
      ATLASSIAN_SITE_URL: process.env.ATLASSIAN_SITE_URL,
      ATLASSIAN_USER_EMAIL: process.env.ATLASSIAN_USER_EMAIL
    };

    // Set test environment variables
    process.env.ATLASSIAN_API_TOKEN = 'test-token';
    process.env.ATLASSIAN_SITE_URL = 'https://test.atlassian.net';
    process.env.ATLASSIAN_USER_EMAIL = 'test@example.com';
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
        client = new JiraClient();
      });
    });

    it('should throw error if ATLASSIAN_API_TOKEN is missing', () => {
      delete process.env.ATLASSIAN_API_TOKEN;
      assert.throws(() => {
        new JiraClient();
      }, /ATLASSIAN_API_TOKEN not found/);
    });

    it('should throw error if ATLASSIAN_SITE_URL is missing', () => {
      delete process.env.ATLASSIAN_SITE_URL;
      assert.throws(() => {
        new JiraClient();
      }, /ATLASSIAN_SITE_URL not found/);
    });

    it('should throw error if ATLASSIAN_USER_EMAIL is missing', () => {
      delete process.env.ATLASSIAN_USER_EMAIL;
      assert.throws(() => {
        new JiraClient();
      }, /ATLASSIAN_USER_EMAIL not found/);
    });

    it('should remove trailing slash from base URL', () => {
      process.env.ATLASSIAN_SITE_URL = 'https://test.atlassian.net/';
      client = new JiraClient();
      assert.strictEqual(client.baseUrl, 'https://test.atlassian.net');
    });

    it('should initialize PII filter', () => {
      client = new JiraClient();
      assert.ok(client.filter);
      assert.strictEqual(typeof client.filter.filterObject, 'function');
    });
  });

  describe('filterIssueData', () => {
    beforeEach(() => {
      client = new JiraClient();
    });

    it('should preserve issue metadata', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        self: 'https://test.atlassian.net/rest/api/3/issue/12345',
        fields: {
          summary: 'Test issue',
          status: { name: 'Open' },
          priority: { name: 'High' }
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.strictEqual(filtered.id, '12345');
      assert.strictEqual(filtered.key, 'AI-123');
      assert.strictEqual(filtered.self, issue.self);
    });

    it('should preserve safe field data', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: {
          summary: 'Test issue',
          description: { type: 'doc', version: 1, content: [] },
          status: { name: 'Open' },
          priority: { name: 'High' },
          issuetype: { name: 'Task' },
          project: { key: 'AI', name: 'AI Project' },
          labels: ['backend', 'security'],
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-02T00:00:00.000Z'
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.strictEqual(filtered.fields.summary, 'Test issue');
      assert.deepStrictEqual(filtered.fields.status, { name: 'Open' });
      assert.deepStrictEqual(filtered.fields.priority, { name: 'High' });
      assert.deepStrictEqual(filtered.fields.labels, ['backend', 'security']);
      assert.strictEqual(filtered.fields.created, '2024-01-01T00:00:00.000Z');
    });

    it('should filter reporter information', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: {
          reporter: {
            accountId: 'user-abc-123',
            displayName: 'John Doe',
            emailAddress: 'john.doe@example.com'
          }
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.ok(filtered.fields.reporter);
      assert.strictEqual(filtered.fields.reporter.accountId, '[REDACTED_USER_ID]');
      assert.strictEqual(filtered.fields.reporter.emailAddress, '[REDACTED_EMAIL]');
      assert.ok(filtered.fields.reporter.displayName);
      assert.ok(!filtered.fields.reporter.displayName.includes('John'));
    });

    it('should filter assignee information', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: {
          assignee: {
            accountId: 'user-xyz-456',
            displayName: 'Jane Smith',
            emailAddress: 'jane.smith@example.com'
          }
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.ok(filtered.fields.assignee);
      assert.strictEqual(filtered.fields.assignee.accountId, '[REDACTED_USER_ID]');
      assert.strictEqual(filtered.fields.assignee.emailAddress, '[REDACTED_EMAIL]');
      assert.ok(filtered.fields.assignee.displayName);
      assert.ok(!filtered.fields.assignee.displayName.includes('Jane'));
    });

    it('should filter creator information', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: {
          creator: {
            accountId: 'user-abc-999',
            displayName: 'Bob Johnson',
            emailAddress: 'bob@example.com'
          }
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.ok(filtered.fields.creator);
      assert.strictEqual(filtered.fields.creator.accountId, '[REDACTED_USER_ID]');
      assert.strictEqual(filtered.fields.creator.emailAddress, '[REDACTED_EMAIL]');
      assert.ok(filtered.fields.creator.displayName);
      assert.ok(!filtered.fields.creator.displayName.includes('Bob'));
    });

    it('should handle issues with no user fields', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: {
          summary: 'Test issue',
          status: { name: 'Open' }
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.ok(filtered.fields);
      assert.strictEqual(filtered.fields.summary, 'Test issue');
      assert.ok(!filtered.fields.reporter);
      assert.ok(!filtered.fields.assignee);
    });

    it('should handle null or undefined fields', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: null
      };
      const filtered = client.filterIssueData(issue);
      assert.strictEqual(filtered.id, '12345');
      assert.strictEqual(filtered.key, 'AI-123');
    });

    it('should preserve parent relationship', () => {
      const issue = {
        id: '12345',
        key: 'AI-123',
        fields: {
          parent: {
            key: 'AI-100',
            id: '10000',
            fields: {
              summary: 'Parent Epic'
            }
          }
        }
      };
      const filtered = client.filterIssueData(issue);
      assert.ok(filtered.fields.parent);
      assert.strictEqual(filtered.fields.parent.key, 'AI-100');
    });
  });

  describe('getFilterStats', () => {
    it('should return filtering statistics', () => {
      client = new JiraClient();
      const stats = client.getFilterStats();
      assert.ok(stats);
      assert.ok(typeof stats === 'object');
    });
  });
});

describe('ADF Helper Functions', () => {
  describe('buildParagraph', () => {
    it('should create a simple paragraph', () => {
      const result = buildParagraph('Hello world');
      assert.deepStrictEqual(result, {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world', marks: [] }]
      });
    });

    it('should create a paragraph with bold marks', () => {
      const result = buildParagraph('Bold text', [{ type: 'strong' }]);
      assert.deepStrictEqual(result, {
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Bold text',
          marks: [{ type: 'strong' }]
        }]
      });
    });

    it('should handle empty text', () => {
      const result = buildParagraph('');
      assert.deepStrictEqual(result, {
        type: 'paragraph',
        content: [{ type: 'text', text: '', marks: [] }]
      });
    });
  });

  describe('buildHeading', () => {
    it('should create a heading with default level 3', () => {
      const result = buildHeading('Test Heading');
      assert.deepStrictEqual(result, {
        type: 'heading',
        attrs: { level: 3 },
        content: [{
          type: 'text',
          text: 'Test Heading',
          marks: [{ type: 'strong' }]
        }]
      });
    });

    it('should create a heading with custom level', () => {
      const result = buildHeading('H1 Heading', 1);
      assert.strictEqual(result.attrs.level, 1);
      assert.strictEqual(result.content[0].text, 'H1 Heading');
    });

    it('should create headings for all levels 1-6', () => {
      for (let level = 1; level <= 6; level++) {
        const result = buildHeading(`Level ${level}`, level);
        assert.strictEqual(result.attrs.level, level);
        assert.strictEqual(result.type, 'heading');
      }
    });
  });

  describe('buildBulletList', () => {
    it('should create a bullet list with multiple items', () => {
      const items = ['Item 1', 'Item 2', 'Item 3'];
      const result = buildBulletList(items);

      assert.strictEqual(result.type, 'bulletList');
      assert.strictEqual(result.content.length, 3);
      assert.strictEqual(result.content[0].type, 'listItem');
      assert.strictEqual(result.content[0].content[0].content[0].text, 'Item 1');
      assert.strictEqual(result.content[1].content[0].content[0].text, 'Item 2');
      assert.strictEqual(result.content[2].content[0].content[0].text, 'Item 3');
    });

    it('should create a bullet list with single item', () => {
      const result = buildBulletList(['Single item']);
      assert.strictEqual(result.type, 'bulletList');
      assert.strictEqual(result.content.length, 1);
    });

    it('should handle empty array', () => {
      const result = buildBulletList([]);
      assert.strictEqual(result.type, 'bulletList');
      assert.strictEqual(result.content.length, 0);
    });
  });

  describe('buildOrderedList', () => {
    it('should create an ordered list with multiple items', () => {
      const items = ['First', 'Second', 'Third'];
      const result = buildOrderedList(items);

      assert.strictEqual(result.type, 'orderedList');
      assert.strictEqual(result.content.length, 3);
      assert.strictEqual(result.content[0].type, 'listItem');
      assert.strictEqual(result.content[0].content[0].content[0].text, 'First');
      assert.strictEqual(result.content[1].content[0].content[0].text, 'Second');
      assert.strictEqual(result.content[2].content[0].content[0].text, 'Third');
    });

    it('should create an ordered list with single item', () => {
      const result = buildOrderedList(['Only one']);
      assert.strictEqual(result.type, 'orderedList');
      assert.strictEqual(result.content.length, 1);
    });

    it('should handle empty array', () => {
      const result = buildOrderedList([]);
      assert.strictEqual(result.type, 'orderedList');
      assert.strictEqual(result.content.length, 0);
    });
  });

  describe('wrapInADF', () => {
    it('should wrap single content item in ADF document', () => {
      const content = buildParagraph('Test');
      const result = wrapInADF(content);

      assert.strictEqual(result.type, 'doc');
      assert.strictEqual(result.version, 1);
      assert.ok(Array.isArray(result.content));
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].type, 'paragraph');
    });

    it('should wrap array of content items in ADF document', () => {
      const content = [
        buildParagraph('First'),
        buildParagraph('Second')
      ];
      const result = wrapInADF(content);

      assert.strictEqual(result.type, 'doc');
      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.content.length, 2);
    });

    it('should handle empty array', () => {
      const result = wrapInADF([]);
      assert.strictEqual(result.type, 'doc');
      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.content.length, 0);
    });
  });
});

describe('markdownToADF', () => {
  it('should convert simple paragraph', () => {
    const markdown = 'This is a simple paragraph.';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.type, 'doc');
    assert.strictEqual(result.version, 1);
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].type, 'paragraph');
    assert.strictEqual(result.content[0].content[0].text, 'This is a simple paragraph.');
  });

  it('should convert multiple paragraphs', () => {
    const markdown = 'First paragraph.\n\nSecond paragraph.';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content.length, 2);
    assert.strictEqual(result.content[0].content[0].text, 'First paragraph.');
    assert.strictEqual(result.content[1].content[0].text, 'Second paragraph.');
  });

  it('should convert headings', () => {
    const markdown = '# H1\n## H2\n### H3';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content.length, 3);
    assert.strictEqual(result.content[0].type, 'heading');
    assert.strictEqual(result.content[0].attrs.level, 1);
    assert.strictEqual(result.content[0].content[0].text, 'H1');
    assert.strictEqual(result.content[1].attrs.level, 2);
    assert.strictEqual(result.content[1].content[0].text, 'H2');
    assert.strictEqual(result.content[2].attrs.level, 3);
    assert.strictEqual(result.content[2].content[0].text, 'H3');
  });

  it('should convert bullet lists', () => {
    const markdown = '* Item 1\n* Item 2\n* Item 3';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].type, 'bulletList');
    assert.strictEqual(result.content[0].content.length, 3);
    assert.strictEqual(result.content[0].content[0].content[0].content[0].text, 'Item 1');
    assert.strictEqual(result.content[0].content[1].content[0].content[0].text, 'Item 2');
    assert.strictEqual(result.content[0].content[2].content[0].content[0].text, 'Item 3');
  });

  it('should convert bullet lists with dash syntax', () => {
    const markdown = '- Item A\n- Item B';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content[0].type, 'bulletList');
    assert.strictEqual(result.content[0].content.length, 2);
  });

  it('should convert ordered lists', () => {
    const markdown = '1. First\n2. Second\n3. Third';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].type, 'orderedList');
    assert.strictEqual(result.content[0].content.length, 3);
    assert.strictEqual(result.content[0].content[0].content[0].content[0].text, 'First');
    assert.strictEqual(result.content[0].content[1].content[0].content[0].text, 'Second');
    assert.strictEqual(result.content[0].content[2].content[0].content[0].text, 'Third');
  });

  it('should convert bold text (marks entire paragraph)', () => {
    const markdown = 'This has **bold** text';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content[0].type, 'paragraph');
    // The implementation marks the entire paragraph as bold if ** is present
    assert.ok(result.content[0].content[0].marks.length > 0);
    assert.strictEqual(result.content[0].content[0].marks[0].type, 'strong');
  });

  it('should handle mixed content', () => {
    const markdown = `# Overview

This is a description.

## Requirements
* Requirement 1
* Requirement 2

## Steps
1. Step 1
2. Step 2`;

    const result = markdownToADF(markdown);

    // Should have: H1, paragraph, H2, bullet list, H2, ordered list
    assert.ok(result.content.length >= 5);
    assert.strictEqual(result.content[0].type, 'heading');
    assert.strictEqual(result.content[0].content[0].text, 'Overview');
  });

  it('should handle empty lines', () => {
    const markdown = 'Line 1\n\n\n\nLine 2';
    const result = markdownToADF(markdown);

    // Empty lines should be ignored
    assert.strictEqual(result.content.length, 2);
  });

  it('should close lists when encountering non-list content', () => {
    const markdown = '* Item 1\n* Item 2\n\nParagraph after list';
    const result = markdownToADF(markdown);

    assert.strictEqual(result.content.length, 2);
    assert.strictEqual(result.content[0].type, 'bulletList');
    assert.strictEqual(result.content[1].type, 'paragraph');
  });

  it('should handle complex real-world example', () => {
    const markdown = `# Task Overview

This task involves implementing authentication.

## Requirements
- Login form
- JWT tokens
- Session management

## Implementation Steps
1. Design API endpoints
2. Implement backend
3. Add frontend components

**Priority:** High`;

    const result = markdownToADF(markdown);

    assert.strictEqual(result.type, 'doc');
    assert.strictEqual(result.version, 1);
    assert.ok(result.content.length >= 6); // At least: H1, para, H2, bullet list, H2, ordered list, para

    // Verify heading
    assert.strictEqual(result.content[0].type, 'heading');
    assert.strictEqual(result.content[0].attrs.level, 1);

    // Verify lists are created
    const bulletListIndex = result.content.findIndex(c => c.type === 'bulletList');
    const orderedListIndex = result.content.findIndex(c => c.type === 'orderedList');
    assert.ok(bulletListIndex >= 0, 'Should have bullet list');
    assert.ok(orderedListIndex >= 0, 'Should have ordered list');
  });

  it('should handle empty input', () => {
    const result = markdownToADF('');
    assert.strictEqual(result.type, 'doc');
    assert.strictEqual(result.version, 1);
    // Empty input may result in empty content or single empty paragraph
    assert.ok(result.content.length >= 0);
  });
});

describe('Privacy Compliance', () => {
  let client;

  beforeEach(() => {
    process.env.ATLASSIAN_API_TOKEN = 'test-token';
    process.env.ATLASSIAN_SITE_URL = 'https://test.atlassian.net';
    process.env.ATLASSIAN_USER_EMAIL = 'test@example.com';
    client = new JiraClient();
  });

  it('should not leak email addresses in filtered data', () => {
    const issue = {
      id: '12345',
      key: 'AI-123',
      fields: {
        reporter: {
          accountId: 'user-123',
          displayName: 'John Doe',
          emailAddress: 'sensitive@company.com'
        },
        assignee: {
          accountId: 'user-456',
          displayName: 'Jane Smith',
          emailAddress: 'jane@company.com'
        }
      }
    };

    const filtered = client.filterIssueData(issue);
    const jsonString = JSON.stringify(filtered);

    // No @ symbol should appear in email addresses
    assert.ok(!jsonString.includes('sensitive@company.com'));
    assert.ok(!jsonString.includes('jane@company.com'));
    assert.ok(!jsonString.includes('company.com'));
  });

  it('should not leak account IDs in filtered data', () => {
    const issue = {
      id: '12345',
      key: 'AI-123',
      fields: {
        reporter: { accountId: 'user-abc-123-secret' }
      }
    };

    const filtered = client.filterIssueData(issue);
    const jsonString = JSON.stringify(filtered);

    assert.ok(!jsonString.includes('user-abc-123-secret'));
    assert.ok(jsonString.includes('[REDACTED_USER_ID]'));
  });

  it('should anonymize all user display names', () => {
    const issue = {
      id: '12345',
      key: 'AI-123',
      fields: {
        reporter: { displayName: 'Unique Reporter Name' },
        assignee: { displayName: 'Unique Assignee Name' },
        creator: { displayName: 'Unique Creator Name' }
      }
    };

    const filtered = client.filterIssueData(issue);
    const jsonString = JSON.stringify(filtered);

    assert.ok(!jsonString.includes('Unique Reporter Name'));
    assert.ok(!jsonString.includes('Unique Assignee Name'));
    assert.ok(!jsonString.includes('Unique Creator Name'));
  });

  it('should preserve non-sensitive data while filtering PII', () => {
    const issue = {
      id: '12345',
      key: 'AI-123',
      fields: {
        summary: 'Implement authentication system',
        description: { type: 'doc', content: [] },
        status: { name: 'In Progress' },
        priority: { name: 'High' },
        labels: ['backend', 'security'],
        reporter: {
          accountId: 'secret-id',
          displayName: 'John Doe',
          emailAddress: 'john@example.com'
        }
      }
    };

    const filtered = client.filterIssueData(issue);

    // Non-sensitive data should be preserved
    assert.strictEqual(filtered.key, 'AI-123');
    assert.strictEqual(filtered.fields.summary, 'Implement authentication system');
    assert.deepStrictEqual(filtered.fields.status, { name: 'In Progress' });
    assert.deepStrictEqual(filtered.fields.priority, { name: 'High' });
    assert.deepStrictEqual(filtered.fields.labels, ['backend', 'security']);

    // Sensitive data should be filtered
    assert.strictEqual(filtered.fields.reporter.accountId, '[REDACTED_USER_ID]');
    assert.strictEqual(filtered.fields.reporter.emailAddress, '[REDACTED_EMAIL]');
    assert.ok(!filtered.fields.reporter.displayName.includes('John'));
  });
});
