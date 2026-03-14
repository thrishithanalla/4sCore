import { forwardRef } from 'react';
import { FloatLabelInput } from 'mainFe/FloatLabelInput';

interface FormInputProps {
  name: string;
  label: string;
  value: string | number | undefined;
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
  maxLength?: number;
}

const FormInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, FormInputProps>(({
  name,
  label,
  value,
  onChange,
  onBlur,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  type = 'text',
  multiline = false,
  rows = 3,
  autoFocus = false,
  maxLength,
  placeholder,
}, ref) => {
  return (
    <FloatLabelInput
      ref={ref}
      name={name}
      label={label}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      type={type}
      multiline={multiline}
      rows={rows}
      autoFocus={autoFocus}
      maxLength={maxLength}
      placeholder={placeholder}
      className="w-full"
    />
  );
});

FormInput.displayName = 'FormInput';

export default FormInput;
