import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateRoleName, ROLE_NAME_REGEX } from '../src/utils/authValidation.js';

test('ROLE_NAME_REGEX rejects special characters and symbol spam', () => {
  assert.equal(ROLE_NAME_REGEX.test('sgdags%$656665^%^&%*'), false);
  assert.equal(ROLE_NAME_REGEX.test('@#$%^&*()'), false);
  assert.equal(ROLE_NAME_REGEX.test('Admin!'), false);
  assert.equal(ROLE_NAME_REGEX.test('Manager#1'), false);
  assert.equal(ROLE_NAME_REGEX.test('<script>'), false);
  assert.equal(ROLE_NAME_REGEX.test('Role;DROP'), false);

  assert.equal(ROLE_NAME_REGEX.test('Admin'), true);
  assert.equal(ROLE_NAME_REGEX.test('Billing Manager'), true);
  assert.equal(ROLE_NAME_REGEX.test('Support-Tier_1'), true);
  assert.equal(ROLE_NAME_REGEX.test('Sales Representative 2'), true);
});

test('validateRoleName rejects invalid special characters from ticket', () => {
  // Ticket sample: sgdags%$656665^%^&%*
  const result = validateRoleName('sgdags%$656665^%^&%*');
  assert.equal(result, 'Role name can only contain letters, numbers, spaces, hyphens, and underscores.');

  // Pure special characters
  assert.equal(validateRoleName('@#$%^&*()'), 'Role name can only contain letters, numbers, spaces, hyphens, and underscores.');
  assert.equal(validateRoleName('Accountant!'), 'Role name can only contain letters, numbers, spaces, hyphens, and underscores.');
  assert.equal(validateRoleName('Tech@Support'), 'Role name can only contain letters, numbers, spaces, hyphens, and underscores.');
});

test('validateRoleName validates required, length, and format boundaries', () => {
  // Required / empty
  assert.equal(validateRoleName(''), 'Role name is required.');
  assert.equal(validateRoleName('   '), 'Role name is required.');
  assert.equal(validateRoleName(null), 'Role name is required.');

  // Too short
  assert.equal(validateRoleName('A'), 'Role name must be at least 2 characters.');

  // Too long (> 50 chars)
  assert.equal(validateRoleName('A'.repeat(51)), 'Role name cannot exceed 50 characters.');

  // Must start with letter or number
  assert.equal(validateRoleName('-Admin'), 'Role name must start with a letter or number.');
  assert.equal(validateRoleName('_Manager'), 'Role name must start with a letter or number.');

  // Consecutive hyphens or underscores
  assert.equal(validateRoleName('Billing--Manager'), 'Role name cannot contain consecutive hyphens or underscores.');
  assert.equal(validateRoleName('Tier__1'), 'Role name cannot contain consecutive hyphens or underscores.');

  // Valid names
  assert.equal(validateRoleName('Admin'), '');
  assert.equal(validateRoleName('Super Admin'), '');
  assert.equal(validateRoleName('Billing-Manager'), '');
  assert.equal(validateRoleName('Support_Staff'), '');
  assert.equal(validateRoleName('Tier-1_Specialist 2'), '');
});

test('UserRoleAdministration.jsx wires role name validation and handles blur/save', () => {
  const file = fs.readFileSync(new URL('../src/pages/UserRoleAdministration/UserRoleAdministration.jsx', import.meta.url), 'utf8');

  assert.ok(file.includes('validateRoleName'), 'Must import or use validateRoleName');
  assert.ok(file.includes('handleNameChange'), 'Must have dedicated change handler for role name');
  assert.ok(file.includes('handleNameBlur'), 'Must validate on blur');
  assert.ok(file.includes('validateRoleName(values.name)'), 'Must validate role name on save');
  assert.ok(file.includes('maxLength: 50'), 'Must enforce max length 50 on TextField');
});
