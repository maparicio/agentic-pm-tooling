# Testing Guide

**Status:** 205 tests passing | ~78% coverage | 38ms execution time ✅

---

## Quick Overview

### What's Tested

| Component | Tests | Coverage | Status |
|-----------|-------|----------|--------|
| PII Filter | 24 | 84% | ✅ Excellent |
| Dovetail Skill | 48 | ~80% | ✅ Excellent |
| Productboard Skill | 45 | ~75% | ✅ Good |
| Jira Skill | 46 | ~85% | ✅ Excellent |
| Confluence Skill | 37 | ~40% | ✅ Good |

**Total:** 205 tests, 2,570 lines of test code

### What's NOT Tested (Optional)

- **HTTP Methods** - Jira and Confluence readPage(), createPage(), updatePage(), getSpaceId(), makeRequest() (would require API mocking)
- **Error Handling** - Network errors, rate limits, auth failures (would require HTTP mocking)
- **Edge Cases** - Unicode handling, performance with large objects

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific file
npx mocha tests/pii-filter.test.js
```

---

## Test Files

```
tests/
├── pii-filter.test.js      (227 lines, 24 tests)
├── productboard.test.js    (539 lines, 45 tests)
├── dovetail.test.js        (639 lines, 48 tests)
├── jira.test.js            (644 lines, 46 tests)
└── confluence.test.js      (521 lines, 37 tests)
```

---

## What Each Test Suite Covers

### PII Filter Tests
- Email anonymization (`test@example.com` → `[EMAIL_1]`)
- Phone number redaction (`555-123-4567` → `[PHONE_1]`)
- Name anonymization (`John Doe` → `Participant 1`)
- Company anonymization (`Acme Corp` → `Company 1`)
- URL parameter filtering
- Statistics tracking

### Productboard Tests
- Constructor and initialization
- Owner email resolution (alias → email mapping)
- Feature data filtering and PII removal
- Note data filtering and PII removal
- Privacy compliance (no PII leaks)
- API endpoint construction

### Dovetail Tests
- Project/insight/highlight data filtering
- Participant anonymization in research data
- Interview transcript PII removal
- Interviewer anonymization
- Privacy compliance
- Research-specific data handling

### Confluence Tests
- Constructor validation (env vars)
- Page data filtering
- Author information anonymization
- Body content PII filtering
- HTML structure preservation
- Error handling (null data, empty objects)
- Privacy compliance

### Jira Tests
- Constructor validation (env vars)
- Issue data filtering and PII removal
- Reporter, assignee, and creator anonymization
- ADF (Atlassian Document Format) helper functions
  - buildParagraph, buildHeading, buildBulletList, buildOrderedList, wrapInADF
- Markdown-to-ADF converter
  - Simple paragraphs, multiple paragraphs
  - Headings (levels 1-6)
  - Bullet lists (*, -)
  - Ordered lists (1., 2., 3.)
  - Bold text (**text**)
  - Mixed content and complex examples
- Privacy compliance (no PII leaks)
- Safe field preservation (status, priority, project, labels)

---

## Test Structure for LLMs

### Framework
- **Test Runner:** Mocha v10.8.2
- **Coverage Tool:** NYC (Istanbul) v17.1.0
- **Assertion Library:** Node.js built-in `assert` module

### Pattern to Follow

```javascript
const assert = require('assert');
const MyClass = require('../path/to/class');

describe('MyClass', () => {
  let instance;

  // Setup before each test
  beforeEach(() => {
    process.env.REQUIRED_VAR = 'test-value';
    instance = new MyClass();
  });

  // Cleanup after each test
  afterEach(() => {
    delete process.env.REQUIRED_VAR;
  });

  describe('methodName', () => {
    it('should handle expected input correctly', () => {
      const input = 'test@example.com';
      const result = instance.process(input);

      // Use strict assertions
      assert.ok(!result.includes('@'));
      assert.ok(result.includes('[EMAIL_'));
    });

    it('should handle edge cases gracefully', () => {
      const result = instance.process(null);
      assert.strictEqual(result, null);
    });
  });
});
```

### Key Testing Principles

1. **Test Isolation:** Use `beforeEach` to create fresh instances
2. **Environment Variables:** Save and restore in beforeEach/afterEach
3. **Strict Assertions:** Use `strictEqual`, not loose equality
4. **Privacy First:** Always verify PII is filtered (never leaked)
5. **Both Paths:** Test success and error cases
6. **Clear Names:** Use descriptive `it('should...')` statements

### What Gets Tested

✅ **Data Filtering Logic** - PII removal, anonymization, transformations
✅ **Constructor Validation** - Environment variable checks, initialization
✅ **Object Transformations** - Field mapping, custom rules, nested objects
✅ **Privacy Compliance** - Ensure no raw PII in output
✅ **Edge Cases** - Null handling, empty objects, missing fields

❌ **HTTP Calls** - Not mocked, actual API calls not tested
❌ **Network Errors** - Would require HTTP mocking (nock, sinon, fetch-mock)
❌ **Authentication** - Assumes valid credentials in tests

---

## Adding New Tests

When adding a new skill or feature:

1. **Create test file:** `tests/my-feature.test.js`
2. **Follow existing patterns:** Look at similar tests
3. **Test data filtering first:** Most critical for privacy
4. **Add constructor tests:** Validate env vars
5. **Test privacy compliance:** Ensure no PII leaks
6. **Run tests:** `npm test`

### Checklist for New Test File

```javascript
// ✅ Require dependencies
const assert = require('assert');
const MyFeature = require('../path/to/feature');

