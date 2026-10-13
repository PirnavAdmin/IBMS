import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getCountryCallingCode } from 'libphonenumber-js';
import * as Flags from 'country-flag-icons/react/3x2';

describe('195 Countries and Calling Code Selector Verification', () => {
  const jsonPath = path.resolve('src/data/countries195.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  it('1. Exactly 195 required countries are present (193 UN member states + Holy See + Palestine)', () => {
    assert.strictEqual(data.length, 195, `Expected 195 countries, got ${data.length}`);

    const codes = new Set(data.map((c) => c.code));
    assert.strictEqual(codes.size, 195, 'All 195 country codes must be unique');

    // UN Observer states must be present
    assert.ok(codes.has('VA'), 'Holy See (VA) must be present');
    assert.ok(codes.has('PS'), 'State of Palestine (PS) must be present');

    const holySee = data.find((c) => c.code === 'VA');
    assert.ok(holySee.name.toLowerCase().includes('holy see'), 'Holy See must have correct name');

    const palestine = data.find((c) => c.code === 'PS');
    assert.ok(palestine.name.toLowerCase().includes('palestine'), 'Palestine must have correct name');
  });

  it('2. Every entry has correct country name, ISO code, calling code, and SVG flag', () => {
    for (const c of data) {
      assert.ok(c.name && c.name.trim().length > 0, `Country name missing for ${JSON.stringify(c)}`);
      assert.ok(c.code && /^[A-Z]{2}$/.test(c.code), `Invalid ISO code for ${c.name}: ${c.code}`);
      assert.ok(c.phoneCode && c.phoneCode.startsWith('+'), `Invalid calling code for ${c.name}: ${c.phoneCode}`);

      // Verify calling code matches authoritative libphonenumber-js
      const expectedCode = '+' + getCountryCallingCode(c.code);
      assert.strictEqual(
        c.phoneCode,
        expectedCode,
        `Calling code mismatch for ${c.name} (${c.code}): got ${c.phoneCode}, expected ${expectedCode}`
      );

      // Verify crisp official SVG flag exists in country-flag-icons
      assert.ok(
        typeof Flags[c.code] === 'function',
        `SVG Flag missing in country-flag-icons for ${c.name} (${c.code})`
      );
    }
  });

  it('3. Shared calling codes are properly disambiguated by ISO country code', () => {
    // US (+1) and Canada (+1)
    const us = data.find((c) => c.code === 'US');
    const ca = data.find((c) => c.code === 'CA');
    assert.strictEqual(us.phoneCode, '+1');
    assert.strictEqual(ca.phoneCode, '+1');
    assert.notStrictEqual(us.code, ca.code);

    // Italy (+39) and Holy See (+39)
    const it = data.find((c) => c.code === 'IT');
    const va = data.find((c) => c.code === 'VA');
    assert.strictEqual(it.phoneCode, '+39');
    assert.strictEqual(va.phoneCode, '+39');
    assert.notStrictEqual(it.code, va.code);

    // Russia (+7) and Kazakhstan (+7)
    const ru = data.find((c) => c.code === 'RU');
    const kz = data.find((c) => c.code === 'KZ');
    assert.strictEqual(ru.phoneCode, '+7');
    assert.strictEqual(kz.phoneCode, '+7');
    assert.notStrictEqual(ru.code, kz.code);
  });
});
