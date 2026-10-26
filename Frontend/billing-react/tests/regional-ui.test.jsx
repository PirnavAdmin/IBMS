import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from 'billing-api-client';
import { CountryConfiguration } from '../src/pages/Settings/CountryConfiguration';
import { findCountry, regionalSettingsService, useRegionalSettings } from '../src/services/regionalSettingsService';

const endpoint = '/api/v1/settings/country';
const envelope = codes => ({ success: true, data: { countries: codes.map(code => {
  const country = findCountry(code);
  return { country: country.name, countryCode: country.code, currency: country.currency, phoneCode: country.phoneCode };
}) } });
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const session = (tenant = 1) => {
  localStorage.setItem('billing_auth_token', `qa-session-${tenant}`);
  localStorage.setItem('billing_auth_user', JSON.stringify({ tenantId: tenant, id: `qa-user-${tenant}` }));
};
function setup(t) {
  const original = { get: apiClient.get, put: apiClient.put };
  localStorage.clear(); session();
  apiClient.get = async () => envelope([]);
  apiClient.put = async () => { throw new Error('Unexpected PUT'); };
  t.after(() => { Object.assign(apiClient, original); localStorage.clear(); });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const button = (host, label) => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === label);
const click = element => act(async () => { assert.ok(element); element.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,button:0})); });
function CurrencyProbe() {
  const settings = useRegionalSettings();
  return <output data-currencies>{settings.selectedCurrencies.join(',')}</output>;
}
function Location() { const location = useLocation(); return <output data-location>{location.pathname}</output>; }
async function mount(t, { currencyProbe = false } = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={['/settings/countries']} future={{v7_startTransition:true,v7_relativeSplatPath:true}}>
    <Location />{currencyProbe && <CurrencyProbe />}
    <Routes><Route path="/settings/countries" element={<CountryConfiguration />} />
      <Route path="/settings" element={<><span>Settings overview</span><Link to="/settings/countries">Reopen countries</Link></>} /></Routes>
  </MemoryRouter>));
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  await settle(); return host;
}
const toggle = (host, name) => act(async () => {
  const input = host.querySelector(`[aria-label="Select ${name}"]`);
  assert.ok(input); Simulate.change(input, {target:{checked: !input.checked}});
});

test('GET maps server codes to canonical metadata and ignores legacy selections', async t => {
  setup(t); localStorage.setItem('invoice_billing_selected_countries_default', '["Canada"]');
  let url;
  apiClient.get = async path => { url = path; return { success: true, data: { countries: [{countryCode:' in ', country:'Backend spelling', phoneCode:'+91', currency:'INR'}] } }; };
  const countries = await regionalSettingsService.getSelectedCountries();
  assert.equal(url, endpoint); assert.equal(countries[0].code, 'IN'); assert.equal(countries[0].name, 'India'); assert.equal(countries[0].currency, 'INR');
});

test('GET distinguishes saved empty configuration, API failure and malformed DTO', async t => {
  setup(t); assert.deepEqual(await regionalSettingsService.getSelectedCountries(), []);
  apiClient.get = async () => ({success:false,message:'Load denied'});
  await assert.rejects(regionalSettingsService.getSelectedCountries(), /Load denied/);
  apiClient.get = async () => ({success:true,data:{}});
  await assert.rejects(regionalSettingsService.getSelectedCountries(), /invalid country settings response/);
});

test('PUT sends only selected metadata, no tenant, and uses server-returned selection', async t => {
  setup(t); const calls = [];
  apiClient.put = async (url, payload) => { calls.push({url,payload}); return {...envelope(['US']),message:'Confirmed'}; };
  const result = await regionalSettingsService.saveSelectedCountries(['IN']);
  assert.deepEqual(calls, [{url:endpoint,payload:{countries:[{country:'India',countryCode:'IN',phoneCode:'+91',currency:'INR'}]}}]);
  assert.equal(result.selectedCountries[0].code, 'US'); assert.equal(result.message, 'Confirmed');
});

