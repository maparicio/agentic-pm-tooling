#!/usr/bin/env node

/**
 * PII Filter Utility
 * Filters personally identifiable information from data before LLM processing
 */

require('dotenv').config();

class PIIFilter {
  constructor(options = {}) {
    this.enabled = process.env.PII_FILTER_ENABLED !== 'false';
    this.anonymizeEmails = process.env.PII_ANONYMIZE_EMAILS !== 'false';
    this.anonymizeNames = process.env.PII_ANONYMIZE_NAMES !== 'false';
    this.anonymizePhone = process.env.PII_ANONYMIZE_PHONE !== 'false';

    // Counters for anonymization
    this.counters = {
      email: 0,
      name: 0,
      phone: 0,
      company: 0
    };
  }

  /**
   * Filter PII from text
   */
  filterText(text) {
    if (!this.enabled || !text) return text;

    let filtered = text;

    if (this.anonymizeEmails) {
      filtered = this.filterEmails(filtered);
    }

    if (this.anonymizePhone) {
      filtered = this.filterPhoneNumbers(filtered);
    }

    // Filter URLs that might contain personal info
    filtered = this.filterSensitiveUrls(filtered);

    return filtered;
  }

  /**
   * Filter emails with anonymization
   */
  filterEmails(text) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return text.replace(emailRegex, (match) => {
      this.counters.email++;
      return `[EMAIL_${this.counters.email}]`;
    });
  }

  /**
   * Filter phone numbers
   * More specific patterns to avoid matching UUIDs, dates, and other numeric data
   */
  filterPhoneNumbers(text) {
    // Only match actual phone number patterns with clear formatting
    // Avoid matching UUIDs, dates, or random numeric sequences
    const phonePatterns = [
      // US format: (123) 456-7890 or 123-456-7890
      /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
      // International: +1 234 567 8900 or +44 20 7946 0958
      /\b\+\d{1,3}\s\d{2,4}\s\d{3,4}\s\d{4}\b/g,
      // Format with dots: 123.456.7890
      /\b\d{3}\.\d{3}\.\d{4}\b/g
    ];

    let filtered = text;
    phonePatterns.forEach(pattern => {
      filtered = filtered.replace(pattern, (match) => {
        // Additional check: make sure it's not part of a UUID or timestamp
        // UUIDs have letters, timestamps have colons
        if (!/[a-f]/i.test(match) && !/:/.test(match)) {
          this.counters.phone++;
          return `[PHONE_${this.counters.phone}]`;
        }
        return match;
      });
    });

    return filtered;
  }

  /**
   * Filter URLs that might contain personal identifiers
   */
  filterSensitiveUrls(text) {
    // Remove email parameters from URLs
    const urlWithEmailRegex = /([?&]email=)[^&\s]+/g;
    let filtered = text.replace(urlWithEmailRegex, '$1[REDACTED]');

    // Remove user ID-like parameters
    const userIdRegex = /([?&](?:user_id|userId|uid)=)[^&\s]+/g;
    filtered = filtered.replace(userIdRegex, '$1[REDACTED]');

    return filtered;
  }

  /**
   * Anonymize person names in structured data
   */
  anonymizeName(name) {
    if (!this.enabled || !this.anonymizeNames || !name) return name;

    this.counters.name++;
    return `Participant ${this.counters.name}`;
  }

  /**
   * Anonymize company names
   */
  anonymizeCompany(company) {
    if (!this.enabled || !company) return company;

    this.counters.company++;
    // Try to preserve company size/type hints
    if (company.toLowerCase().includes('enterprise') || company.toLowerCase().includes('corp')) {
      return `Enterprise Client ${this.counters.company}`;
    } else if (company.toLowerCase().includes('startup')) {
      return `Startup Client ${this.counters.company}`;
    } else {
      return `Company ${this.counters.company}`;
    }
  }

  /**
   * Filter PII from a nested object recursively
   */
  filterObject(obj, fieldRules = {}) {
    if (!this.enabled || !obj) return obj;

    const filtered = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
      const value = obj[key];

      // Handle nested objects
      if (value && typeof value === 'object') {
        filtered[key] = this.filterObject(value, fieldRules);
        continue;
      }

      // Handle string values
      if (typeof value === 'string') {
        // Skip fields that are known safe (IDs, timestamps, UUIDs, URLs, etc.)
        const safeFields = [
          'id', 'uuid', 'guid', 'self', 'html', 'url', 'href', 'link',
          'createdat', 'updatedat', 'deletedat', 'timestamp', 'date',
          'type', 'status', 'state', 'role', 'archived', 'granularity',
          'startdate', 'enddate', 'timeframe', 'code', 'key'
        ];

        if (safeFields.includes(key.toLowerCase())) {
          filtered[key] = value;
        }
        // Apply field-specific rules
        else if (fieldRules[key]) {
          filtered[key] = fieldRules[key](value, this);
        }
        // Check for common PII field names
        else if (['email', 'email_address', 'user_email'].includes(key.toLowerCase())) {
          this.counters.email++;
          filtered[key] = `[EMAIL_${this.counters.email}]`;
        }
        else if (['phone', 'phone_number', 'mobile'].includes(key.toLowerCase())) {
          this.counters.phone++;
          filtered[key] = `[PHONE_${this.counters.phone}]`;
        }
        else if (['name', 'full_name', 'display_name', 'user_name', 'customer_name'].includes(key.toLowerCase())) {
          filtered[key] = this.anonymizeName(value);
        }
        else if (['company', 'company_name', 'organization'].includes(key.toLowerCase())) {
          filtered[key] = this.anonymizeCompany(value);
        }
        else {
          // Apply text filtering for any other string fields
          filtered[key] = this.filterText(value);
        }
      } else {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Reset counters (useful for batch processing)
   */
  resetCounters() {
    this.counters = {
      email: 0,
      name: 0,
      phone: 0,
      company: 0
    };
  }

  /**
   * Get filtering statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      itemsFiltered: this.counters
    };
  }
}

module.exports = PIIFilter;

// CLI usage
if (require.main === module) {
  const filter = new PIIFilter();

  // Read from stdin
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const filtered = filter.filterObject(data);
      console.log(JSON.stringify(filtered, null, 2));
      console.error(`\nFiltering stats: ${JSON.stringify(filter.getStats())}`);
    } catch (e) {
      // Treat as plain text
      const filtered = filter.filterText(input);
      console.log(filtered);
    }
  });
}
