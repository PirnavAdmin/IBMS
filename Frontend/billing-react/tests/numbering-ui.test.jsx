import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaticRouter } from 'react-router-dom/server';
import { NumberingSettings } from '../src/pages/NumberingSettings/pages/NumberingSettings';

test('Numbering page renders configuration, clear action and preview without a runtime exception', () => {
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><StaticRouter location="/settings/numbering"><NumberingSettings /></StaticRouter></QueryClientProvider>);
  for (const text of ['Invoice Numbering', 'Loading invoice data', 'without consuming the sequence']) {
    assert.ok(html.includes(text), `Missing numbering content: ${text}`);
  }
});
