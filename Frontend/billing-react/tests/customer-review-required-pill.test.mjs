import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const customerFormSource = readFileSync(
  new URL('../src/pages/Customers/components/CustomerForm.jsx', import.meta.url),
  'utf8'
);

test('CustomerForm hides "Fields marked with * are required" on Review & Confirm step', () => {
  // Ensure the required pill is guarded so it never renders on the Review & Confirm step
  assert.match(
    customerFormSource,
    /currentStep\s*<\s*STEPS\.length\s*-\s*1\s*&&\s*currentStepData\.label\s*!==\s*['"]Review & Confirm['"]\s*&&\s*\(\s*<div className="cust-required-pill">/,
    'The "Fields marked with * are required" pill must be hidden on the Review & Confirm step'
  );

  // Ensure "Fields marked with" text only exists inside the guarded pill
  const matches = [...customerFormSource.matchAll(/Fields marked with/g)];
  assert.equal(matches.length, 1, 'There should be only one guarded occurrence of "Fields marked with" in CustomerForm');
});

test('CustomerForm STEPS configuration defines Review & Confirm as the final step', () => {
  // Verify STEPS array has Review & Confirm as the last step (index 4)
  assert.match(
    customerFormSource,
    /id:\s*4,\s*label:\s*['"]Review & Confirm['"],\s*title:\s*['"]Review & Confirm['"]/,
    'Review & Confirm step must be configured with id 4 and label Review & Confirm'
  );
});
