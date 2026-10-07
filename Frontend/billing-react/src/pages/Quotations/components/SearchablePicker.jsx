import { useEffect, useMemo, useState } from 'react';
import { Search } from '@mui/icons-material';

export function SearchablePicker({ value, onChange, items = [], getLabel, getSearchText, placeholder, disabled = false, className = '', ariaLabel, showSearchIcon = true, showDropdownIcon = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = items.find(item => String(item.id) === String(value));
  useEffect(() => { if (selected) setQuery(getLabel(selected)); else if (!value) setQuery(''); }, [selected, value, getLabel]);
  const matches = useMemo(() => { const search = query.toLowerCase().trim(); return items.filter(item => !search || getSearchText(item).toLowerCase().includes(search)); }, [items, query, getSearchText]);
  const showMenu = open && !disabled && (showDropdownIcon || !(selected && query === getLabel(selected))) && matches.length > 0;

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

  return <div className={`quote-picker ${className}`}><div className="quote-picker-input">{showSearchIcon && <Search />}<input aria-label={ariaLabel} disabled={disabled} value={query} placeholder={placeholder} onFocus={openDropdown} onClick={openDropdown} onBlur={handleBlur} onChange={event => { setQuery(event.target.value); setOpen(true); if (!event.target.value) onChange(''); }} aria-expanded={showMenu} aria-autocomplete="list" />{showDropdownIcon && <button type="button" className="quote-picker-chevron" aria-label={`${showMenu ? 'Close' : 'Open'} ${ariaLabel || placeholder || 'options'}`} aria-expanded={showMenu} disabled={disabled} onMouseDown={keepInputFocused} onClick={toggleDropdown}><span className="quote-picker-chevron-icon" aria-hidden="true" /></button>}</div>{showMenu && <div className="quote-picker-menu" role="listbox">{matches.map(item => <button key={item.id} type="button" disabled={item.active === false} aria-selected={String(item.id) === String(value)} className={String(item.id) === String(value) ? 'selected' : ''} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(item.id); setQuery(getLabel(item)); setOpen(false); }}>{getLabel(item)}{item.active === false && <small>Inactive</small>}</button>)}</div>}</div>;
}
