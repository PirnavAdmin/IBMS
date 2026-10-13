import { useEffect, useState } from 'react';
import { TextField, InputAdornment, IconButton } from '@mui/material';
import { CalendarTodayOutlined } from '@mui/icons-material';
import { ThemedDatePicker } from './ThemedDatePicker';

export function DateField({
  label,
  value,
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  placeholder = "dd/mm/yyyy",
  className = "",
  fullWidth = true,
  name,
  size,
  inputProps = {},
  InputProps = {},
  InputLabelProps = {},
  ...rest
}) {
  const toDisplay = (iso) => {
    if (!iso) return "";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };

  const toIso = (display) => {
    if (!display) return "";
    const cleaned = display.replace(/[-.]/g, "/");
    const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return display;
    const [, d, mo, y] = m;
    const day = d.padStart(2, "0");
    const month = mo.padStart(2, "0");
    const iso = `${y}-${month}-${day}`;
    const dt = new Date(iso);
    if (!Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso) {
      return iso;
    }
    return display;
  };

  const [text, setText] = useState(() => toDisplay(value));

  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const handleTextChange = (e) => {
    let input = e.target.value;
    input = input.replace(/[^\d/]/g, "");
    if (/^\d{2}$/.test(input) && !text.endsWith("/")) {
      input = `${input}/`;
    } else if (/^\d{2}\/\d{2}$/.test(input) && !text.endsWith("/")) {
      input = `${input}/`;
    }
    if (input.length > 10) input = input.slice(0, 10);
    setText(input);

    const iso = toIso(input);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      onChange(iso);
    } else if (!input) {
      onChange("");
    } else {
      onChange(input);
    }
  };

  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

  return (
    <ThemedDatePicker className={className} label={label} value={isoValue} onChange={onChange} disabled={disabled} required={required} min={inputProps.min} max={inputProps.max} renderTrigger={({ open, toggle }) => (
      <TextField
        {...rest}
        fullWidth={fullWidth}
        size={size}
        label={label}
        name={name}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={handleTextChange}
        error={Boolean(error)}
        helperText={helperText !== undefined ? helperText : typeof error === "string" ? error : undefined}
        inputProps={{ ...inputProps, maxLength: 10 }}
        InputLabelProps={{ ...InputLabelProps, shrink: true }}
        InputProps={{
          ...InputProps,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                edge="end"
                disabled={disabled}
                onClick={toggle}
                data-date-anchor
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Open calendar for ${label}`}
                sx={{ color: "var(--primary)" }}
              >
                <CalendarTodayOutlined fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    )} />
  );
}

// Native date callers keep their existing event contract and ISO date values.
export function DateInput({ onChange, name, ...props }) {
  return <DateField {...props} name={name} onChange={value => {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (value && (props.inputProps?.min && value < props.inputProps.min || props.inputProps?.max && value > props.inputProps.max)) return;
    onChange?.({ target: { value, name }, currentTarget: { value, name } });
  }} />;
}
