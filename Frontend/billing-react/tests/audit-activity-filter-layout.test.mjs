import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditActivityPath = path.resolve(__dirname, '../src/pages/AuditActivity/AuditActivity.jsx');
const auditCssPath = path.resolve(__dirname, '../src/pages/AuditActivity/audit-activity.css');

test('AuditActivity filter actions are positioned above the filter grid', () => {
  const fileContent = fs.readFileSync(auditActivityPath, 'utf8');

  const actionsIndex = fileContent.indexOf('className="audit-filter-actions"');
  const gridIndex = fileContent.indexOf('className="audit-filter-grid"');

  assert.ok(actionsIndex > 0, 'audit-filter-actions should be present in AuditActivity.jsx');
  assert.ok(gridIndex > 0, 'audit-filter-grid should be present in AuditActivity.jsx');
  assert.ok(actionsIndex < gridIndex, 'audit-filter-actions should appear before audit-filter-grid in the JSX tree');
});

test('AuditActivity removes "Filters apply to the full activity history."', () => {
  const fileContent = fs.readFileSync(auditActivityPath, 'utf8');
  assert.ok(
    !fileContent.includes('Filters apply to the full activity history.'),
    '"Filters apply to the full activity history." text must be removed'
  );
});

test('AuditActivity filter order matches table columns: Event name, Date Range, Performed by, Module / entity', () => {
  const fileContent = fs.readFileSync(auditActivityPath, 'utf8');

  // Verify the exact grid sequence
  const gridSectionMatch = fileContent.match(/<div className="audit-filter-grid">([\s\S]*?)<\/div>/);
  assert.ok(gridSectionMatch, 'audit-filter-grid container must exist');
  const gridContent = gridSectionMatch[1];

  const eventIndex = gridContent.indexOf("renderSelect('action', 'Event name'");
  const dateRangeIndex = gridContent.indexOf('<DateRangeFilter');
  const performedByIndex = gridContent.indexOf("renderSelect('userName', 'Performed by'");
  const moduleEntityIndex = gridContent.indexOf("renderSelect('entityName', 'Module / entity'");

  assert.ok(eventIndex >= 0, 'Event name filter must be present');
  assert.ok(dateRangeIndex >= 0, 'DateRangeFilter must be present');
  assert.ok(performedByIndex >= 0, 'Performed by filter must be present');
  assert.ok(moduleEntityIndex >= 0, 'Module / entity filter must be present');

  assert.ok(eventIndex < dateRangeIndex, 'Event name filter must come before Date Range');
  assert.ok(dateRangeIndex < performedByIndex, 'Date Range filter must come before Performed by');
  assert.ok(performedByIndex < moduleEntityIndex, 'Performed by filter must come before Module / entity');

  // Verify table headers sequence
  const tableHeadMatch = fileContent.match(/<TableHead>[\s\S]*?\[(.*?)\]\.map/);
  assert.ok(tableHeadMatch, 'TableHead must define header column array');
  const headers = tableHeadMatch[1];
  assert.match(headers, /'Event',\s*'Date and time \(IST\)',\s*'Performed by',\s*'Module \/ entity'/);
});

test('audit-activity.css positions audit-filter-actions with bottom spacing above grid', () => {
  const cssContent = fs.readFileSync(auditCssPath, 'utf8');
  assert.match(cssContent, /\.audit-filter-actions\s*\{[^}]*margin-bottom:\s*16px/);
});
