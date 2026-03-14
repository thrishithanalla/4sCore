import { memo, forwardRef } from 'react';
import { Skeleton } from 'primereact/skeleton';
import { FloatLabelMultiSelect, SelectOption } from 'mainFe/FloatLabelMultiSelect';

export type { SelectOption };

interface FormMultiSelectProps {
  name: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  showClear?: boolean;
  filter?: boolean;
  display?: 'comma' | 'chip';
  maxSelectedLabels?: number;
  loading?: boolean;
  appendTo?: HTMLElement | 'self';
}

const FormMultiSelect = memo(forwardRef<HTMLDivElement, FormMultiSelectProps>(({
  name,
  label,
  value,
  onChange,
  options,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  placeholder = 'Select options',
  showClear = true,
  filter = true,
  display = 'chip',
  maxSelectedLabels,
  loading = false,
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
    <FloatLabelMultiSelect
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
      filter={filter}
      filterPlaceholder="Search..."
      showClear={showClear}
      display={display}
      maxSelectedLabels={maxSelectedLabels}
      appendTo={appendTo}
      className="w-full"
      testId={`${name}-multiselect`}
    />
  );
}));

FormMultiSelect.displayName = 'FormMultiSelect';

export default FormMultiSelect;
