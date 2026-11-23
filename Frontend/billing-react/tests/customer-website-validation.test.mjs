import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerValidationSchema,
  URL_REGEX,
  isValidWebsiteUrl,
} from '../src/pages/Customers/validation/customerValidation.js';
import { validateCustomerEdit } from '../src/pages/Customers/api/customerEdit.js';

test('URL_REGEX and isValidWebsiteUrl reject unsupported special characters and invalid URLs', () => {
  const invalidUrls = [
    'www.em/<>ail.co.in', // Repro ticket sample
    'http://www.em/<>ail.co.in',
    'https://www.em/<>ail.co.in',
    'www.<test>.com',
    'www.test^.com',
    'www.test%5.com',
    'www.test*foo.com',
    'http://example.com/path<invalid>',
    'http://example.com/path"invalid"',
    'http://example.com/path\\invalid',
    'http://example.com/path{invalid}',
    'http://example.com/path|invalid',
    'http://',
    'https://',
    'http://.',
    'www.',
    '.com',
    'ftp://example.com',
    'javascript:alert(1)',
    'example',
    'www..example.com',
    'www.-example.com',
    'www.example-.com',
    'www.example.c',
  ];

  for (const url of invalidUrls) {
    assert.equal(isValidWebsiteUrl(url), false, `Expected invalid URL to fail: "${url}"`);
  }
});

test('isValidWebsiteUrl accepts valid website URLs', () => {
  const validUrls = [
    'www.example.com',
    'https://example.com',
    'http://example.com',
    'example.com',
    'deccantech.in',
    'www.deccantech.in',
    'https://deccantech.in',
    'https://sub.domain.co.uk',
    'https://example.com/about',
    'https://example.com/services/consulting?id=123&type=web#header',
    'https://example.com:8080/dashboard',
    '',
    null,
    undefined,
  ];

  for (const url of validUrls) {
    assert.equal(isValidWebsiteUrl(url), true, `Expected valid URL to pass: "${url}"`);
  }
});

test('customerValidationSchema rejects invalid website URL with expected error message', async () => {
  const websiteSchema = customerValidationSchema.pick(['website']);

  await assert.rejects(
    async () => {
      await websiteSchema.validate({ website: 'www.em/<>ail.co.in' }, { abortEarly: false });
    },
    (err) => {
      assert.equal(err.errors.includes('Please enter a valid website URL.'), true);
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await websiteSchema.validate({ website: 'https://test<>.com' }, { abortEarly: false });
    },
    (err) => {
      assert.equal(err.errors.includes('Please enter a valid website URL.'), true);
      return true;
    }
  );
});

test('customerValidationSchema accepts valid website URLs and empty values', async () => {
  const websiteSchema = customerValidationSchema.pick(['website']);

  const validCases = [
    'www.example.com',
    'https://example.com',
    'https://deccantech.in',
    '',
    null,
  ];

  for (const val of validCases) {
    const res = await websiteSchema.validate({ website: val });
    if (val === '' || val === null) {
      assert.equal(res.website, null);
    } else {
      assert.equal(res.website, val);
    }
  }
});

test('validateCustomerEdit rejects invalid website URL with expected error message', () => {
  const invalidResult = validateCustomerEdit({
    name: 'Valid Customer',
    email: 'valid@example.com',
    website: 'www.em/<>ail.co.in',
  });
  assert.equal(invalidResult.website, 'Please enter a valid website URL.');

  const validResult = validateCustomerEdit({
    name: 'Valid Customer',
    email: 'valid@example.com',
    website: 'www.example.com',
  });
  assert.equal(validResult.website, undefined);
});
