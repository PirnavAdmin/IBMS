import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAuditChanges } from '../src/pages/Customers/components/customerAuditUtils.js';

test('customer audit changes render JSON properties as concise readable text', () => {
  assert.equal(formatAuditChanges({
    changes: '{"CreditNoteId":3,"RefundNumber":"REF-20261026-2808A4"}',
  }), 'Credit Note Id: 3 · Refund Number: REF-20261026-2808A4');
  assert.equal(formatAuditChanges({
    changes: { Status: 'PendingApproval', SubmittedBy: 'Acme Admin' },
  }), 'Status: Pending Approval · Submitted By: Acme Admin');
});

test('customer audit preserves plain text and summarizes snapshot differences', () => {
  assert.equal(formatAuditChanges({ changes: 'Customer updated' }), 'Customer updated');
  assert.equal(formatAuditChanges({
    oldValue: '{"Name":"Old Name","Email":"old@example.com"}',
    newValue: '{"Name":"New Name","Email":"new@example.com"}',
  }), 'Name: Old Name → New Name · Email: old@example.com → new@example.com');
});

test('customer audit does not expose JSON or credential fields in the summary', () => {
  assert.equal(formatAuditChanges({ changes: '{"Password":"hidden","Token":"private"}' }), 'Audit details recorded');
  assert.doesNotMatch(formatAuditChanges({
    oldValue: '{"Name":"Customer","PasswordHash":"hidden"}',
    newValue: '{"Name":"Updated","PasswordHash":"private"}',
  }), /hidden|private|Password/);
});
