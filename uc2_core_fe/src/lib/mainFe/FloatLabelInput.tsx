import React from 'react';
import { InputText } from 'primereact/inputtext';
import { FloatLabel } from 'primereact/floatlabel';

export interface FloatLabelInputProps {
  name: string;
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  maxLength?: number;
}

export const FloatLabelInput = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  FloatLabelInputProps
>(({ name, label, value, onChange, onBlur, error, helperText, disabled, required, type, className, style, testId, maxLength }, ref) => (
  <div className={className} style={style}>
    <FloatLabel>
      <InputText
        ref={ref as React.Ref<HTMLInputElement>}
        id={name}
        name={name}
        value={String(value ?? '')}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        type={type}
        maxLength={maxLength}
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
));

FloatLabelInput.displayName = 'FloatLabelInput';
export default FloatLabelInput;
