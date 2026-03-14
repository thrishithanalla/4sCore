import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Calendar } from 'primereact/calendar';
import { InputText } from 'primereact/inputtext';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { errorLogsService } from '../../services/error-logs.service';
import { valueSetsService } from '../../services/value-sets.service';
import type { ErrorLog, ErrorLogSearchParams } from '../../types';
import ErrorLogDetailDrawer from './error-log-detail-drawer';

interface ErrorLogsPageProps {
  embedded?: boolean;
}

const ErrorLogsPage = ({ embedded = false }: ErrorLogsPageProps) => {
  const [filters, setFilters] = useState<ErrorLogSearchParams>({
    page: 1,
    page_size: 50,
  });
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch value sets for dropdowns
  const { data: severityItems = [] } = useQuery({
    queryKey: ['value-sets', 'errorSeverity'],
    queryFn: () => valueSetsService.getItems('errorSeverity', 'en'),
  });

  const { data: sourceTypeItems = [] } = useQuery({
    queryKey: ['value-sets', 'sourceType'],
    queryFn: () => valueSetsService.getItems('sourceType', 'en'),
  });

  const { data: environmentItems = [] } = useQuery({
    queryKey: ['value-sets', 'environment'],
    queryFn: () => valueSetsService.getItems('environment', 'en'),
  });

  // Fetch error logs
  const {
    data: logsResponse,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['error-logs', filters],
    queryFn: () => errorLogsService.search(filters),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFilterChange = (key: keyof ErrorLogSearchParams, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      page: 1,
      page_size: 50,
    });
  };

  const handleRowClick = (log: ErrorLog) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const blob = await errorLogsService.exportCSV(filters);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `error-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'success' | null => {
    switch (severity) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return null;
    }
  };

  const severityOptions = [
    { label: 'All Severities', value: '' },
    ...severityItems.map((item) => ({
      label: item.label,
      value: item.code,
    })),
  ];

  const sourceTypeOptions = [
    { label: 'All Source Types', value: '' },
    ...sourceTypeItems.map((item) => ({
      label: item.label,
      value: item.code,
    })),
  ];

  const environmentOptions = [
    { label: 'All Environments', value: '' },
    ...environmentItems.map((item) => ({
      label: item.label,
      value: item.code,
    })),
  ];

  // Map data for DataTable
  const tableData = useMemo(() => {
    return (logsResponse?.data || []).map((log) => ({
      ...log,
      id: log._id || log.id,
    }));
  }, [logsResponse?.data]);

  const columns: DataTableColumn<ErrorLog>[] = useMemo(() => [
    {
      field: 'eventDateTime',
      header: 'Date & Time',
      sortable: true,
      body: (rowData: ErrorLog) => new Date(rowData.eventDateTime).toLocaleString(),
    },
    {
      field: 'errorCode',
      header: 'Error Code',
      sortable: true,
    },
    {
      field: 'errorSeverity',
      header: 'Severity',
      sortable: true,
      body: (rowData: ErrorLog) => (
        <Tag value={rowData.errorSeverity} severity={getSeverityColor(rowData.errorSeverity)} />
      ),
    },
    {
      field: 'sourceType',
      header: 'Source Type',
      sortable: true,
    },
    {
      field: 'sourceName',
      header: 'Source Name',
      sortable: true,
    },
    {
      field: 'environment',
      header: 'Environment',
      sortable: true,
      body: (rowData: ErrorLog) => (
        <Tag value={rowData.environment?.toUpperCase()} />
      ),
    },
    {
      field: 'resolvedMessage',
      header: 'Message',
      sortable: false,
      body: (rowData: ErrorLog) => (
        <span className="line-clamp-2">{rowData.resolvedMessage}</span>
      ),
    },
  ], []);

  return (
    <div className={embedded ? '' : 'py-4 px-4'} data-testid="SCR-ErrorLogs">
      {!embedded && (
        <div className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
              <i className="pi pi-exclamation-circle" style={{ fontSize: '1rem', color: 'white' }} />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Application Logs Monitor
            </h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 ml-11">
            View and analyze system error logs, track issues, and monitor application health
          </p>
        </div>
      )}
      {/* Filters Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-3">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Search & Filter Error Logs
          </h3>
          <div className="flex gap-2">
            <Button
              label={isExporting ? 'Exporting...' : 'Export CSV'}
              icon={isExporting ? 'pi pi-spin pi-spinner' : 'pi pi-download'}
              severity="secondary"
              outlined
              onClick={handleExportCSV}
              disabled={isExporting}
              testId="ErrorLogs.Button.Export"
            />
            <RefreshButton
              onClick={() => refetch()}
              loading={isLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Search Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search Message
            </label>
            <div className="relative">
              <InputText
                value={filters.q || ''}
                onChange={(e) => handleFilterChange('q', e.target.value)}
                placeholder="Search in resolved message..."
                className="w-full"
                data-testid="ErrorLogs.Filter.Search"
              />
              {filters.q && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  onClick={() => handleFilterChange('q', '')}
                >
                  <i className="pi pi-times" style={{ fontSize: '1rem' }} />
                </button>
              )}
            </div>
          </div>

          {/* Error Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Error Code
            </label>
            <InputText
              value={filters.errorCode || ''}
              onChange={(e) => handleFilterChange('errorCode', e.target.value)}
              placeholder="e.g., ERR.CORE.API.CREATE"
              className="w-full"
              data-testid="ErrorLogs.Filter.ErrorCode"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Severity
            </label>
            <Dropdown
              value={filters.errorSeverity || ''}
              options={severityOptions}
              onChange={(e: { value: string }) => handleFilterChange('errorSeverity', e.value)}
              placeholder="All Severities"
              className="w-full"
              data-testid="ErrorLogs.Filter.Severity"
            />
          </div>

          {/* Source Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source Type
            </label>
            <Dropdown
              value={filters.sourceType || ''}
              options={sourceTypeOptions}
              onChange={(e: { value: string }) => handleFilterChange('sourceType', e.value)}
              placeholder="All Source Types"
              className="w-full"
              data-testid="ErrorLogs.Filter.SourceType"
            />
          </div>

          {/* Source Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Source Name
            </label>
            <InputText
              value={filters.sourceName || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFilterChange('sourceName', e.target.value)}
              placeholder="e.g., POST /api/v1/cases"
              className="w-full"
              data-testid="ErrorLogs.Filter.SourceName"
            />
          </div>

          {/* Environment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Environment
            </label>
            <Dropdown
              value={filters.environment || ''}
              options={environmentOptions}
              onChange={(e: { value: string }) => handleFilterChange('environment', e.value)}
              placeholder="All Environments"
              className="w-full"
              data-testid="ErrorLogs.Filter.Environment"
            />
          </div>

          {/* Actor User ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Actor User ID
            </label>
            <InputText
              value={filters.actorUserId || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFilterChange('actorUserId', e.target.value)}
              placeholder="Filter by user ID"
              className="w-full"
              data-testid="ErrorLogs.Filter.ActorUserId"
            />
          </div>

          {/* From Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              From Date
            </label>
            <Calendar
              value={filters.fromDate ? new Date(filters.fromDate) : null}
              onChange={(e) => handleFilterChange('fromDate', e.value instanceof Date ? e.value.toISOString() : undefined)}
              showTime
              hourFormat="24"
              className="w-full"
              data-testid="ErrorLogs.Filter.FromDate"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              To Date
            </label>
            <Calendar
              value={filters.toDate ? new Date(filters.toDate) : null}
              onChange={(e) => handleFilterChange('toDate', e.value instanceof Date ? e.value.toISOString() : undefined)}
              showTime
              hourFormat="24"
              className="w-full"
              data-testid="ErrorLogs.Filter.ToDate"
            />
          </div>

          {/* Clear Filters Button */}
          <div className="md:col-span-2 flex justify-end">
            <Button
              label="Clear All Filters"
              severity="secondary"
              outlined
              onClick={handleClearFilters}
              testId="ErrorLogs.Button.ClearFilters"
              size="large"
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <DataTable
          data={tableData}
          columns={columns}
          loading={isLoading}
          emptyMessage="No error logs found"
          dataKey="id"
          onRowClick={(e: { data: ErrorLog }) => handleRowClick(e.data)}
          rowClassName={() => 'cursor-pointer'}
        />
      </div>

      {/* Detail Drawer */}
      <ErrorLogDetailDrawer
        open={drawerOpen}
        errorLog={selectedLog}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLog(null);
        }}
      />
    </div>
  );
};

export default ErrorLogsPage;
