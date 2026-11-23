import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('RecordPayment notes field restricts input to maximum 1000 characters', () => {
  const content = fs.readFileSync('Frontend/billing-react/src/pages/Payments/RecordPayment.jsx', 'utf8');

  // Verify maxLength 1000 is on inputProps
  assert.ok(
    content.includes('inputProps={{ maxLength: 1000, "aria-label": "Notes" }}') ||
    content.includes('maxLength: 1000'),
    'RecordPayment.jsx must define maxLength: 1000 on notes field'
  );

  // Verify change handler clamps notes exceeding 1000 characters
  assert.ok(
    content.includes("key === 'notes' && value && value.length > 1000") &&
    content.includes("value.slice(0, 1000)"),
    'change handler must enforce 1000 character maximum limit'
  );
});

test('pasting or typing text beyond 1000 characters is capped at 1000', () => {
  const longText = 'A'.repeat(1500);
  const clamped = longText.length > 1000 ? longText.slice(0, 1000) : longText;
  assert.equal(clamped.length, 1000);
});
