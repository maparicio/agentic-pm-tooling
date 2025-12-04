const assert = require('assert');
const PIIFilter = require('../utils/pii-filter');

describe('PIIFilter', () => {
  let filter;

  beforeEach(() => {
    filter = new PIIFilter();
  });

  describe('Email Filtering', () => {
    it('should redact email addresses', () => {
      const text = 'Contact me at john.doe@example.com for details';
      const filtered = filter.filterText(text);
      assert.ok(!filtered.includes('john.doe@example.com'));
      assert.ok(filtered.includes('[EMAIL_1]'));
    });

    it('should handle multiple emails', () => {
      const text = 'Email alice@test.com or bob@test.com';
      const filtered = filter.filterText(text);
      assert.ok(filtered.includes('[EMAIL_1]'));
      assert.ok(filtered.includes('[EMAIL_2]'));
      assert.ok(!filtered.includes('alice@test.com'));
      assert.ok(!filtered.includes('bob@test.com'));
    });

    it('should handle emails with special characters', () => {
      const text = 'Contact user+tag@example.co.uk';
      const filtered = filter.filterText(text);
      assert.ok(!filtered.includes('user+tag@example.co.uk'));
      assert.ok(filtered.includes('[EMAIL_'));
    });
  });

  describe('Phone Number Filtering', () => {
    it('should redact US phone numbers with hyphens', () => {
      const text = 'Call me at 555-123-4567';
      const filtered = filter.filterText(text);
      assert.ok(!filtered.includes('555-123-4567'));
      assert.ok(filtered.includes('[PHONE_'));
    });

    it('should redact phone numbers with parentheses', () => {
      const text = 'Phone: (555) 123-4567';
      const filtered = filter.filterText(text);
      assert.ok(!filtered.includes('(555) 123-4567'));
      assert.ok(filtered.includes('[PHONE_'));
    });

    it('should redact international phone numbers', () => {
      const text = 'International: +1 555 123 4567';
      const filtered = filter.filterText(text);
      assert.ok(!filtered.includes('+1 555 123 4567'));
      assert.ok(filtered.includes('[PHONE_'));
    });

    it('should not redact UUIDs or dates', () => {
      const text = 'UUID: 123e4567-e89b-12d3-a456-426614174000';
      const filtered = filter.filterText(text);
      assert.ok(filtered.includes('123e4567-e89b-12d3-a456-426614174000'));
    });
  });

  describe('Name Anonymization', () => {
    it('should anonymize names', () => {
      const name = 'John Doe';
      const anonymized = filter.anonymizeName(name);
      assert.strictEqual(anonymized, 'Participant 1');
    });

    it('should provide sequential participant numbers', () => {
      const name1 = filter.anonymizeName('Alice');
      const name2 = filter.anonymizeName('Bob');
      assert.strictEqual(name1, 'Participant 1');
      assert.strictEqual(name2, 'Participant 2');
    });

    it('should handle null names', () => {
      const result = filter.anonymizeName(null);
      assert.strictEqual(result, null);
    });
  });

  describe('Company Anonymization', () => {
    it('should anonymize basic company names', () => {
      const company = 'Acme Corp';
      const anonymized = filter.anonymizeCompany(company);
      assert.ok(anonymized.includes('Client'));
      assert.ok(!anonymized.includes('Acme'));
    });

    it('should preserve enterprise hints', () => {
      const company = 'Big Enterprise Corp';
      const anonymized = filter.anonymizeCompany(company);
      assert.ok(anonymized.includes('Enterprise Client'));
    });

    it('should preserve startup hints', () => {
      const company = 'Cool Startup Inc';
      const anonymized = filter.anonymizeCompany(company);
      assert.ok(anonymized.includes('Startup Client'));
    });

    it('should provide sequential company numbers', () => {
      const c1 = filter.anonymizeCompany('Company A');
      const c2 = filter.anonymizeCompany('Company B');
      assert.ok(c1.includes('Company 1'));
      assert.ok(c2.includes('Company 2'));
    });
  });

  describe('URL Filtering', () => {
    it('should redact email parameters from URLs', () => {
      const text = 'Visit http://example.com?email=user@test.com';
      const filtered = filter.filterText(text);
      assert.ok(!filtered.includes('user@test.com'));
      assert.ok(filtered.includes('email=[REDACTED]'));
    });

    it('should redact user ID parameters', () => {
      const text = 'Profile: http://example.com?user_id=12345';
      const filtered = filter.filterText(text);
      assert.ok(filtered.includes('user_id=[REDACTED]'));
    });
  });

  describe('Object Filtering', () => {
    it('should filter emails in objects', () => {
      const obj = {
        email: 'test@example.com',
        name: 'John Doe'
      };
      const filtered = filter.filterObject(obj);
      assert.ok(filtered.email.includes('[EMAIL_'));
      assert.ok(!filtered.email.includes('test@example.com'));
    });

    it('should filter nested objects', () => {
      const obj = {
        user: {
          email: 'test@example.com',
          profile: {
            phone: '555-123-4567'
          }
        }
      };
      const filtered = filter.filterObject(obj);
      assert.ok(filtered.user.email.includes('[EMAIL_'));
      assert.ok(filtered.user.profile.phone.includes('[PHONE_'));
    });

    it('should preserve safe fields', () => {
      const obj = {
        id: '12345',
        uuid: 'abc-def-ghi',
        createdAt: '2025-12-03T00:00:00Z',
        url: 'https://example.com',
        email: 'test@example.com'
      };
      const filtered = filter.filterObject(obj);
      assert.strictEqual(filtered.id, '12345');
      assert.strictEqual(filtered.uuid, 'abc-def-ghi');
      assert.strictEqual(filtered.createdAt, '2025-12-03T00:00:00Z');
      assert.strictEqual(filtered.url, 'https://example.com');
      assert.ok(filtered.email.includes('[EMAIL_'));
    });

    it('should apply custom field rules', () => {
      const obj = {
        title: 'Product Requirements',
        customer_name: 'Acme Corp'
      };
      const fieldRules = {
        title: (value) => value, // Keep as-is
        customer_name: (value, filter) => filter.anonymizeCompany(value)
      };
      const filtered = filter.filterObject(obj, fieldRules);
      assert.strictEqual(filtered.title, 'Product Requirements');
      assert.ok(filtered.customer_name.includes('Client'));
      assert.ok(!filtered.customer_name.includes('Acme'));
    });

    it('should handle arrays', () => {
      const arr = [
        { email: 'user1@test.com' },
        { email: 'user2@test.com' }
      ];
      const filtered = filter.filterObject(arr);
      assert.ok(filtered[0].email.includes('[EMAIL_'));
      assert.ok(filtered[1].email.includes('[EMAIL_'));
    });
  });

  describe('Statistics', () => {
    it('should track filtering statistics', () => {
      filter.filterText('Email me at test@example.com or call 555-123-4567');
      filter.anonymizeName('John Doe');
      filter.anonymizeCompany('Acme Corp');

      // Check counters directly since getFilterStats might not be exposed
      assert.strictEqual(filter.enabled, true);
      assert.ok(filter.counters.email >= 1);
      assert.ok(filter.counters.phone >= 1);
      assert.ok(filter.counters.name >= 1);
      assert.ok(filter.counters.company >= 1);
    });

    it('should reset counters', () => {
      filter.filterText('test@example.com');
      filter.resetCounters();
      assert.strictEqual(filter.counters.email, 0);
    });
  });

  describe('Configuration', () => {
    it('should respect disabled state', () => {
      const disabledFilter = new PIIFilter();
      // Temporarily override enabled state
      disabledFilter.enabled = false;

      const text = 'Email: test@example.com';
      const filtered = disabledFilter.filterText(text);
      assert.strictEqual(filtered, text);
    });
  });
});
