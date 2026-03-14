import React from 'react';
import { Calendar } from 'primereact/calendar';
import { FloatLabel } from 'primereact/floatlabel';

export interface FloatLabelCalendarProps {
  name: string;
  label: string;
  value: Date | null;
  onChange: (e: { target: { name: string; value: string } }) => void;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  dateFormat?: string;
  showIcon?: boolean;
  showButtonBar?: boolean;
  showTime?: boolean;
  hourFormat?: '12' | '24';
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

export const FloatLabelCalendar = React.forwardRef<HTMLDivElement, FloatLabelCalendarProps>(
  ({ name, label, value, onChange, error, helperText, disabled, required, minDate, maxDate, dateFormat, showIcon, showButtonBar, showTime, hourFormat, className, style, testId }, ref) => (
    <div ref={ref} className={className} style={style}>
      <FloatLabel>
        <Calendar
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange({ target: { name, value: e.value ? e.value.toISOString() : '' } })}
          disabled={disabled}
          minDate={minDate}
          maxDate={maxDate}
          dateFormat={dateFormat}
          showIcon={showIcon}
          showButtonBar={showButtonBar}
          showTime={showTime}
          hourFormat={hourFormat}
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

FloatLabelCalendar.displayName = 'FloatLabelCalendar';
export default FloatLabelCalendar;