test('PUT rejects duplicates, unknown countries, unsupported currencies and mismatched metadata before transport', async t => {
  setup(t); let calls = 0; apiClient.put = async () => { calls++; return envelope([]); };
  for (const [selection, message] of [[['IN','in'],/Duplicate/],[['ZZ'],/unsupported country/],[['AO'],/unsupported/],[[{...findCountry('IN'),currency:'USD'}],/does not match/]]) {
    await assert.rejects(regionalSettingsService.saveSelectedCountries(selection), message);
  }
  assert.equal(calls, 0);
});

test('GET preserves known saved countries with unsupported currency and rejects unknown or duplicate codes', async t => {
  setup(t); apiClient.get = async () => envelope(['IN','AO']);
  assert.deepEqual((await regionalSettingsService.getSelectedCountries()).map(c=>c.code), ['IN','AO']);
  apiClient.get = async () => ({success:true,data:{countries:[{countryCode:'ZZ'}]}});
  await assert.rejects(regionalSettingsService.getSelectedCountries(), /unsupported country code/);
  apiClient.get = async () => envelope(['IN','IN']);
  await assert.rejects(regionalSettingsService.getSelectedCountries(), /duplicate/);
});

test('GET and PUT discard responses from an old authenticated session', async t => {
  setup(t); const get = pending(); apiClient.get = () => get.promise;
  const loading = regionalSettingsService.getSelectedCountries(); session(2); get.resolve(envelope(['IN']));
  await assert.rejects(loading, /session changed/);
  const put = pending(); apiClient.put = () => put.promise;
  const saving = regionalSettingsService.saveSelectedCountries(['US']); session(3); put.resolve(envelope(['US']));
  await assert.rejects(saving, /session changed/);
});

test('Country page shows loading without an empty count, then hydrates previously selected countries', async t => {
  setup(t); const get = pending(); apiClient.get = () => get.promise; const host = await mount(t);
  assert.match(host.textContent,/Loading saved country settings/); assert.doesNotMatch(host.textContent,/0 countries|No countries selected/);
  assert.equal(button(host,'Save Changes').disabled,true);
  await act(async () => get.resolve(envelope(['IN','CA']))); await settle();
  assert.equal(host.querySelector('[aria-label="Select India"]').checked,true);
  assert.equal(host.querySelector('[aria-label="Select Canada"]').checked,true);
  assert.doesNotMatch(host.textContent,/API is unavailable/);
});

test('Country GET failure is not an empty selection and Retry fetches the server again', async t => {
  setup(t); let calls=0; apiClient.get = async () => { calls++; if(calls===1) throw new Error('Country connection lost'); return envelope(['GB']); };
  const host = await mount(t); assert.match(host.textContent,/Country connection lost/);
  assert.doesNotMatch(host.textContent,/0 countries|No countries selected/);
  await click(button(host,'Retry')); await settle();
  assert.equal(calls,2); assert.equal(host.querySelector('[aria-label="Select United Kingdom"]').checked,true);
});

test('Country empty saved configuration is shown only after a successful GET', async t => {
  setup(t); const host = await mount(t); assert.match(host.textContent,/No countries selected/);
  assert.equal(button(host,'Save Changes').disabled,false);
});

test('Country save waits for confirmation, prevents duplicates, redirects and invalidates currency consumers', async t => {
  setup(t); let saved=['IN']; let gets=0; let puts=0; const put=pending();
  apiClient.get=async()=>{gets++; return envelope(saved);};
  apiClient.put=()=>{puts++;return put.promise;};
  const host=await mount(t,{currencyProbe:true}); assert.equal(host.querySelector('[data-currencies]').textContent,'INR');
  await act(async()=>{Simulate.click(button(host,'Save Changes'));Simulate.click(button(host,'Save Changes'));});
  assert.equal(puts,1); assert.equal(host.querySelector('[data-location]').textContent,'/settings/countries');
  saved=['US']; await act(async()=>put.resolve(envelope(saved))); await settle();
  assert.equal(host.querySelector('[data-location]').textContent,'/settings');
  assert.equal(host.querySelector('[data-currencies]').textContent,'USD'); assert.ok(gets>=3);
  await click(host.querySelector('a')); await settle();
  assert.equal(host.querySelector('[aria-label="Select United States"]').checked,true);
});

