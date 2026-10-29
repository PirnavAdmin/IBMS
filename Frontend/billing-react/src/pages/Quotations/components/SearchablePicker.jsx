import { dropdownPosition } from '../../../utils/dropdownPosition';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from '@mui/icons-material';

function menuPosition(anchor) {
  return dropdownPosition(anchor.getBoundingClientRect(), {
    width: window.innerWidth, height: window.innerHeight,
  }, 210);
}

export function SearchablePicker({ value, onChange, items = [], getLabel, getSearchText, placeholder, disabled = false, className = '', ariaLabel, required = false, describedBy, showSearchIcon = true, showDropdownIcon = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const selected = items.find(item => String(item.id) === String(value));
  const selectedLabel = selected ? getLabel(selected) : '';
  useEffect(() => { if (selected) setQuery(selectedLabel); else if (!value) setQuery(''); }, [selectedLabel, value]);
  const matches = useMemo(() => {
    const search = query.toLowerCase().trim();
    return [...items]
      .filter(item => !search || getSearchText(item).toLowerCase().includes(search))
      .sort((a, b) => {
        const labelA = (getLabel(a) || '').toString().toLowerCase();
        const labelB = (getLabel(b) || '').toString().toLowerCase();
        return labelA.localeCompare(labelB);
      });
  }, [items, query, getLabel, getSearchText]);
  const showMenu = open && !disabled && (showDropdownIcon || !(selected && query === selectedLabel));

  useEffect(() => {
    if (!showMenu) {
      setPosition(null);
      return undefined;
    }
    const updatePosition = () => {
      const input = rootRef.current?.querySelector('.quote-picker-input');
      if (input) setPosition(menuPosition(input));
    };
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
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
  }, [showMenu, matches.length]);

  const handleBlur = () => {
    window.setTimeout(() => setOpen(false), 120);
  };

  const openDropdown = () => {
    if (showDropdownIcon) setQuery('');
    setOpen(true);
  };
  const toggleDropdown = () => {
    if (showMenu) {
      setOpen(false);
      return;
    }
    openDropdown();
  };
  const keepInputFocused = event => event.preventDefault();

  return <div className={`quote-picker ${className}`} ref={rootRef}><div className="quote-picker-input">{showSearchIcon && <Search />}<input aria-label={ariaLabel} aria-required={required || undefined} aria-describedby={describedBy} disabled={disabled} value={query} placeholder={placeholder} onFocus={openDropdown} onClick={openDropdown} onBlur={handleBlur} onChange={event => { setQuery(event.target.value); setOpen(true); if (!event.target.value) onChange(''); }} aria-expanded={showMenu} aria-autocomplete="list" />{showDropdownIcon && <button type="button" className="quote-picker-chevron" aria-label={`${showMenu ? 'Close' : 'Open'} ${ariaLabel || placeholder || 'options'}`} aria-expanded={showMenu} disabled={disabled} onMouseDown={keepInputFocused} onClick={toggleDropdown}><span className="quote-picker-chevron-icon" aria-hidden="true" /></button>}</div>{showMenu && position && createPortal(<div ref={menuRef} className="quote-picker-menu" role="listbox" style={{ position: 'fixed', ...position }}>{matches.length > 0 ? matches.map(item => <button key={item.id} type="button" disabled={item.active === false} aria-selected={String(item.id) === String(value)} className={String(item.id) === String(value) ? 'selected' : ''} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(item.id); setQuery(getLabel(item)); setOpen(false); }}>{getLabel(item)}{item.active === false && <small>Inactive</small>}</button>) : <p role="status">No matching options</p>}</div>, document.body)}</div>;
}
