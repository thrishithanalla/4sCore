import { useState, useMemo } from 'react';
import { DataTable as PrimeDataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputText } from 'primereact/inputtext';
import { Tooltip } from 'primereact/tooltip';
import { Button } from 'primereact/button';
import { useAppNavigate } from '../../hooks/useAppNavigate';

interface ColumnDef {
  field: string;
  headerName: string;
  width?: number;
  flex?: number;
  sortable?: boolean;
  filterable?: boolean;
  renderCell?: (params: { row: any; value: any }) => React.ReactNode;
  valueFormatter?: (params: { value: any }) => string;
}

interface DataTableProps {
  rows: any[];
  columns: ColumnDef[];
  loading?: boolean;
  onCreateClick?: () => void;
  onViewClick?: (id: string | number) => void;
  onEditClick?: (id: string | number) => void;
  onDeleteClick?: (id: string | number) => void;
  onRestoreClick?: (id: string | number) => void;
  onRefresh?: () => void;
  createRoute?: string;
  createButtonLabel?: string;
  showActions?: boolean;
  testId?: string;
  hideSearch?: boolean;
}

const DataTable = ({
  rows,
  columns,
  loading = false,
  onCreateClick,
  onViewClick,
  onEditClick,
  onDeleteClick,
  onRestoreClick,
  onRefresh,
  createRoute,
  createButtonLabel = 'Create New',
  showActions = true,
  testId = 'DataTable',
  hideSearch = false,
}: DataTableProps) => {
  const navigate = useAppNavigate();
  const [first, setFirst] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchText, setSearchText] = useState('');

  const handleCreateClick = () => {
    if (createRoute) {
      navigate(createRoute);
    } else if (onCreateClick) {
      onCreateClick();
    }
  };

  // Filter rows based on search text
  const filteredRows = useMemo(() => {
    if (!searchText) return rows;

    const lowerSearch = searchText.toLowerCase();
    return rows.filter((row) => {
      return Object.values(row).some((value) => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(lowerSearch);
      });
    });
  }, [rows, searchText]);

  // Action buttons template
  const actionBodyTemplate = (rowData: any) => {
    return (
      <div className="flex gap-1">
        {onViewClick && !rowData.isDeleted && (
          <>
            <button
              type="button"
              className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors view-action-btn"
              onClick={() => onViewClick(rowData.id)}
              data-testid={`${testId}.Action.View`}
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target=".view-action-btn" />
          </>
        )}
        {onEditClick && !rowData.isDeleted && (
          <>
            <button
              type="button"
              className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors edit-action-btn"
              onClick={() => onEditClick(rowData.id)}
              data-testid={`${testId}.Action.Edit`}
              data-pr-tooltip="Edit"
            >
              <i className="pi pi-pencil" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target=".edit-action-btn" />
          </>
        )}
        {onDeleteClick && !rowData.isDeleted && (
          <>
            <button
              type="button"
              className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 rounded-lg transition-colors delete-action-btn"
              onClick={() => onDeleteClick(rowData.id)}
              data-testid={`${testId}.Action.Delete`}
              data-pr-tooltip="Delete"
            >
              <i className="pi pi-trash" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target=".delete-action-btn" />
          </>
        )}
        {onRestoreClick && rowData.isDeleted && (
          <>
            <button
              type="button"
              className="p-2 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30 rounded-lg transition-colors restore-action-btn"
              onClick={() => onRestoreClick(rowData.id)}
              data-testid={`${testId}.Action.Restore`}
              data-pr-tooltip="Restore"
            >
              <i className="pi pi-replay" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target=".restore-action-btn" />
          </>
        )}
      </div>
    );
  };

  // Cell template for custom rendering
  const cellTemplate = (col: ColumnDef) => (rowData: any) => {
    const value = rowData[col.field];

    if (col.renderCell) {
      return col.renderCell({ row: rowData, value });
    }

    if (col.valueFormatter) {
      return col.valueFormatter({ value });
    }

    return value;
  };

  return (
    <div className="w-full" data-testid={testId}>
      {/* Custom Toolbar */}
      {!hideSearch && (
        <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-[400px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <i className="pi pi-search" style={{ fontSize: '1.125rem' }} />
              </span>
              <InputText
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search..."
                className="w-full pl-10"
                data-testid={`${testId}.Search`}
              />
            </div>

            <div className="flex gap-2 ml-auto">
              {onRefresh && (
                <>
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 refresh-btn"
                    data-testid={`${testId}.Button.Refresh`}
                    data-pr-tooltip="Refresh"
                  >
                    <i className={`pi pi-refresh ${loading ? 'animate-spin' : ''}`} style={{ fontSize: '1.25rem' }} />
                  </button>
                  <Tooltip target=".refresh-btn" />
                </>
              )}

              {(onCreateClick || createRoute) && (
                <Button
                  onClick={handleCreateClick}
                  data-testid={`${testId}.Button.Create`}
                >
                  <i className="pi pi-plus mr-1" style={{ fontSize: '1.25rem' }} />
                  {createButtonLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PrimeReact DataTable */}
      <PrimeDataTable
        value={filteredRows}
        loading={loading}
        paginator
        rows={rowsPerPage}
        first={first}
        onPage={(e) => {
          setFirst(e.first);
          setRowsPerPage(e.rows);
        }}
        rowsPerPageOptions={[5, 10, 25, 50, 100]}
        dataKey="id"
        emptyMessage="No records found"
        className="border-0"
        stripedRows
        showGridlines={false}
        pt={{
          root: { className: 'bg-white dark:bg-gray-800' },
          header: { className: 'bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700' },
          thead: { className: 'bg-gray-50 dark:bg-gray-900' },
          headerRow: { className: 'bg-gray-50 dark:bg-gray-900' },
          headerCell: { className: 'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700' },
          bodyRow: { className: 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700' },
          bodyCell: { className: 'text-gray-900 dark:text-gray-100' },
          paginator: { className: 'bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700' },
        }}
      >
        {columns.map((col) => (
          <Column
            key={col.field}
            field={col.field}
            header={col.headerName}
            sortable={col.sortable !== false}
            style={{ width: col.width ? `${col.width}px` : undefined, flex: col.flex }}
            body={cellTemplate(col)}
          />
        ))}
        {showActions && (
          <Column
            header="Actions"
            body={actionBodyTemplate}
            style={{ width: '150px' }}
            frozen
            alignFrozen="right"
          />
        )}
      </PrimeDataTable>
    </div>
  );
};

export default DataTable;
