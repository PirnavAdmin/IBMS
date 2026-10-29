import { useState } from 'react';
import { TextField } from '@mui/material';
import { searchInputError, EMPTY_SEARCH_GUIDANCE } from '../utils/search';

// Blank input clears a live filter; pressing Enter on it explains that behavior.
export function SearchField({ value = '', onChange, onKeyDown, className = '', error, helperText, searchHint, ...props }) {
  const [emptySubmitted, setEmptySubmitted] = useState(false);
  const invalid = searchInputError(value);
  const feedback = invalid || (emptySubmitted && !String(value).trim() ? EMPTY_SEARCH_GUIDANCE : '');
  return <TextField {...props} className={`ibms-search-field ${className}`} value={value}
    error={Boolean(error || invalid)} helperText={feedback || helperText || searchHint}
    FormHelperTextProps={{ role: invalid ? 'alert' : 'status' }}
    onChange={event => { setEmptySubmitted(false); onChange?.(event); }}
    onKeyDown={event => {
      if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
        event.preventDefault();
        setEmptySubmitted(!String(value).trim());
        if (invalid || !String(value).trim()) return;
      }
      onKeyDown?.(event);
    }} />;
}
