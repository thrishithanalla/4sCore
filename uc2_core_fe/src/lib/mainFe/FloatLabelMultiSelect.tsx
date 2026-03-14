import React from 'react';
import { MultiSelect } from 'primereact/multiselect';
import { FloatLabel } from 'primereact/floatlabel';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FloatLabelMultiSelectProps {
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
  filterPlaceholder?: string;
  loading?: boolean;
  display?: 'comma' | 'chip';
  maxSelectedLabels?: number;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  appendTo?: 'self' | HTMLElement | null;
  panelClassName?: string;
}

export const FloatLabelMultiSelect = React.forwardRef<HTMLDivElement, FloatLabelMultiSelectProps>(
  ({ name, label, value, onChange, options, error, helperText, disabled, required, showClear, filter, filterPlaceholder, display, maxSelectedLabels, className, style, testId, appendTo, panelClassName }, ref) => (
    <div ref={ref} className={className} style={style}>
      <FloatLabel>
        <MultiSelect
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.value)}
          options={options}
          optionLabel="label"
          optionValue="value"
          disabled={disabled}
          showClear={showClear}
          filter={filter}
          filterPlaceholder={filterPlaceholder}
          display={display}
          maxSelectedLabels={maxSelectedLabels}
          className={`w-full ${error ? 'p-invalid' : ''}`}
          data-testid={testId}
          appendTo={appendTo}
          panelClassName={panelClassName}
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

FloatLabelMultiSelect.displayName = 'FloatLabelMultiSelect';
export default FloatLabelMultiSelect;
