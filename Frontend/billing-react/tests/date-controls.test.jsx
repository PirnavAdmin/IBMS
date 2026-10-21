import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DateInput, DateField } from '../src/components/DateField';
import { ThemedDatePicker } from '../src/components/ThemedDatePicker';

const day = number => [...document.querySelectorAll('.quote-calendar-grid button:not(.outside-month)')].find(button => button.textContent === String(number));
const click = element => act(async () => { assert.ok(element); Simulate.click(element); });
async function mount(component) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(component));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test('calendar chooses ISO dates, respects bounds, changes months, and closes on Escape', async () => {
  const changes = [];
  const view = await mount(<ThemedDatePicker label="Quote date" value="2026-10-13" min="2026-10-10" max="2026-11-20" onChange={value => changes.push(value)} />);
  try {
    await click(view.host.querySelector('button'));
    assert.equal(day(9).disabled, true);
    await click(document.querySelector('[aria-label="Next month"]'));
    assert.match(document.querySelector('.quote-calendar-header').textContent, /November 2026/);
    await click(document.querySelector('[aria-label="Previous month"]'));
    await click(day(14));
    assert.deepEqual(changes, ['2026-10-14']);
    assert.equal(document.querySelector('.quote-calendar'), null);
    await click(view.host.querySelector('button'));
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('.quote-calendar'), null);
  } finally { await view.close(); }
});

test('MUI date filters emit ISO events for manual dates and calendar selections', async () => {
  const changes = [];
  const view = await mount(<DateInput label="Payment Date" name="date" value="2026-10-13" onChange={event => changes.push(event.target)} />);
  try {
    assert.equal(view.host.querySelector('input').value, '13/10/2026');
    await act(async () => Simulate.change(view.host.querySelector('input'), { target: { value: '15/10/2026' } }));
    assert.deepEqual(changes.at(-1), { name: 'date', value: '2026-10-15' });
    await act(async () => Simulate.change(view.host.querySelector('input'), { target: { value: '31/02/2026' } }));
    assert.equal(changes.length, 1);
    await click(view.host.querySelector('[aria-label="Open calendar for Payment Date"]'));
    await click(day(16));
    assert.equal(changes.at(-1).value, '2026-10-16');
  } finally { await view.close(); }
});

test('required invoice dates cannot clear; disabled fields cannot open', async () => {
  const view = await mount(<DateField label="Invoice date" required value="2026-10-13" onChange={() => {}} />);
  try {
    await click(view.host.querySelector('button'));
    assert.equal(document.querySelector('.quote-calendar-footer button').disabled, true);
  } finally { await view.close(); }
  const disabled = await mount(<ThemedDatePicker label="Locked date" disabled value="2026-10-13" onChange={() => {}} />);
  try { assert.equal(disabled.host.querySelector('button').disabled, true); } finally { await disabled.close(); }
});