// ✅ Describe block with feature name
describe('MyFeature', () => {
  let instance;
  let originalEnv;

  // ✅ Save environment state
  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.MY_API_TOKEN = 'test-token';
    instance = new MyFeature();
  });

  // ✅ Restore environment state
  afterEach(() => {
    process.env = originalEnv;
  });

  // ✅ Test constructor
  describe('Constructor', () => {
    it('should initialize with valid env vars', () => {
      assert.doesNotThrow(() => new MyFeature());
    });

    it('should throw error if token missing', () => {
      delete process.env.MY_API_TOKEN;
      assert.throws(() => new MyFeature(), /MY_API_TOKEN/);
    });
  });

  // ✅ Test data filtering
  describe('filterData', () => {
    it('should remove PII from data', () => {
      const data = { email: 'test@example.com', id: '123' };
      const filtered = instance.filterData(data);

      assert.strictEqual(filtered.id, '123');
      assert.ok(!filtered.email.includes('@'));
    });
  });

  // ✅ Test privacy compliance
  describe('Privacy Compliance', () => {
    it('should never expose raw email addresses', () => {
      const data = { email: 'user@company.com' };
      const filtered = instance.filterData(data);
      const jsonString = JSON.stringify(filtered);

      assert.ok(!jsonString.includes('user@company.com'));
    });
  });
});
```

---

## Configuration

### package.json Scripts
```json
{
  "test": "mocha tests/**/*.test.js --timeout 5000",
  "test:watch": "mocha tests/**/*.test.js --watch",
  "test:coverage": "nyc mocha tests/**/*.test.js"
}
```

### Coverage Thresholds (Optional)
Create `.nycrc` for coverage enforcement:
```json
{
  "all": true,
  "lines": 70,
  "statements": 70,
  "branches": 65,
  "functions": 70,
  "include": ["utils/**/*.js", ".claude/skills/**/*.js"],
  "exclude": ["tests/**", "node_modules/**"]
}
```

---

## Common Test Patterns

### Testing PII Filtering
```javascript
it('should filter emails from text', () => {
  const text = 'Contact john@example.com for help';
  const filtered = filter.filterText(text);

  // Check original removed
  assert.ok(!filtered.includes('john@example.com'));
  // Check replacement added
  assert.ok(filtered.includes('[EMAIL_'));
});
```

### Testing Constructor Errors
```javascript
it('should throw error if env var missing', () => {
  delete process.env.REQUIRED_VAR;
  assert.throws(
    () => new MyClass(),
    /REQUIRED_VAR not found/
  );
});
```

### Testing Null/Edge Cases
```javascript
it('should handle null data gracefully', () => {
  const result = instance.process(null);
  assert.strictEqual(result, null);
});

it('should handle empty objects', () => {
  const result = instance.process({});
  assert.ok(result);
  assert.strictEqual(typeof result, 'object');
});
```

### Testing Privacy Compliance
```javascript
it('should never expose PII in output', () => {
  const input = {
    email: 'test@example.com',
    phone: '555-123-4567',
    name: 'John Doe'
  };

  const filtered = instance.filterData(input);
  const jsonString = JSON.stringify(filtered);

  // Verify no PII in serialized output
  assert.ok(!jsonString.includes('test@example.com'));
  assert.ok(!jsonString.includes('555-123-4567'));
  assert.ok(!jsonString.includes('John Doe'));
});
```

---

## Debugging Test Failures

### Common Issues

1. **Assertion Error: Expected X but got Y**
   - Check actual vs expected values
   - Review filtering logic
   - Verify test data matches expectations

2. **Environment Variable Errors**
   - Ensure beforeEach sets required env vars
   - Check afterEach cleanup
   - Verify .env.example has all vars

3. **Timeout Errors**
   - Default timeout: 5000ms
   - Not an issue for unit tests (no network calls)
   - If needed: `this.timeout(10000)` in test

4. **Module Not Found**
   - Check require paths are correct
   - Verify file exists at specified path
   - Use relative paths from test file location

---

## Resources

- **Mocha Docs:** https://mochajs.org/
- **NYC Coverage:** https://github.com/istanbuljs/nyc
- **Node Assert:** https://nodejs.org/api/assert.html
- **Project Progress:** `/project-progress.md`

---

**Last Updated:** 2025-12-04
**Test Suite Version:** 2.0 (Production Ready)
