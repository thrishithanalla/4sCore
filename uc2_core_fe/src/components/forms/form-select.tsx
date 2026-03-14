import { memo, forwardRef } from 'react';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelDropdown, SelectOption } from 'mainFe/FloatLabelDropdown';

export type { SelectOption };

interface FormSelectProps {
  name: string;
  label: string;
  value: string;
  onChange: (e: { target: { name: string; value: string } }) => void;
  options: SelectOption[];
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  showClear?: boolean;
  filter?: boolean;
  filterPlaceholder?: string;
  filterInputAutoFocus?: boolean;
  loading?: boolean;
  optionDisabled?: string | ((option: SelectOption) => boolean);
  appendTo?: HTMLElement | 'self';
}

const FormSelect = memo(forwardRef<HTMLDivElement, FormSelectProps>(({
  name,
  label,
  value,
  onChange,
  options,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  placeholder = 'Select',
  showClear = false,
  filter = false,
  filterPlaceholder = 'Search...',
  filterInputAutoFocus = true,
  loading = false,
  optionDisabled,
  appendTo = document.body,
}, ref) => {
  if (loading) {
    return (
      <div className="w-full">
        <Skeleton height="56px" className="w-full rounded-md" />
      </div>
    );
  }

  return (
    <FloatLabelDropdown
      ref={ref}
      name={name}
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      showClear={showClear}
      filter={filter}
      filterPlaceholder={filterPlaceholder}
      filterInputAutoFocus={filterInputAutoFocus}
      optionDisabled={optionDisabled}
      appendTo={appendTo}
      className="w-full"
    />
  );
}));

FormSelect.displayName = 'FormSelect';

export default FormSelect;
