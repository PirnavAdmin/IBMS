import { AutoComplete, Input, Select } from 'antd';
import { Controller } from 'react-hook-form';

// The form keeps a single scalar value for either predefined options or custom text.
export function ProductEditableSelect({ control, name, id, label, options, editable = false, disabled, error, filterOption, placeholder }) {
  return <Controller control={control} name={name} render={({ field }) => {
    const shared = {
      id, value: field.value ?? '', options, disabled, onBlur: field.onBlur,
      onChange: field.onChange, ref: field.ref, status: error ? 'error' : undefined,
      className: 'product-editable-select', 'aria-label': label,
      'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-err` : undefined,
      placeholder, classNames: { popup: { root: 'product-editable-select-popup' } },
    };
    return editable
      ? <AutoComplete {...shared}
          filterOption={(input, option) => option.value === 'Other' || option.value.toLowerCase().includes(input.toLowerCase())}
          onSelect={value => { if (value === 'Other') field.onChange(''); }}><Input maxLength={64} /></AutoComplete>
      : <Select {...shared} showSearch={{ filterOption }} optionFilterProp="label" />;
  }} />;
}
