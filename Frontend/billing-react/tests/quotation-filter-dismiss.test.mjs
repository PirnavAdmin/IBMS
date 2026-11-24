import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('QuotationList.jsx satisfies filter panel dismiss contracts', () => {
  const file = fs.readFileSync(new URL('../src/pages/Quotations/pages/QuotationList.jsx', import.meta.url), 'utf8');

  // Close icon import
  assert.ok(file.includes("import Close from '@mui/icons-material/Close';"), 'Must import Close icon');

  // Ref and exclusive dropdown
  assert.ok(file.includes('const filterMenuRef=useRef(null);'), 'Must define filterMenuRef');
  assert.ok(file.includes('useExclusiveDropdown(filtersOpen, setFiltersOpen);'), 'Must use exclusive dropdown for filtersOpen');

  // Click outside and Escape key listeners
  assert.ok(file.includes('closeOutside'), 'Must handle click outside');
  assert.ok(file.includes("event.key==='Escape'"), 'Must handle Escape key to dismiss');

  // Close (X) button on filter header
  assert.ok(file.includes('quote-filter-close'), 'Must have close button class');
  assert.ok(file.includes('aria-label="Close filters"'), 'Must have aria-label for close button');

  // Cancel button
  assert.ok(file.includes('quote-filter-cancel'), 'Must have cancel button');
  assert.ok(file.includes('>Cancel</button>'), 'Must render Cancel button');

  // Toggle Filters button dismisses when open
  assert.ok(file.includes('if(filtersOpen){setFilters({...applied});setFiltersOpen(false);}'), 'Toggle on filter button must dismiss and revert');
});

test('quotations.css contains styling for filter header, close button, and layout', () => {
  const css = fs.readFileSync(new URL('../src/pages/Quotations/styles/quotations.css', import.meta.url), 'utf8');

  assert.ok(css.includes('.quote-filter-header'), 'Must style .quote-filter-header');
  assert.ok(css.includes('.quote-filter-close'), 'Must style .quote-filter-close');
  assert.ok(css.includes('.quote-filter-title'), 'Must style .quote-filter-title');
});
