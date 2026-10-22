import { useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { MenuItem, Select } from '@mui/material';
import '../styles/products.css';

// Open toward available viewport space; short menus keep their content height.
export function useProductSelectProps() {
  const ref = useRef(null);
  const [placement, setPlacement] = useState({ maxHeight: 280, above: false });
  return {
    ref,
    onOpen: () => {
      const bounds = ref.current?.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const below = Math.max(0, viewportHeight - (bounds?.bottom ?? 0) - 8);
      const above = Math.max(0, (bounds?.top ?? 0) - 8);
      const openAbove = below < 280 && above > below;
      setPlacement({ maxHeight: Math.min(280, openAbove ? above : below), above: openAbove });
    },
    MenuProps: {
      anchorOrigin: { vertical: placement.above ? 'top' : 'bottom', horizontal: 'left' },
      transformOrigin: { vertical: placement.above ? 'bottom' : 'top', horizontal: 'left' },
      marginThreshold: 8,
      PaperProps: { className: 'product-select-menu', style: { maxHeight: placement.maxHeight, height: 'auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' } },
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
