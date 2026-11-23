import { dropdownPosition } from '../../../utils/dropdownPosition';
import { useExclusiveDropdown } from '../../../hooks/useExclusiveDropdown';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Search from '@mui/icons-material/Search';

function menuPosition(anchor) {
  return dropdownPosition(anchor.getBoundingClientRect(), {
    width: window.innerWidth, height: window.innerHeight,
  }, 210);
}

export function SearchablePicker({
  value,
  onChange,
  items = [],
  getLabel,
  getSearchText,
  placeholder,
  disabled = false,
  className = '',
  ariaLabel,
  required = false,
  describedBy,
  showSearchIcon = true,
  showDropdownIcon = false,
  error = '',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [touched, setTouched] = useState(false);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const isTypingRef = useRef(false);

  const selected = items.find(item => String(item.id) === String(value));
  const selectedLabel = selected ? getLabel(selected) : '';

  useEffect(() => {
    if (!isTypingRef.current) {
      if (selected) {
        setQuery(selectedLabel);
      } else if (!value) {
        setQuery('');
      }
    }
  }, [selectedLabel, value]);

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
  useExclusiveDropdown(showMenu, setOpen);

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
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
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
    window.setTimeout(() => {
      setOpen(false);
      isTypingRef.current = false;
      setTouched(true);
    }, 120);
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

  const handleInputChange = (event) => {
    const nextQuery = event.target.value;
    isTypingRef.current = true;
    setQuery(nextQuery);
    setOpen(true);
    setTouched(true);

    if (!nextQuery.trim()) {
      onChange('');
    } else {
      const trimmedLower = nextQuery.trim().toLowerCase();
      const exactMatch = items.find(item => {
        const lbl = (getLabel(item) || '').toString().toLowerCase();
        return lbl === trimmedLower;
      });
      if (exactMatch && exactMatch.active !== false) {
        onChange(exactMatch.id);
      } else {
        onChange('');
      }
    }
  };

  const handleSelectItem = (item) => {
    if (item.active === false) return;
    isTypingRef.current = false;
    setTouched(false);
    onChange(item.id);
    setQuery(getLabel(item));
    setOpen(false);
  };

  const isInvalid = Boolean(
    error ||
    (required && touched && !value) ||
    (query.trim() && !selected)
  );

  return (
    <div className={`quote-picker ${className}`} ref={rootRef}>
      <div className={`quote-picker-input ${isInvalid ? 'has-error' : ''}`}>
        {showSearchIcon && <Search />}
        <input
          aria-label={ariaLabel}
          aria-required={required || undefined}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={openDropdown}
          onClick={openDropdown}
          onBlur={handleBlur}
          onChange={handleInputChange}
          aria-expanded={showMenu}
          aria-autocomplete="list"
        />
        {Boolean(query) && !disabled && (
          <button
            type="button"
            className="quote-picker-clear"
            aria-label={`Clear ${ariaLabel || 'selection'}`}
            onMouseDown={keepInputFocused}
            onClick={() => {
              isTypingRef.current = false;
              setTouched(false);
              setQuery('');
              onChange('');
              setOpen(false);
            }}
          >
            &times;
          </button>
        )}
        {showDropdownIcon && (
          <button
            type="button"
            className="quote-picker-chevron"
            aria-label={`${showMenu ? 'Close' : 'Open'} ${ariaLabel || placeholder || 'options'}`}
            aria-expanded={showMenu}
            disabled={disabled}
            onMouseDown={keepInputFocused}
            onClick={toggleDropdown}
          >
            <span className="quote-picker-chevron-icon" aria-hidden="true" />
          </button>
        )}
      </div>
      {showMenu && position && createPortal(
        <div ref={menuRef} className="quote-picker-menu" role="listbox" style={{ position: 'fixed', ...position }}>
          {matches.length > 0 ? (
            matches.map(item => (
              <button
                key={item.id}
                type="button"
                disabled={item.active === false}
                aria-selected={String(item.id) === String(value)}
                className={String(item.id) === String(value) ? 'selected' : ''}
                onMouseDown={event => event.preventDefault()}
                onClick={() => handleSelectItem(item)}
              >
                {getLabel(item)}
                {item.active === false && <small>Inactive</small>}
              </button>
            ))
          ) : (
            <p role="status">No matching options</p>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
