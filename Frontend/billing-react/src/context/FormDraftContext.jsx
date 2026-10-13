import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Owned by the authenticated React tree. Never serialized to browser/server storage.
export function createFormDraftStore() {
  const forms = new Map();
  return {
    read: (key, slot = 'values') => forms.get(key)?.get(slot),
    has: (key, slot = 'values') => forms.get(key)?.has(slot) || false,
    write(key, slot, value) {
      if (!forms.has(key)) forms.set(key, new Map());
      forms.get(key).set(slot, value);
    },
    clear(key, slot) {
      if (slot === undefined) forms.delete(key);
      else { forms.get(key)?.delete(slot); if (!forms.get(key)?.size) forms.delete(key); }
    },
  };
}

const FormDraftContext = createContext(null);
export function FormDraftProvider({ children }) {
  const [store] = useState(createFormDraftStore);
  return <FormDraftContext.Provider value={store}>{children}</FormDraftContext.Provider>;
}

export function useFormDraft(key) {
  const shared = useContext(FormDraftContext);
  const [isolated] = useState(createFormDraftStore);
  const store = shared || isolated; // Standalone forms/tests remain usable.
  return useMemo(() => ({
    read: (slot = 'values') => store.read(key, slot),
    has: (slot = 'values') => store.has(key, slot),
    write: (value, slot = 'values') => store.write(key, slot, value),
    clear: slot => store.clear(key, slot),
  }), [store, key]);
}

export function useDraftState(key, slot, initialValue) {
  const draft = useFormDraft(key);
  const initial = useMemo(() => draft.has(slot) ? draft.read(slot)
    : typeof initialValue === 'function' ? initialValue() : initialValue, [draft, slot]);
  const [state, setState] = useState(() => ({ draft, value: initial }));
  const value = state.draft === draft ? state.value : initial;
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => { setState(previous => previous.draft === draft ? previous : { draft, value: initial }); }, [draft, initial]);
  const update = useCallback(next => {
    const value = typeof next === 'function' ? next(latest.current) : next;
    latest.current = value;
    draft.write(value, slot);
    setState({ draft, value });
  }, [draft, slot]);
  return [value, update];
}

export function useDraftResource(key, slot, create) {
  const draft = useFormDraft(key);
  return useMemo(() => {
    if (!draft.has(slot)) draft.write(create(), slot);
    return draft.read(slot);
  }, [draft, slot]);
}

export function useReactHookFormDraft(key, { reset, watch }, defaults, ready = true) {
  const draft = useFormDraft(key);
  const latestDefaults = useRef(defaults);
  latestDefaults.current = defaults;
  useEffect(() => {
    if (!ready) return;
    reset(draft.has() ? draft.read() : latestDefaults.current);
    const subscription = watch(values => draft.write(structuredClone(values)));
    return () => subscription.unsubscribe();
  }, [draft, reset, watch, ready]);
  return draft;
}
