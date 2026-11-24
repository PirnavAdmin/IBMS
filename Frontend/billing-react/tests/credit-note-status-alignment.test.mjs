import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const creditNoteListSource = readFileSync(new URL('../src/pages/CreditNotes/pages/CreditNoteList.jsx', import.meta.url), 'utf8');
const creditNotesCssSource = readFileSync(new URL('../src/pages/CreditNotes/styles/credit-notes.css', import.meta.url), 'utf8');

test('CreditNoteList status dropdown items are rendered uniformly without misaligned compact wrapper', () => {
  // Ensure that no conditional wrapping of 'Pending Approval' or 'Partially Refunded' in cn-status-filter-compact exists
  assert.doesNotMatch(
    creditNoteListSource,
    /\['Pending Approval',\s*'Partially Refunded'\]\.includes\(item\)\s*\?\s*<span className="cn-status-filter-compact">/,
    'Pending Approval and other statuses must not be wrapped in cn-status-filter-compact inside the status filter dropdown'
  );

  // Ensure status items are mapped cleanly as uniform <MenuItem> elements
  assert.match(
    creditNoteListSource,
    /statuses\.slice\(1\)\.map\(\(item\)\s*=>\s*<MenuItem key=\{item\} value=\{item\}>\{item\}<\/MenuItem>\)/,
    'All status options must be rendered directly as uniform MenuItem elements'
  );
});

test('credit-notes.css ensures uniform vertical alignment and line-height for status options', () => {
  // Check .cn-status-options-menu styling
  assert.match(creditNotesCssSource, /\.cn-status-options-menu\s*\{[^}]*max-height:\s*240px/);
  assert.match(creditNotesCssSource, /\.cn-status-options-menu\s+\.MuiMenuItem-root\s*\{/);
  assert.match(creditNotesCssSource, /align-items:\s*center;/);

  // Check that .cn-status-filter-compact does not have an undersized 0.75rem font
  assert.doesNotMatch(creditNotesCssSource, /\.cn-status-filter-compact\s*\{[^}]*font-size:\s*\.75rem;/);
});
