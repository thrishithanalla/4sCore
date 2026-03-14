import React from 'react';
import { InputText } from 'primereact/inputtext';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  testId?: string;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ testId, invalid, className, ...props }, ref) => {
    return (
      <InputText
        ref={ref}
        data-testid={testId}
        className={`${className || ''} ${invalid ? 'p-invalid' : ''}`}
        {...(props as any)}
      />
    );
  }
);

Input.displayName = 'Input';
export default Input;
