import { useEffect, useRef } from 'react';

const openDropdowns = new Map();

/** Keeps app-owned dropdown popups mutually exclusive across mounted controls. */
export function useExclusiveDropdown(open, setOpen) {
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = Symbol('exclusive-dropdown');

  useEffect(() => {
    if (!open) return undefined;

    for (const [id, close] of openDropdowns) {
      if (id !== idRef.current) close();
    }

    const id = idRef.current;
    openDropdowns.set(id, () => setOpen(false));
    return () => openDropdowns.delete(id);
  }, [open, setOpen]);
}
