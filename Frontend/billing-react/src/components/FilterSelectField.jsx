import { TextField } from '@mui/material';

// An empty filter value means "All" and must remain visible after selection.
export function FilterSelectField({ InputLabelProps, SelectProps, className = '', ...props }) {
  return <TextField {...props} className={`ibms-filter-select ${className}`} select
    InputLabelProps={{ ...InputLabelProps, shrink: true }}
    SelectProps={{ ...SelectProps, displayEmpty: true }} />;
}
