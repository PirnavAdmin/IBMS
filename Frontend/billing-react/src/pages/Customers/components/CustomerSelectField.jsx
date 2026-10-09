import { Controller } from 'react-hook-form';
import { MenuItem, Select } from '@mui/material';

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
}) {
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
          aria-invalid={invalid}
          value={field.value ?? ''}
          name={field.name}
          onBlur={field.onBlur}
          inputRef={field.ref}
          inputProps={{ 'aria-label': ariaLabel, 'aria-invalid': invalid }}
          onChange={(event) => {
            field.onChange(event);
            onValueChange?.(event.target.value);
          }}
          MenuProps={{ classes: { paper: 'customer-dropdown-menu' } }}
        >
          {options.map(({ value, label }) => (
            <MenuItem key={value} value={value}>{label}</MenuItem>
          ))}
        </Select>
      )}
    />
  );
}
