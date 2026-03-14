import { useState } from 'react';
import { Button } from 'primereact/button';

interface ExportDataButtonProps {
  fetchBlob: () => Promise<Blob>;
  filename?: string;
  testId?: string;
  className?: string;
  label?: string;
}

export const ExportDataButton = ({
  fetchBlob,
  filename = 'export.xlsx',
  testId,
  className,
  label,
}: ExportDataButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);
      const blob = await fetchBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon="pi pi-download"
      rounded
      text
      severity="success"
      onClick={handleExport}
      loading={loading}
      data-testid={testId}
      className={className}
      label={label}
      tooltip="Export"
      tooltipOptions={{ position: 'top' }}
    />
  );
};

export default ExportDataButton;
