import { useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { MenuItem, Select } from '@mui/material';
import '../styles/products.css';

// Constrain the portaled popup to the space below its control rather than
// letting Popover move a tall category list up over the catalog heading.
export function useProductSelectProps() {
  const ref = useRef(null);
  const [maxHeight, setMaxHeight] = useState(280);
  return {
    ref,
    onOpen: () => {
      const bottom = ref.current?.getBoundingClientRect().bottom ?? 0;
      setMaxHeight(Math.max(0, Math.min(280, window.innerHeight - bottom - 16)));
    },
    MenuProps: {
      anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
      transformOrigin: { vertical: 'top', horizontal: 'left' },
      marginThreshold: 8,
      PaperProps: { className: 'product-select-menu', style: { maxHeight } },
    },
  };
}

export function ProductSelect({ options, className = '', ariaLabel, ...props }) {
  const selectProps = useProductSelectProps();
  return <Select {...props} {...selectProps} fullWidth size="small" displayEmpty
    className={`product-themed-select ${className}`}
    inputProps={{ 'aria-label': ariaLabel, 'aria-invalid': props.error || undefined, 'aria-describedby': props['aria-describedby'] }}>
    {options.map(({ value, label, disabled }) => <MenuItem key={value} value={value} disabled={disabled}>{label}</MenuItem>)}
  </Select>;
}

export function ProductSelectField({ control, name, onValueChange, ...props }) {
  return <Controller control={control} name={name} render={({ field }) =>
    <ProductSelect {...props} name={field.name} value={field.value ?? ''}
      inputRef={field.ref} onBlur={field.onBlur} onChange={event => {
        field.onChange(event);
        onValueChange?.(event.target.value);
      }} />
  } />;
}
