import test from 'node:test';
import assert from 'node:assert/strict';
import { workEmailSchema, registrationSchema } from '../src/utils/authValidation.js';

const schema = workEmailSchema();
test('rejects unknown appended suffixes and malformed email addresses', () => {
  for (const value of ['person@gmail.comkjfdjkvjkdfv', 'person@example.comabcdef', 'person@example.invalid', 'person@gmail.com extra', 'person@gmail.com@other.com', 'person@co.in', 'person@gmail.com/path', 'not-an-email']) {
    assert.equal(schema.isValidSync(value), false, value);
  }
});
test('retains valid common, country, long and international domain endings', () => {
  for (const value of ['admin@example.com', 'person@example.in', 'person@example.co.in', 'person@example.org', 'person@example.company', 'person@example.technology', 'person@example.museum', 'person@example.xn--p1ai', 'first.last+tag@billing.example.com']) {
    assert.equal(schema.isValidSync(value), true, value);
  }
});
test('does not guess whether a syntactically valid email local part is a human name', () => {
  assert.equal(schema.isValidSync('ksdsfsgfgdv@example.com'), true);
});
test('keeps required feedback and existing trimming behavior', () => {
  assert.throws(() => schema.validateSync(''), /Work email is required/);
  assert.equal(schema.validateSync(' admin@example.com '), 'admin@example.com');
});


test('Registration accepts normal and international names without imposing a word count', () => {
  const schema = registrationSchema.fields.fullName;
  for (const name of ["Reddy Sumanth", "Mary Anne", "Anne-Marie", "O'Connor", "Jo\u00e3o Silva", "\u674e\u5c0f\u9f8d", "\u0645\u062d\u0645\u062f \u0639\u0644\u064a", "\u0905\u0928\u0928\u094d\u092f\u093e", "Al", "M\u00fcller"]) assert.equal(schema.isValidSync(name), true, name);
});
test('Registration rejects excessive repeated letters and invalid or blank names', () => {
  const schema = registrationSchema.fields.fullName;
  for (const name of ['qqqqqqqqqqqqqqqqqqqq', 'AAAAAAAA', '   ', 'A', 'Name123']) assert.equal(schema.isValidSync(name), false, name);
  assert.throws(() => schema.validateSync('qqqqqqqqqqqqqqqqqqqq'), /Full Name contains invalid repeated characters/);
});
test('Registration requires policy-compliant matching passwords and explicit consent', () => {
  const valid = { fullName: ' Mary Anne ', email: ' admin@example.com ', password: 'Password@123', confirmPassword: 'Password@123', terms: true };
  assert.equal(registrationSchema.validateSync(valid).fullName, 'Mary Anne');
  for (const patch of [{ terms: false }, { terms: undefined }, { password: 'short' }, { password: 'password@123' }, { password: 'PASSWORD@123' }, { password: 'Password123' }, { password: 'Password@abc' }, { confirmPassword: 'Different@123' }]) assert.equal(registrationSchema.isValidSync({ ...valid, ...patch }), false);
});
