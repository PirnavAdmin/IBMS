import { useEffect, useRef } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';

// The module owns filtering, debouncing and URL state. The navbar edits that
// same value instead of maintaining a second, disconnected search query.
export function useNavbarSearch(value, onChange, label) {
  const { registerModuleSearch } = useOutletContext() || {};
  const { pathname } = useLocation();
  const id = useRef(Symbol('module-search'));
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!registerModuleSearch) return undefined;
    registerModuleSearch(id.current, { scope: pathname, value, label, onChange: next => change.current(next) });
    return () => registerModuleSearch(id.current, null);
  }, [registerModuleSearch, pathname, value, label]);
}
