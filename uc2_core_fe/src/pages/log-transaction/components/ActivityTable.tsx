import { useMemo, useCallback } from 'react';
import { Tag } from 'primereact/tag';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { ExportButton } from 'mainFe/ExportButton';
import { formatTimestamp } from 'mainFe/dateUtils';
import type { LogTransaction, LogLayer } from '../../../types/log-transaction.types';

interface ActivityTableProps {
  logs: LogTransaction[];
  totalRecords: number;
  loading: boolean;
  first: number;
  rows: number;
  autoRefresh: boolean;
  sortField?: string;
  sortOrder?: 1 | -1;
  onPageChange: (event: any) => void;
  onSort: (event: any) => void;
  onRowClick: (log: LogTransaction) => void;
}

const getLayerColor = (layer: LogLayer): 'info' | 'warning' | 'success' | 'secondary' => {
  switch (layer) {
    case 'screen': return 'info';
    case 'function': return 'success';
    case 'api': case 'API': return 'warning';
    default: return 'secondary';
  }
};

const ActivityTable = ({
  logs,
  totalRecords,
  loading,
  first,
  rows,
  autoRefresh,
  sortField,
  sortOrder,
  onPageChange,
  onSort,
  onRowClick,
}: ActivityTableProps) => {
  const tableData = useMemo(() => {
    return logs.map((log) => ({ ...log, id: log._id || log.id }));
  }, [logs]);

  const exportColumns = useMemo(() => [
    { field: 'EventTimeStamp', header: 'Timestamp' },
    { field: 'layer', header: 'Layer' },
    { field: 'eventcode', header: 'Event Code' },
    { field: 'message', header: 'Message' },
    { field: 'actor', header: 'Actor' },
    { field: 'endpoint', header: 'Endpoint' },
  ], []);

  const fetchExportData = useCallback(async () => {
    return tableData.map((log) => ({
      EventTimeStamp: formatTimestamp(log.EventTimeStamp || log.createdAt),
      layer: log.layer?.toUpperCase() || '-',
      eventcode: log.eventcode || '-',
      message: log.message || '-',
      actor: log.actorName || log.actorRole || '-',
      endpoint: log.endpoint || '-',
    }));
  }, [tableData]);

  const columns: DataTableColumn<LogTransaction>[] = useMemo(() => [
    {
      field: 'EventTimeStamp',
      header: 'Timestamp',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <span className="font-mono text-xs text-gray-900 dark:text-white">
          {formatTimestamp(rowData.EventTimeStamp || rowData.createdAt)}
        </span>
      ),
      style: { width: '140px' },
    },
    {
      field: 'layer',
      header: 'Layer',
      sortable: true,
      body: (rowData: LogTransaction) => (
        rowData.layer ? (
          <Tag value={rowData.layer.toUpperCase()} severity={getLayerColor(rowData.layer as LogLayer)} />
        ) : <span className="text-gray-400">-</span>
      ),
      style: { width: '90px' },
    },
    {
      field: 'eventcode',
      header: 'Event Code',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <span className="text-gray-900 dark:text-white font-mono text-xs">{rowData.eventcode || '-'}</span>
      ),
    },
    {
      field: 'message',
      header: 'Message',
      sortable: false,
      style: { width: '15%', minWidth: '130px', maxWidth: '200px' },
      body: (rowData: LogTransaction) => (
        <span className="text-gray-600 dark:text-gray-400 text-xs line-clamp-1">{rowData.message || '-'}</span>
      ),
    },
    {
      field: 'actorName',
      header: 'Actor',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <div>
          <span className="text-gray-900 dark:text-white text-xs">{rowData.actorName || rowData.actorRole || '-'}</span>
          {rowData.actorName && rowData.actorRole && (
            <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">({rowData.actorRole})</span>
          )}
        </div>
      ),
    },
    {
      field: 'endpoint',
      header: 'Endpoint',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">{rowData.endpoint || '-'}</span>
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      body: (rowData: LogTransaction) => (
        <div className="flex justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); onRowClick(rowData); }}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
          >
            View Details
          </button>
        </div>
      ),
      style: { width: '100px' },
    },
  ], [onRowClick]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Log Stream</h3>
        <div className="flex items-center gap-2">
          {autoRefresh && (
            <>
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-600 dark:text-gray-400">Live streaming</span>
            </>
          )}
          <ExportButton
            fetchData={fetchExportData}
            columns={exportColumns}
            filename="audit-logs"
            testId="AuditDashboard.Button.Export"
          />
        </div>
      </div>

      <DataTable
        data={tableData}
        columns={columns}
        loading={loading}
        dataKey="id"
        emptyMessage="No logs found"
        paginator
        lazy
        first={first}
        rows={rows}
        totalRecords={totalRecords}
        onPage={onPageChange}
        sortField={sortField}
        sortOrder={sortOrder}
        onSort={onSort}
        rowsPerPageOptions={[5, 10, 25, 50, 100]}
      />
    </div>
  );
};

export default ActivityTable;
