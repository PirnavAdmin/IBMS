import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postcss from 'postcss';

// Preserve the original CRLF snapshot convention on every platform.
const normalizeLineEndings = source => source.replace(/\r\n?|\n/g, '\r\n');
const baseline = JSON.parse(readFileSync(new URL('./css-cascade-baseline.json', import.meta.url)));
for (const { file, selectors, canonicalHash, removed } of baseline) {
  test(`CSS cascade preserved, including responsive/print/theme rules: ${file}`, () => {
    // Normalize checkout line endings, preserving all selectors, declarations and rule order.
    const tree = postcss.parse(normalizeLineEndings(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')));
    const last = new Map();
    tree.walkRules(rule => {
      if (rule.parent.type !== 'root' || !selectors[rule.selector]) return;
      rule.walkDecls(decl => {
        if (!selectors[rule.selector].includes(decl.prop)) return;
        const key = [rule.selector, decl.prop, Boolean(decl.important)].join('|');
        assert.equal(last.has(key), false, `Redundant declaration returned: ${key}`);
        last.set(key, decl);
      });
    });
    tree.walkRules(rule => { if (!rule.nodes.some(node => node.type !== 'comment')) rule.remove(); });
    const walk = node => node.type === 'comment' ? null : node.type === 'decl'
      ? [node.prop, node.value, Boolean(node.important)]
      : [node.type, node.selector || node.name || '', node.params || '', node.nodes?.map(walk).filter(Boolean)];
    assert.equal(createHash('sha256').update(JSON.stringify(walk(tree))).digest('hex'), canonicalHash);
    assert.ok(removed.length > 0);
  });
}

// These invariants supplement (never replace) the whole-file hashes above.
const cssTree = file => postcss.parse(normalizeLineEndings(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')));
const paths = {
  invoice: 'src/pages/Invoices/styles/invoices.css',
  credit: 'src/pages/CreditNotes/styles/credit-notes.css',
  templates: 'src/pages/InvoiceTemplates/invoice-templates.css',
  workspace: 'src/styles/WorkspaceUI.css',
};
function declaration(file, selector, property, media = null) {
  let found;
  cssTree(file).walkRules(rule => {
    const scope = rule.parent.type === 'atrule' && rule.parent.name === 'media' ? rule.parent.params : null;
    if (scope !== media || !rule.selectors.includes(selector)) return;
    rule.nodes.forEach(node => {
      if (node.type === 'decl' && node.prop === property && (!found?.important || node.important)) found = node;
    });
  });
  assert.ok(found, `Missing ${selector} { ${property} } in ${media || 'root'} (${file})`);
  return found;
}
const expectDeclaration = (file, selector, property, value, media = null) => assert.equal(declaration(file, selector, property, media).value, value, `${selector}: ${property} at ${media || 'root'}`);

test('CSS canonicalization ignores only CRLF/LF differences and still detects styling changes', () => {
  const canonical = source => {
    const tree = postcss.parse(normalizeLineEndings(source));
    const walk = node => node.type === 'comment' ? null : node.type === 'decl'
      ? [node.prop, node.value, Boolean(node.important)]
      : [node.type, node.selector || node.name || '', node.params || '', node.nodes?.map(walk).filter(Boolean)];
    return JSON.stringify(walk(tree));
  };
  const sample = '.a,\n.b { color: brown; }\n@media print { .a { overflow: visible !important; } }';
  assert.equal(canonical(sample), canonical(sample.replace(/\n/g, '\r\n')));
  assert.notEqual(canonical(sample), canonical(sample.replace('brown', 'red')));
  assert.notEqual(canonical(sample), canonical(sample.replace(' !important', '')));
  assert.notEqual(canonical(sample), canonical(sample.replace('@media print', '@media screen')));
});

test('U01 responsive detail grid matches desktop specificity and keeps financial values visible', () => {
  const selector = '.invoice-summary-grid.invoice-detail-kpis';
  expectDeclaration(paths.invoice, selector, 'grid-template-columns', 'repeat(2, minmax(0, 1fr))', '(max-width: 900px)');
  expectDeclaration(paths.invoice, selector, 'grid-template-columns', '1fr', '(max-width: 680px)');
  const value = '.invoice-detail-kpis .invoice-summary-card :is(span, strong, small)';
  for (const [prop, expected] of Object.entries({ 'min-width': '0', 'white-space': 'normal', overflow: 'visible', 'text-overflow': 'clip', 'overflow-wrap': 'anywhere' })) {
    expectDeclaration(paths.invoice, value, prop, expected, '(max-width: 900px)');
  }
});

test('U02/U03 credit summaries and filters keep scoped mobile width and value safeguards', () => {
  expectDeclaration(paths.credit, '.cn-list-page .cn-summary-grid', 'grid-template-columns', 'repeat(2, minmax(0, 1fr))', 'screen and (max-width: 760px)');
  expectDeclaration(paths.credit, '.cn-list-page .cn-summary-grid', 'grid-template-columns', 'minmax(0, 1fr)', 'screen and (max-width: 480px)');
  expectDeclaration(paths.credit, '.cn-list-page .cn-summary-card :is(strong, small, .cn-summary-label)', 'overflow-wrap', 'anywhere', 'screen and (max-width: 760px)');
  expectDeclaration(paths.credit, '.cn-source-summary strong', 'overflow-wrap', 'anywhere');
  expectDeclaration(paths.credit, '.cn-summary-card strong', 'font-variant-numeric', 'tabular-nums');
  expectDeclaration(paths.credit, '.cn-list-page .cn-filter-bar', 'flex-wrap', 'wrap', 'screen and (max-width: 900px)');
  for (const selector of ['.cn-search', '.cn-status-filter']) {
    expectDeclaration(paths.credit, `.cn-list-page .cn-filter-bar ${selector}`, 'min-width', '0', 'screen and (max-width: 900px)');
  }
});

test('Wide tables retain local scrolling and matching template header/body proportions', () => {
  const scope = '.template-list-card[aria-labelledby="template-list-heading"]';
  expectDeclaration(paths.templates, `${scope} .template-table-wrap`, 'overflow-x', 'auto');
  expectDeclaration(paths.templates, `${scope} .template-table-wrap`, 'max-width', '100%');
  expectDeclaration(paths.templates, `${scope} .template-table`, 'min-width', '1080px');
  for (let index = 1; index <= 7; index++) {
    const header = declaration(paths.templates, `${scope} .template-table th:nth-child(${index})`, 'width');
    assert.equal(header.value, declaration(paths.templates, `${scope} .template-table td:nth-child(${index})`, 'width').value);
  }
  expectDeclaration(paths.templates, `.app-layout ${scope} .template-table thead th.template-actions-heading`, 'text-align', 'center');
  expectDeclaration(paths.templates, `${scope} .template-table td:nth-child(7)`, 'text-align', 'center');
  expectDeclaration(paths.workspace, '.app-layout .ibms-table-frame', 'overflow', 'auto');
  expectDeclaration(paths.workspace, '.app-layout .ibms-table-frame', 'max-width', '100%');
  expectDeclaration(paths.workspace, '.app-layout .ibms-table-frame th:not([align="right"]):not(.MuiTableCell-alignRight):not(.numeric)', 'text-align', 'left');
});

test('Print rules preserve full invoice/credit content and remain independent of screen viewports', () => {
  const serialize = node => node.type === 'comment' ? null : node.type === 'decl'
    ? [node.prop, node.value, Boolean(node.important)]
    : [node.type, node.selector || node.name || '', node.params || '', node.nodes?.map(serialize).filter(Boolean)];
  for (const entry of baseline.filter(entry => entry.review)) {
    const prints = [];
    cssTree(entry.file).walkAtRules('media', rule => { if (rule.params === 'print') prints.push(serialize(rule)); });
    assert.equal(createHash('sha256').update(JSON.stringify(prints)).digest('hex'), entry.review.printHash, entry.file);
  }
  for (const [file, selector] of [
    [paths.invoice, '.invoice-table-scroll'],
    [paths.credit, '.cn-list-page .cn-table-wrap'],
    [paths.credit, '.cn-preview-page .cn-detail-table-wrap'],
  ]) {
    const decl = declaration(file, selector, 'overflow', 'print');
    assert.equal(decl.value, 'visible'); assert.ok(decl.important, `${selector} print overrides screen scrolling`);
  }
});

test('Cappuccino theme and visible keyboard focus are protected', () => {
  expectDeclaration(paths.workspace, '.app-layout', '--ui-table-header-bg', '#f5efe8');
  expectDeclaration(paths.workspace, '.app-layout', '--ui-row-border', '#f0e6dc');
  expectDeclaration(paths.credit, '.cn-page', 'background', 'var(--bg-main, #f8f1e7)');
  expectDeclaration(paths.credit, '.cn-page .MuiButton-contained', 'background', '#5a2508');
  for (const [file, selector, expected] of [
    [paths.credit, '.cn-invoice-option:focus-visible', '3px solid #b98354'],
    [paths.workspace, '.app-layout .premium-stat-link:focus-visible', '2px solid var(--primary)'],
    [paths.templates, '.template-list-card[aria-labelledby="template-list-heading"] .template-table-wrap:focus-visible', '2px solid var(--primary, #70472f)'],
  ]) expectDeclaration(file, selector, 'outline', expected);
});


test('U07 payment values stay atomic and the scoped mobile grid beats shared container specificity', () => {
  expectDeclaration('src/styles/Payments.css', '.payments-page .payment-summary-card .payment-summary-totals', 'grid-template-columns', 'minmax(0, 1fr)', 'screen and (max-width: 600px)');
  expectDeclaration('src/styles/Payments.css', '.payments-page .payment-summary-totals dd', 'white-space', 'nowrap', 'screen and (max-width: 600px)');
  expectDeclaration('src/styles/Payments.css', '.payments-page .payment-summary-totals dd', 'overflow-wrap', 'normal', 'screen and (max-width: 600px)');
});

test('U09 customer header/body use approved left alignment without changing table width', () => {
  const file = 'src/pages/Customers/styles/customer-list.css';
  const scope = '.customers-page .customer-panel .customer-table .MuiTable-root .MuiTableCell-root';
  expectDeclaration(file, scope + '.MuiTableCell-head', 'text-align', 'left', 'screen');
  expectDeclaration(file, scope + '.MuiTableCell-body', 'text-align', 'left', 'screen');
});

test('U13 user identities retain readable column widths, focus and local scrolling', () => {
  const file = 'src/pages/UserRoleAdministration/user-role-administration.css';
  const scope = '.ura-user-table:not(.ura-assignment-table)';
  for (const index of [2, 3]) {
    expectDeclaration(file, `${scope} th:nth-child(${index})`, 'width', '280px');
    expectDeclaration(file, `${scope} td:nth-child(${index})`, 'width', '280px');
  }
  expectDeclaration(file, '.ura-user-identity-text', 'white-space', 'nowrap');
  expectDeclaration(file, '.ura-user-identity-text', 'text-overflow', 'ellipsis');
  expectDeclaration(file, '.ura-user-identity-text:focus-visible', 'outline', '2px solid #96704e');
  expectDeclaration(file, '.ura-table-wrap', 'overflow-x', 'auto');
  expectDeclaration(file, '.ura-page .ura-table-wrap', 'max-width', '100%');
});
