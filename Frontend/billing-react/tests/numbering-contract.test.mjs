import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../../billing-api-client/apiClient.js';
import { numberingService } from '../src/pages/NumberingSettings/services/numberingService.js';
import { numberingValidationSchema, generateNumberPreview } from '../src/pages/NumberingSettings/validation/numberingValidation.js';

const setting = { documentType: 'Invoice', prefix: '{DD}-', tokens: '{YEAR}-{DD}-', suffix: '-{DD}', sequenceLength: 4, nextNumber: 7, resetPolicy: 'Never', status: 'Active', rowVersion: 'original-version' };
test('Numbering GET/form/Preview/PUT keeps DD and the original rowVersion; preview never consumes a sequence', async () => {
  const originals = { get: apiClient.get, put: apiClient.put, post: apiClient.post };
  const calls = [];
  let stored = { ...setting };
  apiClient.get = async () => ({ success: true, data: { ...stored } });
  apiClient.post = async (path, body) => {
    calls.push(path);
    assert.equal(path, '/api/v1/settings/numbering/preview');
    assert.equal(body.prefix, '{DD}-'); assert.equal(body.tokens, '{YEAR}-{DD}-'); assert.equal(body.suffix, '-{DD}');
    return { success: true, data: { fullPreview: '24-2026-24-0007-24', parts: {} } };
  };
  apiClient.put = async (_path, body) => {
    assert.equal(body.rowVersion, setting.rowVersion);
    assert.equal(body.tokens, setting.tokens);
    stored = { ...body, rowVersion: 'replacement-version' };
    return { success: true, data: stored };
  };
  try {
    const values = await numberingService.getSettings();
    assert.equal(values.tokens, setting.tokens); assert.equal(values.rowVersion, setting.rowVersion);
    assert.equal(numberingValidationSchema.isValidSync(values), true);
    for (let i = 0; i < 2; i++) await numberingService.preview(values);
    assert.equal((await numberingService.getSettings()).nextNumber, 7);
    const snapshot = structuredClone(values);
    generateNumberPreview(values);
    assert.deepEqual(values, snapshot);
    assert.equal((await numberingService.updateSettings(values)).rowVersion, 'replacement-version');
    assert.equal(calls.length, 2);
  } finally { Object.assign(apiClient, originals); }
});

test('Legacy DAY and parenthesized form tokens use the same backend DD contract in preview and update', async () => {
  const originals = { post: apiClient.post, put: apiClient.put };
  apiClient.post = async (_path, body) => {
    assert.equal(body.tokens, '{DD}-{DD}-');
    return { success: true, data: { fullPreview: '24-24-0007' } };
  };
  apiClient.put = async (_path, body) => {
    assert.equal(body.tokens, '{DD}-{DD}-');
    return { success: true, data: body };
  };
  try {
    const values = { ...setting, tokens: '(DAY)-{DD}-' };
    await numberingService.preview(values);
    await numberingService.updateSettings(values);
  } finally { Object.assign(apiClient, originals); }
});

test('Stale numbering RowVersion propagates 409 without retry or overwriting settings', async () => {
  const original = apiClient.put;
  const values = { ...setting };
  let calls = 0;
  apiClient.put = async (_path, body) => {
    calls++;
    assert.equal(body.rowVersion, 'original-version');
    throw Object.assign(new Error('Concurrency error: The numbering configuration was modified by another user.'), { response: { status: 409 } });
  };
  try {
    await assert.rejects(numberingService.updateSettings(values), error => error.status === 409);
    assert.equal(calls, 1); assert.deepEqual(values, setting);
  } finally { apiClient.put = original; }
});
