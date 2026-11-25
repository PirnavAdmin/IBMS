import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const customerFormPath = path.resolve(__dirname, '../src/pages/Customers/components/CustomerForm.jsx');

test('CustomerForm destructures setError from useForm', () => {
  const content = fs.readFileSync(customerFormPath, 'utf8');

  // Find useForm block
  const useFormMatch = content.match(/const\s*\{([\s\S]*?)\}\s*=\s*useForm\(/);
  assert.ok(useFormMatch, 'useForm destructuring must be present in CustomerForm.jsx');

  const destructuredMembers = useFormMatch[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  assert.ok(
    destructuredMembers.some(m => m === 'setError'),
    'setError must be destructured from useForm so useEffect does not throw ReferenceError'
  );
});

test('CustomerForm imports isDuplicatePhoneNumber from customerValidation', () => {
  const content = fs.readFileSync(customerFormPath, 'utf8');

  assert.match(
    content,
    /import\s*\{[^}]*isDuplicatePhoneNumber[^}]*\}\s*from\s*['"]\.\.\/validation\/customerValidation['"]/,
    'isDuplicatePhoneNumber must be imported from customerValidation'
  );
});
