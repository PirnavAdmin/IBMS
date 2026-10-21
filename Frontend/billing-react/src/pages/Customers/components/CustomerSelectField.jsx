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
          MenuProps={{ classes: { paper: 'customer-dropdown-menu' } }}
        >
          {options.map(({ value, label, icon }) => (
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
        </Select>
      )}
    />
  );
}
