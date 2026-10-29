import { dropdownPosition } from '../../../utils/dropdownPosition';
import { useExclusiveDropdown } from '../../../hooks/useExclusiveDropdown';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function menuPosition(anchor) {
  return dropdownPosition(anchor.getBoundingClientRect(), {
    width: window.innerWidth, height: window.innerHeight,
  }, 240);
}

export function ThemedSelect({ value, onChange, options, disabled = false, label, className = '' }) {
  const [open, setOpen] = useState(false);
  useExclusiveDropdown(open, setOpen);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find(option => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const updatePosition = () => {
      const trigger = rootRef.current?.querySelector('.quote-themed-select-trigger');
      if (trigger) setPosition(menuPosition(trigger));
    };
    updatePosition();
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  return <div className={`quote-themed-select ${className}`} ref={rootRef}>
    <button type="button" className="quote-themed-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <span>{selected?.label ?? ''}</span><span className="quote-themed-select-chevron" aria-hidden="true" />
    </button>
    {open && position && createPortal(<div ref={menuRef} className="quote-themed-select-menu" role="listbox" aria-label={label} style={position}>
      {options.map(option => <button type="button" role="option" aria-selected={String(option.value) === String(value)} className={String(option.value) === String(value) ? 'selected' : ''} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
    </div>, document.body)}
  </div>;
}
