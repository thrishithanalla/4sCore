import React from 'react';
import { Dropdown } from 'primereact/dropdown';
import { FloatLabel } from 'primereact/floatlabel';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FloatLabelDropdownProps {
  name: string;
  label: string;
  value: string | null;
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
  loading?: boolean;
  onFilter?: (e: { filter: string }) => void;
  emptyFilterMessage?: string;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

export const FloatLabelDropdown = React.forwardRef<HTMLDivElement, FloatLabelDropdownProps>(
  ({ name, label, value, onChange, options, error, helperText, disabled, required, showClear, filter, filterPlaceholder, loading, className, style, testId }, ref) => (
    <div ref={ref} className={className} style={style}>
      <FloatLabel>
        <Dropdown
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange({ target: { name, value: e.value } })}
          options={options}
          optionLabel="label"
          optionValue="value"
          disabled={disabled}
          showClear={showClear}
          filter={filter}
          filterPlaceholder={filterPlaceholder}
          loading={loading}
          className={`w-full ${error ? 'p-invalid' : ''}`}
          data-testid={testId}
        />
        <label htmlFor={name}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      </FloatLabel>
      {helperText && <small className={error ? 'p-error' : 'text-gray-500'}>{helperText}</small>}
    </div>
  )
);

FloatLabelDropdown.displayName = 'FloatLabelDropdown';
export default FloatLabelDropdown;
