import { memo, useCallback, useRef } from 'react';
import { Button } from 'mainFe/Button';

interface FormFileUploadProps {
  name: string;
  label: string;
  value: string | File | null;
  onChange: (file: File | null) => void;
  onRemove?: (fileId: string) => Promise<void> | void; // Called when an existing file (string ID) is removed
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  accept?: string;
  maxSize?: number; // in MB
  onPreview?: (e: React.MouseEvent) => void;
  displayName?: string; // Custom display name (e.g., actual filename instead of ID)
}

const FormFileUpload = memo(({
  name,
  label,
  value,
  onChange,
  onRemove,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  accept = 'image/*',
  maxSize = 5,
  onPreview,
  displayName,
}: FormFileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size
      if (file.size > maxSize * 1024 * 1024) {
        alert(`File size must be less than ${maxSize}MB`);
        return;
      }
      onChange(file);
    }
  }, [maxSize, onChange]);

  const handleClear = useCallback(async () => {
    // If removing an existing file (string ID), call onRemove and only clear if it succeeds
    if (typeof value === 'string' && value && onRemove) {
      try {
        await onRemove(value);
      } catch {
        // onRemove failed (e.g., permission error) - don't clear the image
        return;
      }
    }
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onChange, onRemove, value]);

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  const getDisplayValue = () => {
    if (!value) return null;
    // Use displayName if provided (for showing actual filename instead of ID)
    if (displayName) return displayName;
    if (typeof value === 'string') return value;
    return value.name;
  };

  const displayValue = getDisplayValue();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-3 items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <Button
          type="button"
          severity="secondary"
          outlined
          onClick={handleButtonClick}
          disabled={disabled}
          size="small"
        >
          <i className="pi pi-upload mr-2" style={{ fontSize: '1rem' }} />
          Choose File
        </Button>

        <input
          ref={inputRef}
          type="file"
          name={name}
          className="hidden"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
        />

        {displayValue && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              type="button"
              onClick={onPreview}
              disabled={!onPreview}
              className={`flex items-center gap-2 min-w-0 ${onPreview ? 'cursor-pointer hover:opacity-80' : ''}`}
              title={onPreview ? 'Click to preview' : undefined}
            >
              <i className="pi pi-image text-gray-500 flex-shrink-0" style={{ fontSize: '1.125rem' }} />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
                {typeof displayValue === 'string' && displayValue.length > 15
                  ? `${displayValue.substring(0, 12)}...`
                  : displayValue}
              </span>
            </button>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
              >
                <i className="pi pi-times text-red-500" style={{ fontSize: '1rem' }} />
              </button>
            )}
          </div>
        )}
      </div>

      {helperText && (
        <small className={`text-xs mt-1 ${error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {helperText}
        </small>
      )}
    </div>
  );
});

FormFileUpload.displayName = 'FormFileUpload';

export default FormFileUpload;
