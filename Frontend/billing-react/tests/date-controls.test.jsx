import dayjs from 'dayjs';
import { DateRangeFilter } from '../src/components/DateRangeFilter';
import { DateRangeDatePicker } from '../src/components/DateRangeDatePicker';
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

// Real input events exercise the picker and the controlled range draft together.
async function typeRangeValue(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
function RangePickerHarness({ initial = '' }) {
  const [value, setValue] = React.useState(initial);
  return <><DateRangeDatePicker aria-label="Range date" value={value} onChange={setValue} /><output>{value}</output></>;
}

test('range date retains each typed year, month and day through parent rerenders and blur', async () => {
  const view = await mount(<RangePickerHarness />);
  try {
    const input = view.host.querySelector('input');
    await act(async () => Simulate.focus(input));
    for (const value of ['2', '20', '202', '2026', '2026-', '2026-1', '2026-10', '2026-10-', '2026-10-2', '2026-10-23']) {
      await typeRangeValue(input, value);
      assert.equal(input.value, value);
      assert.equal(view.host.querySelector('output').textContent, value);
    }
    await typeRangeValue(input, '2026-10-');
    await act(async () => Simulate.blur(input));
    assert.equal(input.value, '2026-10-');
    assert.equal(view.host.querySelector('output').textContent, '2026-10-');
  } finally { await view.close(); }
});

test('range date can replace a selected date, retain invalid text, and clear it', async () => {
  const view = await mount(<RangePickerHarness initial="2026-10-23" />);
  try {
    const input = view.host.querySelector('input');
    for (const value of ['2026-10-2', '2024-02-29', '2026-02-30', '']) {
      await typeRangeValue(input, value);
      assert.equal(input.value, value);
      assert.equal(view.host.querySelector('output').textContent, value);
    }
  } finally { await view.close(); }
});
test('range picker calendar selection still replaces the editable text and respects the latest date', async () => {
  const changes = [];
  function CalendarHarness() {
    const [value, setValue] = React.useState('2026-10-13');
    return <DateRangeDatePicker value={value} maxDate={dayjs('2026-10-20')} onChange={next => { changes.push(next); setValue(next); }} />;
  }
  const view = await mount(<CalendarHarness />);
  try {
    await click(view.host.querySelector('input'));
    assert.ok(document.querySelector('[title="2026-10-21"]').classList.contains('ant-picker-cell-disabled'));
    await click(document.querySelector('[title="2026-10-14"] .ant-picker-cell-inner'));
    assert.equal(view.host.querySelector('input').value, '2026-10-14');
    assert.equal(changes.at(-1), '2026-10-14');
  } finally { await view.close(); }
});

test('manually typed date range applies only complete, ordered dates within the latest date', async () => {
  const changes = [];
  const view = await mount(<DateRangeFilter inline latestDate="2026-10-28" onApply={range => changes.push(range)} />);
  try {
    await click(view.host.querySelector('button'));
    const from = view.host.querySelector('input[aria-label="From Date"]');
    const to = view.host.querySelector('input[aria-label="To Date"]');
    const apply = () => view.host.querySelector('button[type="submit"]');
    await typeRangeValue(from, '2024-02-29');
    for (const value of ['2026-10-', '2026-02-30', '2023-01-01', '2026-10-29']) {
      await typeRangeValue(to, value);
      assert.equal(to.value, value);
      assert.equal(apply().disabled, true);
    }
    await typeRangeValue(to, '2026-10-28');
    assert.equal(apply().disabled, false);
    await act(async () => Simulate.submit(view.host.querySelector('form')));
    assert.deepEqual(changes, [{ startDate: '2024-02-29', endDate: '2026-10-28' }]);
    assert.equal(view.host.querySelector('form'), null);
  } finally { await view.close(); }
});
test('range date formats continuous digit entry and compact paste without losing the controlled draft', async () => {
  const view = await mount(<RangePickerHarness />);
  try {
    const input = view.host.querySelector('input');
    await act(async () => input.focus());
    for (const digit of '20261023') await typeRangeValue(input, input.value + digit);
    assert.equal(input.value, '2026-10-23');
    assert.equal(input.selectionStart, 10);
    assert.equal(view.host.querySelector('output').textContent, '2026-10-23');
    await typeRangeValue(input, '20240229');
    assert.equal(input.value, '2024-02-29');
    assert.equal(view.host.querySelector('output').textContent, '2024-02-29');
    await typeRangeValue(input, '');
    assert.equal(view.host.querySelector('output').textContent, '');
  } finally { await view.close(); }
});

test('range date normalization does not silently accept malformed or overlong manual text', async () => {
  const view = await mount(<RangePickerHarness initial="2026-10-23" />);
  try {
    const input = view.host.querySelector('input');
    for (const value of ['2026-10-', '2026-1-03', '2026--10-03', '202610230', '7646436365', 'not-a-date']) {
      await typeRangeValue(input, value);
      await act(async () => Simulate.blur(input));
      assert.equal(input.value, value);
      assert.equal(view.host.querySelector('output').textContent, value);
    }
  } finally { await view.close(); }
});