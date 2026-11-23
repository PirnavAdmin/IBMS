import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('TaxSettings.css configures full-width, zero-margin grid for summary cards', () => {
  const css = readFileSync(new URL('../src/pages/Taxes/TaxSettings.css', import.meta.url), 'utf8');

  // Verify tax-summary-grid does not constrain width to 1240px or use margin: 0 auto
  assert.equal(css.includes('width: min(100%, 1240px)'), false, 'Should not contain 1240px width restriction');
  assert.equal(css.includes('margin: 0 auto 12px'), false, 'Should not contain centering margin 0 auto');

  // Verify it uses width: 100% and max-width: none
  assert.match(css, /\.tax-summary-grid\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.tax-summary-grid\s*\{[^}]*max-width:\s*none/);

  // Verify tax-settings-page has padding: 0 to prevent extra outer padding
  assert.match(css, /\.tax-settings-page\s*\{[^}]*padding:\s*0/);
});

test('settings.css eliminates excessive sidebar margin and aligns module headers flush', () => {
  const css = readFileSync(new URL('../src/pages/Settings/settings.css', import.meta.url), 'utf8');

  // Verify settings-workspace does not use fixed 28px padding
  assert.equal(css.includes('.settings-workspace { padding: 28px;'), false, 'Should not use fixed 28px padding');

  // Verify settings-workspace uses module-page-gutter
  assert.match(css, /\.settings-workspace\s*\{[^}]*var\(--module-page-gutter/);

  // Verify settings-workspace-content header stretches full width without 1360px cap or auto margins
  assert.match(css, /\.settings-workspace-content\s+:is\(\.settings-page-header,\s*\.settings-module-header\)\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.settings-workspace-content\s+:is\(\.settings-page-header,\s*\.settings-module-header\)\s*\{[^}]*max-width:\s*none/);

  // Verify summary grid, tax-card and settings-layout stretch full width without auto margins
  assert.match(css, /\.settings-workspace-content\s+:is\([^}]*\.tax-summary-grid[^}]*\)\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.settings-workspace-content\s+:is\([^}]*\.tax-summary-grid[^}]*\)\s*\{[^}]*margin-inline:\s*0/);
});
