import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag } from 'primereact/tag';
import { Input } from 'mainFe/Input';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Dropdown } from 'mainFe/Dropdown';
import { Tooltip } from 'mainFe/Tooltip';
import { StatCard } from 'mainFe/StatCard';
import { ExportButton } from 'mainFe/ExportButton';
import { formatTimestamp } from 'mainFe/dateUtils';
import { useQuery } from '@tanstack/react-query';
import { logTransactionService } from '../../services/log-transaction.service';
import type {
  LogTransaction,
  LogLevel,
  LogLayer,
  LogTransactionSearchParams,
  LogStats,
  TopError,
  ModuleErrorStats,
  LogVolumeData,
} from '../../types/log-transaction.types';
import LogDetailDrawer from './log-detail-drawer';
import TopErrorsDialog from './top-errors-dialog';

const LogTransactionList = () => {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filters, setFilters] = useState<LogTransactionSearchParams>({
    page: 1,
    page_size: 5,
  });
  const [first, setFirst] = useState(0); // DataTable first row index
  const [selectedLog, setSelectedLog] = useState<LogTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showTopErrors, setShowTopErrors] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch log transactions
  const {
    data: logsResponse,
    isLoading,
    refetch,
    error: logsError,
  } = useQuery({
    queryKey: ['log-transactions', filters],
    queryFn: async () => {
      const response = await logTransactionService.search(filters);
      console.log('Log transactions API response:', response);
      return response;
    },
  });

  // Fetch analytics
  const { data: analyticsResponse } = useQuery({
    queryKey: ['log-transactions-analytics', filters.fromDate, filters.toDate],
    queryFn: () => logTransactionService.getAnalytics({
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    }),
  });

  // Get stats from analytics response
  const stats: LogStats = analyticsResponse?.data || {
    total: 0,
    infoCount: 0,
    warningCount: 0,
    errorCount: 0,
  };

  // Mock data for charts (could be enhanced with more API endpoints later)
  const [topErrors] = useState<TopError[]>([
    { error: 'Database Connection Timeout', count: 234, module: 'Database Connection', trend: 'up', affectedUsers: 145 },
    { error: 'Document Processing Failed', count: 189, module: 'Investigation Copilot-POCSO', trend: 'down', affectedUsers: 98 },
    { error: 'CDR Analysis Timeout', count: 156, module: 'CDR/IPDR', trend: 'stable', affectedUsers: 76 },
    { error: 'WhatsApp Extraction Failed', count: 134, module: 'WhatsApp Summary', trend: 'up', affectedUsers: 89 },
    { error: 'Auth Token Expired', count: 123, module: 'Auth Service', trend: 'down', affectedUsers: 234 },
  ]);

  const [moduleErrors] = useState<ModuleErrorStats[]>([
    { name: 'Database Connection', errors: 423, percentage: 45 },
    { name: 'Investigation Copilot-POCSO', errors: 312, percentage: 33 },
    { name: 'CDR/IPDR', errors: 198, percentage: 21 },
    { name: 'WhatsApp Summary', errors: 156, percentage: 17 },
    { name: 'API Gateway', errors: 89, percentage: 9 },
  ]);

  const [volumeTrend] = useState<LogVolumeData[]>([
    { hour: 0, count: 1200, percentage: 45 },
    { hour: 2, count: 1400, percentage: 52 },
    { hour: 4, count: 1280, percentage: 48 },
    { hour: 6, count: 1750, percentage: 65 },
    { hour: 8, count: 1550, percentage: 58 },
    { hour: 10, count: 1940, percentage: 72 },
    { hour: 12, count: 1830, percentage: 68 },
    { hour: 14, count: 2290, percentage: 85 },
    { hour: 16, count: 2100, percentage: 78 },
    { hour: 18, count: 2480, percentage: 92 },
    { hour: 20, count: 2370, percentage: 88 },
    { hour: 22, count: 2560, percentage: 95 },
  ]);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        refetch();
      }, 10000); // Refresh every 10 seconds
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, refetch]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFilterChange = (key: keyof LogTransactionSearchParams, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1, // Reset to first page when filters change
    }));
    setFirst(0); // Reset DataTable first row index
  };

  // Handle DataTable pagination
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setFilters((prev) => ({
      ...prev,
      page: newPage,
      page_size: event.rows,
    }));
  };

  const handleRowClick = (log: LogTransaction) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  const getLevelColor = (level: LogLevel): 'info' | 'warning' | 'danger' | 'secondary' => {
    switch (level) {
      case 'info':
        return 'info';
      case 'warning':
        return 'warning';
      case 'error':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const getLevelIcon = (level: LogLevel): string => {
    switch (level) {
      case 'info':
        return 'pi pi-info-circle';
      case 'warning':
        return 'pi pi-exclamation-triangle';
      case 'error':
        return 'pi pi-times-circle';
      default:
        return 'pi pi-info-circle';
    }
  };

  const getLayerColor = (layer: LogLayer): 'info' | 'warning' | 'success' | 'secondary' => {
    switch (layer) {
      case 'screen':
        return 'info';
      case 'function':
        return 'success';
      case 'api':
        return 'warning';
      case 'config':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const levelOptions = [
    { label: 'All Levels', value: '' },
    { label: 'Info', value: 'info' },
    { label: 'Warning', value: 'warning' },
    { label: 'Error', value: 'error' },
  ];

  const layerOptions = [
    { label: 'All Layers', value: '' },
    { label: 'Screen', value: 'screen' },
    { label: 'Function', value: 'function' },
    { label: 'API', value: 'api' },
    { label: 'Config', value: 'config' },
  ];

  // Map data for DataTable
  // API returns { success, code, message, data: { items: [...], page, page_size, total, total_pages } }
  const tableData = useMemo(() => {
    const items = logsResponse?.data?.items;
    if (!items || !Array.isArray(items)) {
      return [];
    }
    return items.map((log) => ({
      ...log,
      id: log._id || log.id,
    }));
  }, [logsResponse]);

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'EventTimeStamp', header: 'Timestamp' },
    { field: 'layer', header: 'Layer' },
    { field: 'eventcode', header: 'Event Code' },
    { field: 'message', header: 'Message' },
    { field: 'actorRole', header: 'Actor Role' },
    { field: 'endpoint', header: 'Endpoint' },
  ], []);

  // Fetch data for export - formats current table data for Excel
  const fetchExportData = useCallback(async () => {
    return tableData.map((log) => ({
      EventTimeStamp: formatTimestamp(log.EventTimeStamp || log.createdAt),
      layer: log.layer?.toUpperCase() || '-',
      eventcode: log.eventcode || '-',
      message: log.message || '-',
      actorRole: log.actorRole || '-',
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
          <Tag
            value={rowData.layer.toUpperCase()}
            severity={getLayerColor(rowData.layer as LogLayer)}
          />
        ) : <span className="text-gray-400">-</span>
      ),
      style: { width: '90px' },
    },
    {
      field: 'eventcode',
      header: 'Event Code',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <span className="text-gray-900 dark:text-white font-mono text-xs">
          {rowData.eventcode || '-'}
        </span>
      ),
    },
    {
      field: 'message',
      header: 'Message',
      sortable: false,
      style: { width: '15%', minWidth: '130px', maxWidth: '200px' },
      body: (rowData: LogTransaction) => (
        <span className="text-gray-600 dark:text-gray-400 text-xs line-clamp-1">
          {rowData.message || '-'}
        </span>
      ),
    },
    {
      field: 'actorRole',
      header: 'Actor Role',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <span className="text-gray-900 dark:text-white text-xs">{rowData.actorRole || '-'}</span>
      ),
    },
    {
      field: 'endpoint',
      header: 'Endpoint',
      sortable: true,
      body: (rowData: LogTransaction) => (
        <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
          {rowData.endpoint || '-'}
        </span>
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      body: (rowData: LogTransaction) => (
        <div className="flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRowClick(rowData);
            }}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
          >
            View Details
          </button>
        </div>
      ),
      style: { width: '100px' },
    },
  ], []);

  return (
    <div className="py-2 px-3" data-testid="SCR-LogTransaction">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <i className="pi pi-list" style={{ fontSize: '0.875rem', color: 'white' }} />
              </div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                Application Logs Monitor
              </h1>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 ml-9">
              Real-time application logging and analysis
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-all ${
                autoRefresh
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}
              data-testid="LogTransaction.Button.Live"
            > 
              <i className={`pi pi-refresh ${autoRefresh ? 'pi-spin' : ''}`} style={{ fontSize: '0.75rem' }} />
              Live
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '0.5rem' }}>
        <StatCard
          title="Total Logs"
          value={stats.total.toLocaleString()}
          subtitle="All log entries"
          variant="blue"
          icon={<i className="pi pi-chart-line" />}
          // @ts-ignore - horizontal prop
          horizontal
        />
        <StatCard
          title="Info"
          value={stats.infoCount.toLocaleString()}
          subtitle={`${stats.total > 0 ? ((stats.infoCount / stats.total) * 100).toFixed(1) : 0}% of total`}
          variant="green"
          icon={<i className="pi pi-info-circle" />}
          trendIcon={<i className="pi pi-arrow-up" />}
          // @ts-ignore - horizontal prop
          horizontal
        />
        <StatCard
          title="Warnings"
          value={stats.warningCount.toLocaleString()}
          subtitle={`${stats.total > 0 ? ((stats.warningCount / stats.total) * 100).toFixed(1) : 0}% of total`}
          variant="orange"
          icon={<i className="pi pi-exclamation-triangle" />}
          // @ts-ignore - horizontal prop
          horizontal
        />
        <div onClick={() => setShowTopErrors(true)} style={{ cursor: 'pointer' }}>
          <StatCard
            title="Errors"
            value={stats.errorCount.toLocaleString()}
            subtitle={`${stats.total > 0 ? ((stats.errorCount / stats.total) * 100).toFixed(1) : 0}% - Click for details`}
            variant="red"
            icon={<i className="pi pi-times-circle" />}
            // @ts-ignore - horizontal prop
            horizontal
          />
        </div>
      </div>

      {/* Filters Bar */}
      <Tooltip target="[data-pr-tooltip]" />
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 mb-2" style={{ padding: '0.625rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
              Log Level
            </label>
            <Dropdown
              value={filters.level ?? ''}
              options={levelOptions}
              onChange={(e: { value: string }) => handleFilterChange('level', e.value)}
              placeholder="All Levels"
              className="w-full"
              data-testid="LogTransaction.Filter.Level"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
              Layer
            </label>
            <Dropdown
              value={filters.layer ?? ''}
              options={layerOptions}
              onChange={(e: { value: string }) => handleFilterChange('layer', e.value)}
              placeholder="All Layers"
              className="w-full"
              data-testid="LogTransaction.Filter.Layer"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
              Search Message
            </label>
            <Input
              name="search"
              value={filters.search || ''}
              onChange={(e: any) => handleFilterChange('search', e.target.value)}
              placeholder="Search in message..."
              icon="pi pi-search"
              className="w-full"
              testId="LogTransaction.Filter.Search"
            />
          </div>
          <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => {
                setFilters({ page: 1, page_size: 5 });
                setFirst(0);
              }}
              data-testid="LogTransaction.Button.ClearFilters"
              data-pr-tooltip="Clear Filters"
            >
              <i className="pi pi-filter-slash text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      {/* <div className="grid grid-cols-2 gap-3 mb-2"> */}
        {/* Log Volume Trend */}
        {/* <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Log Volume Trend (Last 24 Hours)
          </h3>
          <div className="h-48 flex items-end justify-between gap-1">
            {volumeTrend.map((data, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-blue-500 rounded-t cursor-pointer hover:bg-blue-600 transition-colors"
                  style={{ height: `${data.percentage}%` }}
                  title={`${data.count} logs at ${data.hour}:00`}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">{data.hour}h</span>
              </div>
            ))}
          </div>
        </div> */}

        {/* Top Error-Prone Modules */}
        {/* <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Top Error-Prone Modules
          </h3>
          <div className="space-y-3">
            {moduleErrors.map((module, idx) => (
              <div key={idx} className="cursor-pointer hover:opacity-80 transition-opacity">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-900 dark:text-white">{module.name}</span>
                  <span className="text-red-600">{module.errors} errors</span>
                </div>
                <ProgressBar
                  value={module.percentage}
                  showValue={false}
                  className="h-2"
                  color="#ef4444"
                />
              </div>
            ))}
          </div>
        </div> */}
      {/* </div> */}

      {/* Error Message */}
      {logsError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 mb-2">
          <div className="flex items-center gap-2">
            <i className="pi pi-exclamation-circle text-red-600" style={{ fontSize: '0.875rem' }} />
            <span className="text-red-700 dark:text-red-300 font-medium text-sm">
              Failed to load logs: {(logsError as Error)?.message || 'Unknown error'}
            </span>
          </div>
        </div>
      )}

      {/* Real-time Log Stream */}
      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Log Stream
          </h3>
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
              filename="log-transactions"
              testId="LogTransaction.Button.Export"
            />
          </div>
        </div>

        <DataTable
          data={tableData}
          columns={columns}
          loading={isLoading}
          dataKey="id"
          emptyMessage="No logs found"
          paginator
          lazy
          first={first}
          rows={filters.page_size || 5}
          totalRecords={logsResponse?.data?.total || 0}
          onPage={handlePageChange}
          rowsPerPageOptions={[5, 10, 25, 50, 100]}
        />
      </div>

      {/* Log Detail Drawer */}
      <LogDetailDrawer
        open={drawerOpen}
        log={selectedLog}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLog(null);
        }}
      />

      {/* Top 10 Errors Dialog */}
      <TopErrorsDialog
        visible={showTopErrors}
        onHide={() => setShowTopErrors(false)}
        errors={topErrors}
        onInvestigate={(error) => {
          console.log('Investigating:', error);
          setShowTopErrors(false);
        }}
      />
    </div>
  );
};

export default LogTransactionList;
