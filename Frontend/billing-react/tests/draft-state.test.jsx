import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormDraftProvider, useDraftState, useFormDraft, useReactHookFormDraft } from '../src/context/FormDraftContext';

function StateForm() {
  const { id } = useParams(); const key = `test-form:${id}`;
  const draft = useFormDraft(key); const navigate = useNavigate();
  const [values, setValues] = useDraftState(key, 'values', { name: '' });
  const [error, setError] = useState('');
  const save = async fail => { try { await Promise.resolve(); if (fail) throw new Error('API validation failed'); draft.clear(); navigate('/away'); } catch (err) { setError(err.message); } };
  return <><input aria-label="Name" value={values.name} onChange={e=>setValues({...values,name:e.target.value})} />
    <button id="save" onClick={()=>save(false)}>Save</button><button id="fail" onClick={()=>save(true)}>Invalid save</button>
    <button id="cancel" onClick={()=>{draft.clear();navigate('/away');}}>Cancel</button><span>{error}</span>
    <Link id="away" to="/away">Other module</Link><Link id="other" to={`/form/${id==='A'?'B':'A'}`}>Other entity</Link></>;
}
function HookForm() {
  const [loaded, setLoaded] = useState(false);
  const form = useForm({defaultValues:{name:''}});
  useReactHookFormDraft('rhf:A', form, {name:'Server name'}, loaded);
  useEffect(()=>{Promise.resolve().then(()=>setLoaded(true));},[]);
  return <><input aria-label="Name" {...form.register('name')} /><Link id="away" to="/away">Away</Link></>;
}
const App = ({ start='/form/A' }) => <FormDraftProvider><MemoryRouter initialEntries={[start]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Routes>
  <Route path="/form/:id" element={<StateForm/>}/><Route path="/rhf" element={<HookForm/>}/>
  <Route path="/away" element={<><Link id="return" to="/form/A">Return</Link><Link id="rhf" to="/rhf">RHF</Link></>}/>
</Routes></MemoryRouter></FormDraftProvider>;
const click = async (host, selector) => act(async()=>host.querySelector(selector).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0})));
const type = async (host, value) => act(async()=>{const element=host.querySelector('input');element.value=value;Simulate.change(element,{target:element});});
async function mount(start) {
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  await act(async()=>root.render(<App start={start}/>));
  return {host,root,close:async()=>{await act(async()=>root.unmount());host.remove();}};
}
test('SPA route away/return retains input, including across repeated navigation',async()=>{
 const ui=await mount();try {await type(ui.host,'Unsaved customer');await click(ui.host,'#away');await click(ui.host,'#return');assert.equal(ui.host.querySelector('input').value,'Unsaved customer');await type(ui.host,'Changed');await click(ui.host,'#away');await click(ui.host,'#return');assert.equal(ui.host.querySelector('input').value,'Changed');}finally{await ui.close();}
});
test('full app/provider remount clears drafts',async()=>{
 const first=await mount();await type(first.host,'Temporary');await first.close();const fresh=await mount();try{assert.equal(fresh.host.querySelector('input').value,'');}finally{await fresh.close();}
});
for(const action of ['save','cancel'])test(`${action} clears the draft before returning to form`,async()=>{
 const ui=await mount();try{await type(ui.host,'Discard me');await click(ui.host,`#${action}`);await click(ui.host,'#return');assert.equal(ui.host.querySelector('input').value,'');}finally{await ui.close();}
});
test('API failure retains data and does not clear the draft',async()=>{
 const ui=await mount();try{await type(ui.host,'Retain on error');await click(ui.host,'#fail');assert.match(ui.host.textContent,/API validation failed/);await click(ui.host,'#away');await click(ui.host,'#return');assert.equal(ui.host.querySelector('input').value,'Retain on error');}finally{await ui.close();}
});
test('entity A never leaks into B; both drafts restore independently without remounting the route component',async()=>{
 const ui=await mount();try{await type(ui.host,'Entity A');await click(ui.host,'#other');assert.equal(ui.host.querySelector('input').value,'');await type(ui.host,'Entity B');await click(ui.host,'#other');assert.equal(ui.host.querySelector('input').value,'Entity A');await click(ui.host,'#other');assert.equal(ui.host.querySelector('input').value,'Entity B');}finally{await ui.close();}
});
test('React Hook Form draft wins over asynchronous server initialization on return',async()=>{
 const ui=await mount('/rhf');try{assert.equal(ui.host.querySelector('input').value,'Server name');await type(ui.host,'Unsaved edit');await click(ui.host,'#away');await click(ui.host,'#rhf');assert.equal(ui.host.querySelector('input').value,'Unsaved edit');}finally{await ui.close();}
});
