import { TextField } from '@mui/material';

// An empty filter value means "All" and must remain visible after selection.
export function FilterSelectField({ InputLabelProps, SelectProps, ...props }) {
  return <TextField {...props} select
    InputLabelProps={{ ...InputLabelProps, shrink: true }}
    SelectProps={{ ...SelectProps, displayEmpty: true }} />;
}
