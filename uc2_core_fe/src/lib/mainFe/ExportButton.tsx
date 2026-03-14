import { useState } from 'react';
import { Button } from 'primereact/button';

interface ExportColumn {
  field: string;
  header: string;
}

interface ExportButtonProps {
  fetchData: () => Promise<any[]>;
  columns: ExportColumn[];
  filename?: string;
  testId?: string;
  className?: string;
  label?: string;
}

export const ExportButton = ({
  fetchData,
  columns,
  filename = 'export',
  testId,
  className,
  label,
}: ExportButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);
      const data = await fetchData();

      // Convert to CSV
      const headers = columns.map((col) => col.header).join(',');
      const rows = data.map((row) =>
        columns
          .map((col) => {
            const value = row[col.field];
            const str = value === null || value === undefined ? '' : String(value);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(',')
      );
      const csv = [headers, ...rows].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
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

export default ExportButton;