test('Country failed API/HTTP saves preserve edits and do not redirect', async t => {
  setup(t); apiClient.put=async()=>({success:false,message:'Save rejected'}); const host=await mount(t);
  await toggle(host,'Canada'); await click(button(host,'Save Changes')); await settle();
  assert.equal(host.querySelector('[data-location]').textContent,'/settings/countries');
  assert.equal(host.querySelector('[aria-label="Select Canada"]').checked,true); assert.match(document.body.textContent,/Save rejected/);
  apiClient.put=async()=>{throw new Error('PUT connection lost');}; await click(button(host,'Save Changes')); await settle();
  assert.match(document.body.textContent,/PUT connection lost/); assert.equal(host.querySelector('[aria-label="Select Canada"]').checked,true);
  apiClient.put=async()=>({success:true}); await click(button(host,'Save Changes')); await settle();
  assert.equal(host.querySelector('[data-location]').textContent,'/settings/countries');
});

test('Country remount fetches backend state rather than a temporary cache', async t => {
  setup(t); let codes=['IN']; let gets=0; apiClient.get=async()=>{gets++;return envelope(codes);};
  const first=await mount(t); assert.equal(first.querySelector('[aria-label="Select India"]').checked,true);
  codes=['CA']; const fresh=await mount(t); assert.equal(fresh.querySelector('[aria-label="Select Canada"]').checked,true); assert.equal(gets,2);
});

test('Tenant change clears the draft and ignores late previous-tenant GET responses', async t => {
  setup(t); const late=pending(); let calls=0; apiClient.get=()=>++calls===1?late.promise:Promise.resolve(envelope(['US']));
  const host=await mount(t);
  await act(async()=>{session(2);window.dispatchEvent(new window.StorageEvent('storage', {key:'billing_auth_user'}));}); await settle();
  await act(async()=>late.resolve(envelope(['IN']))); await settle();
  assert.equal(host.querySelector('[aria-label="Select United States"]').checked,true);
  assert.equal(host.querySelector('[aria-label="Select India"]').checked,false);
  await toggle(host,'Canada');
  await act(async()=>{session(3);window.dispatchEvent(new window.StorageEvent('storage', {key:'billing_auth_user'}));});await settle();
  assert.equal(host.querySelector('[aria-label="Select Canada"]').checked,false);
});

test('Tenant change during PUT prevents old-session redirect or success', async t => {
  setup(t); const put=pending(); apiClient.get=async()=>envelope(['IN']);apiClient.put=()=>put.promise;
  const host=await mount(t); await click(button(host,'Save Changes'));
  await act(async()=>{session(2);window.dispatchEvent(new window.StorageEvent('storage', {key:'billing_auth_user'}));}); await settle();
  await act(async()=>put.resolve(envelope(['CA'])));await settle();
  assert.equal(host.querySelector('[data-location]').textContent,'/settings/countries');
  assert.equal(host.querySelector('[aria-label="Select Canada"]').checked,false);
});

test('Unsupported saved billing currency stays visible until explicitly removed', async t => {
  setup(t); apiClient.get=async()=>envelope(['IN','AO']);const host=await mount(t,{currencyProbe:true});
  assert.ok(host.querySelector('[aria-label="Remove Angola"]'));assert.match(host.textContent,/unsupported/);
  assert.equal(button(host,'Save Changes').disabled,true);assert.equal(host.querySelector('[data-currencies]').textContent,'INR');
  await click(host.querySelector('[aria-label="Remove Angola"]'));assert.equal(button(host,'Save Changes').disabled,false);
});

test('Account switch before Axios transport cannot send an old country draft with the new session', async t => {
  const original = {get:apiClient.get, put:apiClient.put};
  setup(t);
  apiClient.get = original.get;
  apiClient.put = original.put;
  const adapter = apiClient.defaults.adapter;
  let requests = 0;
  apiClient.defaults.adapter = async config => {
    requests++;
    return {data:envelope([]),status:200,statusText:'OK',headers:{},config};
  };
  t.after(() => {apiClient.defaults.adapter = adapter;});
  const save = regionalSettingsService.saveSelectedCountries(['IN']);
  session(2);
  await assert.rejects(save);
  const load = regionalSettingsService.getSelectedCountries();
  session(3);
  await assert.rejects(load);
  assert.equal(requests, 0);
});
