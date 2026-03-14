import { Dialog } from 'primereact/dialog';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Button } from 'mainFe/Button';
import { useMemo } from 'react';
import type { TopError } from '../../types/log-transaction.types';

interface TopErrorsDialogProps {
  visible: boolean;
  onHide: () => void;
  errors: TopError[];
  onInvestigate?: (error: TopError) => void;
}

const TopErrorsDialog = ({ visible, onHide, errors, onInvestigate }: TopErrorsDialogProps) => {
  const columns: DataTableColumn<TopError & { id: number }>[] = useMemo(() => [
    {
      field: 'id',
      header: '#',
      body: (_: TopError, options: { rowIndex: number }) => (
        <span className="font-bold text-gray-900 dark:text-white">{options.rowIndex + 1}</span>
      ),
      style: { width: '50px' },
    },
    {
      field: 'error',
      header: 'Error',
      sortable: true,
      body: (rowData: TopError) => (
        <span className="font-medium text-gray-900 dark:text-white">{rowData.error}</span>
      ),
    },
    {
      field: 'module',
      header: 'Module',
      sortable: true,
      body: (rowData: TopError) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{rowData.module}</span>
      ),
    },
    {
      field: 'count',
      header: 'Count',
      sortable: true,
      body: (rowData: TopError) => (
        <span className="font-semibold text-red-600">{rowData.count}</span>
      ),
      style: { width: '100px' },
    },
    {
      field: 'affectedUsers',
      header: 'Affected Users',
      sortable: true,
      body: (rowData: TopError) => (
        <div className="flex items-center gap-2">
          <i className="pi pi-users text-gray-400" style={{ fontSize: '0.875rem' }} />
          <span className="text-gray-900 dark:text-white">{rowData.affectedUsers}</span>
        </div>
      ),
      style: { width: '130px' },
    },
    {
      field: 'trend',
      header: 'Trend',
      sortable: true,
      body: (rowData: TopError) => {
        if (rowData.trend === 'up') {
          return <i className="pi pi-arrow-up text-red-500" style={{ fontSize: '1.125rem' }} />;
        }
        if (rowData.trend === 'down') {
          return <i className="pi pi-arrow-down text-green-500" style={{ fontSize: '1.125rem' }} />;
        }
        return <span className="text-gray-500 dark:text-gray-400 text-sm">Stable</span>;
      },
      style: { width: '80px' },
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      body: (rowData: TopError) => (
        <div className="flex justify-center">
          <button
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
            onClick={() => onInvestigate?.(rowData)}
          >
            Investigate
          </button>
        </div>
      ),
      style: { width: '100px' },
    },
  ], [onInvestigate]);

  // Add id for DataTable key
  const tableData = useMemo(() =>
    errors.map((error, index) => ({ ...error, id: index })),
    [errors]
  );

  const headerContent = (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Top 10 Errors</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Most frequent errors in the last 24 hours
      </p>
    </div>
  );

  const footerContent = (
    <div className="flex gap-3">
      <Button
        label="Export Full Report"
        icon="pi pi-download"
        testId="TopErrors.Button.Export"
      />
      <Button
        label="Create Alert Rules"
        icon="pi pi-bell"
        severity="danger"
        testId="TopErrors.Button.CreateAlert"
      />
      <Button
        label="Close"
        severity="secondary"
        outlined
        onClick={onHide}
        testId="TopErrors.Button.Close"
      />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      header={headerContent}
      footer={footerContent}
      style={{ width: '900px' }}
      modal
      className="p-fluid"
      data-testid="TopErrorsDialog"
    >
      <div className="mt-4">
        <DataTable
          data={tableData}
          columns={columns}
          dataKey="id"
          emptyMessage="No errors found in the selected period"
          rowClassName={() => 'hover:bg-gray-50 dark:hover:bg-gray-700'}
        />
      </div>
    </Dialog>
  );
};

export default TopErrorsDialog;
