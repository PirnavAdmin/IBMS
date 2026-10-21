import { AutoComplete, ConfigProvider, Select } from 'antd';
import { Controller } from 'react-hook-form';
import { normalizeProductTax } from '../validation/productValidation';

const productControlTheme = {
  token: { fontSize: 13.5, controlHeight: 42, borderRadius: 8, colorText: '#35271F', colorBgContainer: '#F9F5EF', colorBorder: '#DCD1C6', colorPrimary: '#795137', colorPrimaryHover: '#674730', colorPrimaryActive: '#4B2E1E', colorPrimaryBg: '#F6EBDD', controlOutline: 'rgba(121, 81, 55, 0.12)' },
  components: {
    Select: { activeBorderColor: '#795137', hoverBorderColor: '#A47C59', activeOutlineColor: 'rgba(121, 81, 55, 0.12)', optionSelectedBg: '#F0E2D0', optionSelectedColor: '#4B2E1E', optionActiveBg: '#F9F1E6' },
    Input: { activeBorderColor: '#795137', hoverBorderColor: '#A47C59', activeShadow: '0 0 0 2px rgba(121, 81, 55, 0.12)' },
  },
};

// The form keeps a single scalar value for either predefined options or custom text.
export function ProductEditableSelect({ control, name, id, label, options, editable = false, disabled, error, filterOption, placeholder, popupTitle }) {
  return <Controller control={control} name={name} render={({ field }) => {
    const shared = {
      id, value: field.value ?? '', options, disabled, onBlur: () => { if (editable) field.onChange(normalizeProductTax(field.value)); field.onBlur(); },
      onChange: field.onChange, ref: field.ref, status: error ? 'error' : undefined,
      className: 'product-editable-select', 'aria-label': label,
      'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-err` : undefined,
      placeholder, classNames: { popup: { root: 'product-editable-select-popup' } },
    };
    return <ConfigProvider theme={productControlTheme}>{editable
      ? <AutoComplete {...shared}
          filterOption={false}
          onSelect={value => { if (value === 'Other') field.onChange(''); }} />
      : <Select {...shared} listHeight={400} popupRender={popupTitle ? menu => <><div className="product-currency-popup-title">{popupTitle}</div>{menu}</> : undefined} showSearch={{ filterOption }} optionFilterProp="label" />}</ConfigProvider>;
  }} />;
}
