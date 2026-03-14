import { memo, forwardRef } from 'react';
import { FloatLabelCalendar } from 'mainFe/FloatLabelCalendar';

interface FormDatePickerProps {
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  minDate?: string;
  maxDate?: string;
}

const FormDatePicker = memo(forwardRef<HTMLDivElement, FormDatePickerProps>(({
  name,
  label,
  value,
  onChange,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  minDate,
  maxDate,
}, ref) => {
  // Convert string date to Date object for Calendar
  const dateValue = value ? new Date(value) : null;
  const minDateObj = minDate ? new Date(minDate) : undefined;
  const maxDateObj = maxDate ? new Date(maxDate) : undefined;

  return (
    <div className="w-full">
      <FloatLabelCalendar
        ref={ref}
        name={name}
        label={label}
        value={dateValue}
        onChange={onChange as unknown as (e: { target: { name: string; value: string } }) => void}
        error={error}
        helperText={helperText}
        disabled={disabled}
        required={required}
        minDate={minDateObj}
        maxDate={maxDateObj}
        dateFormat="dd M yy" // More readable format: "15 Jan 90"
        showIcon
        showButtonBar
        className="w-full date-picker-enhanced"
      />
    </div>
  );
}));

FormDatePicker.displayName = 'FormDatePicker';

export default FormDatePicker;
