import { memo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { ProgressiveFileUpload } from 'mainFe/ProgressiveFileUpload';
import type { UploadFileItem, FileUploadResponse } from 'mainFe/ProgressiveFileUpload';
import type { RootState } from '../../utils/main-fe-auth';

interface FormProgressiveFileUploadProps {
  name: string;
  label: string;
  value?: string | File | null;
  onChange: (fileIds: string[]) => void;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  accept?: string;
  maxFileSize?: number; // in bytes (default 500MB)
  multiple?: boolean;
  module: string; // Module name for the upload API header
}

const FormProgressiveFileUpload = memo(({
  name,
  label,
  onChange,
  error = false,
  helperText = '',
  disabled = false,
  required = false,
  accept,
  maxFileSize = 500 * 1024 * 1024, // 500MB default
  multiple = true,
  module,
}: FormProgressiveFileUploadProps) => {
  // Get current user and selected unit from Redux store
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const selectedUnitRole = useSelector((state: RootState) => state.auth.selectedUnitRole);

  // Track uploaded file IDs
  const handleSuccess = useCallback((file: UploadFileItem, response: FileUploadResponse) => {
    // Call onChange with the file ID from the response
    if (response.data?._id) {
      onChange([response.data._id]);
    }
  }, [onChange]);

  const handleAllComplete = useCallback((files: UploadFileItem[]) => {
    // Collect all successful file IDs
    const successfulIds = files
      .filter((f: UploadFileItem) => f.status === 'success' && f.responseId)
      .map((f: UploadFileItem) => f.responseId as string);

    if (successfulIds.length > 0) {
      onChange(successfulIds);
    }
  }, [onChange]);

  const handleError = useCallback((file: UploadFileItem, errorMsg: string) => {
    console.error(`Upload failed for ${file.file.name}: ${errorMsg}`);
  }, []);

  // Build headers for the upload API
  const headers = {
    district: selectedUnitRole?.unitName || 'default',
    uploadedBy: currentUser?._id || 'anonymous',
    module: module,
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <ProgressiveFileUpload
        id={name}
        headers={headers}
        accept={accept}
        maxFileSize={maxFileSize}
        multiple={multiple}
        disabled={disabled}
        onSuccess={handleSuccess}
        onError={handleError}
        onAllComplete={handleAllComplete}
      />

      {helperText && (
        <small className={`text-xs mt-1 ${error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {helperText}
        </small>
      )}
    </div>
  );
});

FormProgressiveFileUpload.displayName = 'FormProgressiveFileUpload';

export default FormProgressiveFileUpload;
