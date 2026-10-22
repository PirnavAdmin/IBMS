import { useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { ListSubheader, MenuItem, Select } from '@mui/material';
import { Search } from '@mui/icons-material';
import '../../../components/CountryCallingCodeSelector.css';

export function CustomerSelectField({
  control,
  name,
  id,
  options,
  disabled = false,
  className = '',
  ariaLabel,
  invalid = false,
  onValueChange,
  searchable = false,
  required = false,
}) {
  const [search, setSearch] = useState('');
  const searchInput = useRef(null);
  const query = search.trim().toLowerCase();
  const filtered = searchable && query
    ? options.filter(option => `${option.label} ${option.searchText || ''}`.toLowerCase().includes(query))
    : options;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Select
          id={id}
          className={`cust-themed-select ${className}`.trim()}
          size="small"
          fullWidth
          displayEmpty
          disabled={disabled}
          required={required}
          SelectDisplayProps={{ 'aria-required': required || undefined }}
          aria-invalid={invalid}
          value={field.value ?? ''}
          name={field.name}
          onBlur={field.onBlur}
          inputRef={field.ref}
          inputProps={{ 'aria-label': ariaLabel, 'aria-invalid': invalid, 'aria-required': required }}
          onOpen={() => setSearch('')}
          onChange={(event) => {
            field.onChange(event);
            onValueChange?.(event.target.value);
          }}
          renderValue={(selectedVal) => {
            if (!selectedVal) {
              const emptyOpt = options.find((o) => o.value === '');
              return emptyOpt ? (
                <span style={{ color: '#8c7d71' }}>{emptyOpt.label}</span>
              ) : '';
            }
            const match = options.find((o) => o.value === selectedVal);
            if (match?.icon) {
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {match.icon}
                  <span>{match.label}</span>
                </span>
              );
            }
            return match ? match.label : selectedVal;
          }}
          MenuProps={{ classes: { paper: 'customer-dropdown-menu' }, ...(searchable ? { autoFocus: false } : {}) }}
        >
          {searchable && <ListSubheader className="cust-select-search" onClick={event => event.stopPropagation()}>
            <div className="calling-code-search-wrap">
              <Search className="calling-code-search-icon" aria-hidden="true" />
              <input
                ref={searchInput}
                autoFocus
                type="text"
                className="calling-code-search-input"
                placeholder="Search currency or country..."
                aria-label={`Search ${ariaLabel?.toLowerCase() || 'options'}`}
                value={search}
                onChange={event => setSearch(event.target.value)}
                onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}
              />
              {search && <button
                type="button"
                className="calling-code-clear-btn"
                aria-label="Clear currency search"
                onClick={() => { setSearch(''); searchInput.current?.focus(); }}
              >&times;</button>}
            </div>
          </ListSubheader>}
          {filtered.map(({ value, label, icon }) => (
            <MenuItem key={value} value={value}>
              {icon ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {icon}
                  <span>{label}</span>
                </span>
              ) : (
                label
              )}
            </MenuItem>
          ))}
          {searchable && !filtered.length && <MenuItem disabled>No currencies found</MenuItem>}
        </Select>
      )}
    />
  );
}
