import { useEffect, useMemo, useState } from 'react';
import { Search } from '@mui/icons-material';

export function SearchablePicker({ value, onChange, items, getLabel, getSearchText, placeholder, disabled = false, className = '' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = items.find(item => item.id === value);
  useEffect(() => { if (selected) setQuery(getLabel(selected)); else if (!value) setQuery(''); }, [selected, value, getLabel]);
  const matches = useMemo(() => { const search = query.toLowerCase().trim(); return items.filter(item => !search || getSearchText(item).toLowerCase().includes(search)); }, [items, query, getSearchText]);

  const handleBlur = () => {
    window.setTimeout(() => setOpen(false), 120);
  };

  return <div className={`quote-picker ${className}`}><div className="quote-picker-input"><Search /><input disabled={disabled} value={query} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={handleBlur} onChange={event => { setQuery(event.target.value); setOpen(true); if (!event.target.value) onChange(''); }} aria-expanded={open} aria-autocomplete="list" /></div>{open && !disabled && <div className="quote-picker-menu" role="listbox">{matches.length ? matches.map(item => <button key={item.id} type="button" disabled={item.active === false} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(item.id); setQuery(getLabel(item)); setOpen(false); }}>{getLabel(item)}{item.active === false && <small>Inactive</small>}</button>) : <p>No matching records found.</p>}</div>}</div>;
}
