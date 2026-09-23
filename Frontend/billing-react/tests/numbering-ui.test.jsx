import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { NumberingSettings } from '../src/pages/NumberingSettings/pages/NumberingSettings';

test('Numbering page renders configuration, clear action and preview without a runtime exception', () => {
  const html = renderToStaticMarkup(<StaticRouter location="/settings/numbering"><NumberingSettings /></StaticRouter>);
  for (const text of ['Invoice Numbering', 'Select Document Type', 'Build Your Format', 'Clear All', 'Live Preview', 'Save Changes', 'Loading numbering settings']) {
    assert.ok(html.includes(text), `Missing numbering content: ${text}`);
  }
});
