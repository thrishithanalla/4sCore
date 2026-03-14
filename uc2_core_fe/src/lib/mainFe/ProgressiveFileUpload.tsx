import React, { useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';

export interface UploadFileItem {
  file: File;
  name: string;
  size: number;
  type: string;
}

export interface FileUploadResponse {
  data?: { _id: string; [key: string]: any };
  [key: string]: any;
}

interface ProgressiveFileUploadProps {
  id?: string;
  headers?: Record<string, string>;
  accept?: string;
  maxFileSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  onSuccess?: (file: UploadFileItem, response: FileUploadResponse) => void;
  onError?: (file: UploadFileItem, error: any) => void;
  uploadUrl?: string;
  testId?: string;
}

export const ProgressiveFileUpload: React.FC<ProgressiveFileUploadProps> = ({
  id,
  headers,
  accept,
  maxFileSize = 10 * 1024 * 1024,
  multiple = false,
  disabled = false,
  onSuccess,
  onError,
  uploadUrl,
  testId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > maxFileSize) {
        onError?.({ file, name: file.name, size: file.size, type: file.type }, new Error('File too large'));
        continue;
      }

      const uploadItem: UploadFileItem = { file, name: file.name, size: file.size, type: file.type };

      if (uploadUrl) {
        try {
          setUploading(true);
          setProgress(0);

          const formData = new FormData();
          formData.append('file', file);

          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100));
            }
          });

          const response = await new Promise<FileUploadResponse>((resolve, reject) => {
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                reject(new Error(`Upload failed: ${xhr.statusText}`));
              }
            };
            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.open('POST', uploadUrl);
            if (headers) {
              Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
            }
            xhr.send(formData);
          });

          onSuccess?.(uploadItem, response);
        } catch (error) {
          onError?.(uploadItem, error);
        } finally {
          setUploading(false);
          setProgress(0);
        }
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div data-testid={testId}>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || uploading}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        icon="pi pi-upload"
        label="Choose File"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading}
        outlined
        size="small"
      />
      {uploading && <ProgressBar value={progress} className="mt-2" style={{ height: '6px' }} />}
    </div>
  );
};

export default ProgressiveFileUpload;
