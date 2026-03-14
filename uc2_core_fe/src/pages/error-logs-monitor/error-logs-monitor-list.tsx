/**
 * Error Logs Monitor Page
 * Dashboard view for tracking, analyzing, and resolving application errors
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag } from 'primereact/tag';
import { Input } from 'mainFe/Input';
import { Toast } from 'primereact/toast';
import { Skeleton } from 'primereact/skeleton';
import { DataTable } from 'mainFe/DataTable';
import { Dropdown } from 'mainFe/Dropdown';
import { StatCard } from 'mainFe/StatCard';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useQuery } from '@tanstack/react-query';
import { errorLogsService } from '../../services/error-logs.service';
import type {
  ErrorLogSearchParams,
  ErrorLogDashboardStats,
  ErrorGroup,
  ErrorLogTrend,
} from '../../types';
import type {
  ErrorSeverity,
  ErrorStatus,
  TimeRange,
} from '../../types/error-logs.types';
import ErrorDetailDrawer from './error-detail-drawer';
import './error-logs-monitor-list.css';
import { modulesService } from '../../services/modules.service';

const ErrorLogsMonitorList = () => {
  const toast = useRef<Toast>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [filters, setFilters] = useState<ErrorLogSearchParams>({
    page: 1,
    limit: 5,
    includeArchive: false,
  });
  const [first, setFirst] = useState(0);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedError, setSelectedError] = useState<ErrorGroup | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search effect
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        q: searchInput || undefined,
        page: 1,
      }));
      setFirst(0);
    }, 500);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput]);

  // Fetch dashboard data
  const {
    data: dashboardResponse,
    isLoading: dashboardLoading,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['error-logs-dashboard', timeRange, filters.sourceType, filters.errorSeverity, (filters as any).module, filters.q, filters.page, (filters as any).limit, filters.includeArchive, sortField, sortOrder],
    queryFn: () => errorLogsService.getDashboardData({
      timeRange,
      sourceType: filters.sourceType,
      errorSeverity: filters.errorSeverity,
      moduleId: (filters as any).module,
      errorCode: filters.q,
      includeArchive: filters.includeArchive,
      page: filters.page,
      limit: (filters as any).limit,
      ...(sortField && { sort_by: sortField, sort_order: sortOrder === 1 ? 'asc' : 'desc' }),
    }),
  });

  // Dashboard stats
  const dashboardStats: ErrorLogDashboardStats | null = dashboardResponse?.data || null;

  // Pagination data from API response
  // API returns: { data: { ..., pagination: { page, limit, totalItems, totalPages, hasNextPage, hasPrevPage } } }
  const paginationData = useMemo(() => {
    const pagination = (dashboardResponse as any)?.data?.pagination || (dashboardResponse as any)?.pagination || {};
    return {
      page: pagination?.page ?? filters.page ?? 1,
      limit: pagination?.limit ?? (filters as any).limit ?? 5,
      totalItems: pagination?.totalItems ?? 0,
      totalPages: pagination?.totalPages ?? 0,
      hasNextPage: pagination?.hasNextPage ?? false,
      hasPrevPage: pagination?.hasPrevPage ?? false,
    };
  }, [dashboardResponse, filters.page, (filters as any).limit]);

  // Auto-refresh functionality
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        refetchDashboard();
      }, 10000);
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, refetchDashboard]);

  // Time range options
  const timeRangeOptions = [
    { label: 'ALL', value: 'all' },
    { label: 'Last hour', value: '1h' },
    { label: 'Last 24 hours', value: '24h' },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
  ];

  // Error type options - dynamic from dashboard data
  const errorTypeOptions = useMemo(() => {
    const sourceTypes = (dashboardStats as any)?.sourceTypes || [];
    const dynamicOptions = sourceTypes.map((type: any) => {
      // Handle both string and object formats
      const typeValue = typeof type === 'string' ? type : (type?.value || type?.name || type?.type || '');
      return {
        label: typeValue.charAt(0).toUpperCase() + typeValue.slice(1).toLowerCase(),
        value: typeValue,
      };
    }).filter((opt: any) => opt.value); // Filter out empty values
    return [{ label: 'All Types', value: '' }, ...dynamicOptions];
  }, [(dashboardStats as any)?.sourceTypes]);
  

  // Severity options
   // Fetch modules for dropdown
    const { data: modules = [] } = useQuery({
      queryKey: ['modules-dropdown'],
      queryFn: () => modulesService.getAllForDropdown(),
    });

  const severityOptions = useMemo(() => {
    const severityLevels = (dashboardStats as any)?.severityLevels || [];
    const dynamicOptions = severityLevels.map((severity: any) => {
      // Handle both string and object formats
      const severityValue = typeof severity === 'string' ? severity : (severity?.value || severity?.name || severity?.level || '');
      return {
        label: severityValue.charAt(0).toUpperCase() + severityValue.slice(1).toLowerCase(),
        value: severityValue,
      };
    }).filter((opt: any) => opt.value); // Filter out empty values
    return [{ label: 'All Severities', value: '' }, ...dynamicOptions];
  }, [(dashboardStats as any)?.severityLevels]);


   const modulesOptions = [
    { label: 'All Modules', value: '' },
    ...modules.map((m) => ({ label: m.name, value: m._id })),
  ];
  // Calculate source type stats
  const sourceTypeStats = useMemo(() => {
    const byType = dashboardStats?.byType || {};
    return {
      API: byType['API'] || { count: 0, unique: 0, affectedUsers: 0 },
      SCREEN: byType['SCREEN'] || { count: 0, unique: 0, affectedUsers: 0 },
      FUNCTION: byType['FUNCTION'] || { count: 0, unique: 0, affectedUsers: 0 },
      THIRDPARTY: byType['THIRDPARTY'] || { count: 0, unique: 0, affectedUsers: 0 },
    };
  }, [dashboardStats]);

  // Handle filter changes
  const handleFilterChange = (key: keyof ErrorLogSearchParams, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1,
    }));
    setFirst(0);
  };

  // Handle page change
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setFilters((prev) => ({
      ...prev,
      page: newPage,
      limit: event.rows,
    } as any));
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    setFilters((prev) => ({
      ...prev,
      page: 1,
    }));
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => errorLogsService.exportCSV(), []);

  // Get severity tag color
  const getSeverityColor = (severity: ErrorSeverity): 'danger' | 'warning' | 'info' | 'success' | null => {
    switch (severity) {
      case 'CRITICAL': return 'danger';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'success';
      default: return null;
    }
  };

  // Get status tag color
  const getStatusColor = (status: ErrorStatus): 'danger' | 'warning' | 'info' | 'success' => {
    switch (status) {
      case 'UNRESOLVED': return 'danger';
      case 'INVESTIGATING': return 'warning';
      case 'MONITORING': return 'info';
      case 'RESOLVED': return 'success';
      default: return 'info';
    }
  };

  // Get source type icon
  const getSourceTypeIcon = (type: string): string => {
    switch (type?.toUpperCase()) {
      case 'API': return 'pi pi-server';
      case 'SCREEN': return 'pi pi-desktop';
      case 'FUNCTION': return 'pi pi-code';
      case 'THIRDPARTY': return 'pi pi-external-link';
      default: return 'pi pi-box';
    }
  };

  // Error groups from dashboard
  const errorGroups: ErrorGroup[] = dashboardStats?.errorGroups || [];

  // Trend data - normalize and map from API response
  const trendData: ErrorLogTrend[] = useMemo(() => {
    const rawTrends = dashboardStats?.trends || [];
    return rawTrends.map((trend: any) => {
      // Handle bySourceType nested structure
      const bySourceType = trend.bySourceType || {};

      // Get value from bySourceType or direct property
      const getValue = (type: string) => {
        const upperType = type.toUpperCase();
        // Check bySourceType first (nested structure from API)
        if (bySourceType[upperType] !== undefined) {
          return typeof bySourceType[upperType] === 'number'
            ? bySourceType[upperType]
            : bySourceType[upperType]?.count ?? bySourceType[upperType]?.totalErrors ?? 0;
        }
        // Fallback to direct property
        const directValue = trend[upperType] ?? trend[type.toLowerCase()] ?? trend[type];
        return typeof directValue === 'number' ? directValue : 0;
      };

      return {
        hour: trend.hour ?? trend.Hour ?? trend._id?.hour ?? 0,
        API: getValue('API'),
        UI: getValue('UI'),
        SCREEN: getValue('SCREEN'),
        THIRDPARTY: getValue('THIRDPARTY'),
        FUNCTION: getValue('FUNCTION'),
      };
    });
  }, [dashboardStats?.trends]);

  // Impact data - safely extract numeric values
  const rawImpact = dashboardStats?.impact;
  const impactData = {
    critical: typeof rawImpact?.critical === 'number' ? rawImpact.critical : 0,
    high: typeof rawImpact?.high === 'number' ? rawImpact.high : 0,
    totalAffectedUsers: typeof rawImpact?.totalAffectedUsers === 'number' ? rawImpact.totalAffectedUsers : 0,
    criticalErrorRate: typeof rawImpact?.criticalErrorRate === 'number' ? rawImpact.criticalErrorRate : 0,
    highErrorRate: typeof rawImpact?.highErrorRate === 'number' ? rawImpact.highErrorRate : 0,
  };

  // Total unique users affected (calculated from severity stats)
  const criticalAffectedUsers = dashboardStats?.bySeverity?.['CRITICAL']?.affectedUsers || 0;
  const highAffectedUsers = dashboardStats?.bySeverity?.['HIGH']?.affectedUsers || 0;
  const totalAffectedUsers = impactData.totalAffectedUsers || (criticalAffectedUsers + highAffectedUsers);

  // Error rate calculation
  const totalErrors = dashboardStats?.summary?.totalErrors || 0;
  const errorRate = totalErrors > 0 ? ((impactData.criticalErrorRate || 0) + (impactData.highErrorRate || 0)).toFixed(1) : '0';


  // Error groups table columns
  const errorGroupColumns = [
    {
      field: 'errorCode',
      header: 'ERROR NAME',
      sortable: true,
      body: (rowData: ErrorGroup) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm text-gray-900 dark:text-white">
            {rowData.errorCode}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {rowData.sourceName}
          </span>
        </div>
      ),
    },
    {
      field: 'sourceType',
      header: 'TYPE',
      sortable: true,
      style: { width: '100px' },
      body: (rowData: ErrorGroup) => (
        <div className="flex items-center gap-1.5">
          <i className={`${getSourceTypeIcon(rowData.sourceType)} text-gray-500 text-xs`} />
          <span className="text-gray-600 dark:text-gray-400 uppercase text-xs">
            {rowData.sourceType}
          </span>
        </div>
      ),
    },
    {
      field: 'occurrences',
      header: 'COUNT',
      sortable: true,
      style: { width: '90px' },
      body: (rowData: ErrorGroup) => (
        <span className="font-medium text-sm text-gray-900 dark:text-white">
          {(rowData.occurrences || 0).toLocaleString()}
        </span>
      ),
    },
    {
      field: 'affectedUsers',
      header: 'USERS',
      sortable: true,
      style: { width: '100px' },
      body: (rowData: ErrorGroup) => (
        <div className="flex items-center gap-1">
          <i className="pi pi-users text-gray-400 text-xs" />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {(rowData.affectedUsers || 0).toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      field: 'severity',
      header: 'SEVERITY',
      sortable: true,
      style: { width: '90px' },
      body: (rowData: ErrorGroup) => (
        <Tag
          value={rowData.severity || 'MEDIUM'}
          severity={getSeverityColor((rowData.severity || 'MEDIUM') as ErrorSeverity)}
        />
      ),
    },
    {
      field: 'firstSeen',
      header: 'FIRST/LAST',
      sortable: true,
      style: { width: '160px' },
      body: (rowData: ErrorGroup) => {
        const formatDateTime = (dateStr: string | null) => {
          if (!dateStr) return '-';
          const date = new Date(dateStr);
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${day}-${month}-${year} ${hours}:${minutes}`;
        };
        return (
          <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
            <span>{formatDateTime(rowData.firstSeen)}</span>
            <span>{formatDateTime(rowData.lastSeen)}</span>
          </div>
        );
      },
    },
    {
      field: 'actions',
      header: 'ACTION',
      headerStyle: { textAlign: 'center' },
      style: { width: '90px' },
      body: (rowData: ErrorGroup) => (
        <div className="flex justify-center">
          <button
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedError(rowData);
              setDrawerOpen(true);
            }}
          >
            View
          </button>
        </div>
      ),
    },
  ];

  // Calculate max trend value for chart scaling
  const maxTrendValue = useMemo(() => {
    if (!trendData.length) return 100;
    let max = 0;
    trendData.forEach((point) => {
      const total = (point.API || 0) + (point.SCREEN || 0) + (point.UI || 0) + (point.THIRDPARTY || 0) + (point.FUNCTION || 0);
      if (total > max) max = total;
    });
    return max || 100;
  }, [trendData]);

  // Loading skeleton
  if (dashboardLoading && !dashboardStats) {
    return (
      <div className="py-2 px-3">
        <div className="flex items-center justify-between mb-2">
          <Skeleton width="280px" height="32px" />
          <div className="flex gap-2">
            <Skeleton width="70px" height="32px" />
            <Skeleton width="70px" height="32px" />
            <Skeleton width="90px" height="32px" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="100px" />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-3 mb-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height="44px" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <Skeleton height="240px" />
          <Skeleton height="240px" />
        </div>
        <Skeleton height="320px" />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-2 px-3" data-testid="SCR-ErrorLogsMonitor">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center">
                <i className="pi pi-exclamation-triangle" style={{ fontSize: '0.875rem', color: 'white' }} />
              </div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                Error Logs Monitor
              </h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 ml-9">
              Track, analyze, and resolve application errors across all layers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-all ${
                autoRefresh
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}
              data-testid="ErrorLogs.Button.AutoRefresh"
            >
              <i className={`pi pi-refresh ${autoRefresh ? 'pi-spin' : ''}`} style={{ fontSize: '0.75rem' }} />
              Live
            </button>
          </div>
        </div>

        {/* Stats Cards - By Source Type */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '0.5rem' }} data-feedback="Error Stats Cards">
          <StatCard
            title="API Errors"
            value={sourceTypeStats.API.count.toLocaleString()}
            subtitle={`Unique: ${sourceTypeStats.API.unique}`}
            variant="blue"
            icon={<i className="pi pi-server" />}
            // @ts-ignore - horizontal prop
            horizontal
          />
          <StatCard
            title="Screen Errors"
            value={sourceTypeStats.SCREEN.count.toLocaleString()}
            subtitle={`Unique: ${sourceTypeStats.SCREEN.unique}`}
            variant="orange"
            icon={<i className="pi pi-desktop" />}
            // @ts-ignore - horizontal prop
            horizontal
          />
          <StatCard
            title="Function Errors"
            value={sourceTypeStats.FUNCTION.count.toLocaleString()}
            subtitle={`Unique: ${sourceTypeStats.FUNCTION.unique}`}
            variant="purple"
            icon={<i className="pi pi-code" />}
            // @ts-ignore - horizontal prop
            horizontal
          />
          <StatCard
            title="Third-party Errors"
            value={sourceTypeStats.THIRDPARTY.count.toLocaleString()}
            subtitle={`Unique: ${sourceTypeStats.THIRDPARTY.unique}`}
            variant="green"
            icon={<i className="pi pi-external-link" />}
            // @ts-ignore - horizontal prop
            horizontal
          />
        </div>

        {/* Filters Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 mb-2" style={{ padding: '0.625rem 0.75rem' }} data-feedback="Error Filters">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
                Time Range
              </label>
              <Dropdown
                value={timeRange}
                options={timeRangeOptions}
                onChange={(e: { value: TimeRange }) => setTimeRange(e.value)}
                placeholder="Select Time Range"
                className="w-full"
                data-testid="ErrorLogs.Filter.TimeRange"
                resetFilterOnHide={true}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
                Error Type
              </label>
              <Dropdown
                value={filters.sourceType ?? ''}
                options={errorTypeOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e: { value: string }) => handleFilterChange('sourceType', e.value)}
                placeholder="All Types"
                className="w-full"
                data-testid="ErrorLogs.Filter.ErrorType"
                resetFilterOnHide={true}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
                Severity
              </label>
              <Dropdown
                value={filters.errorSeverity ?? ''}
                options={severityOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e: { value: string }) => handleFilterChange('errorSeverity', e.value)}
                placeholder="All Severities"
                className="w-full"
                data-testid="ErrorLogs.Filter.Severity"
                resetFilterOnHide={true}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
                Module
              </label>
              <Dropdown
                value={(filters as any).module ?? ''}
                options={modulesOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e: { value: string }) => handleFilterChange('module' as any, e.value)}
                placeholder="All Modules"
                className="w-full"
                data-testid="ErrorLogs.Filter.Module"
                resetFilterOnHide={true}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
                Search Errors
              </label>
              <Input
                name="search"
                value={searchInput}
                onChange={(value: any) => setSearchInput(value)}
                placeholder="Search by error name, message..."
                icon="pi pi-search"
                className="w-full"
                testId="ErrorLogs.Filter.Search"
              />
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-3 mb-2" data-feedback="Error Charts Section">
          {/* Error Trend Chart */}
          <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col" data-feedback="Error Trend Chart">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex-shrink-0">
              Error Trend (Last 24 Hours)
            </h3>

            <div className="error-trend-chart-wrapper flex-1">
              <div className="error-trend-chart-container" style={{ height: '180px' }}>
                <div className="error-trend-chart">
                  {trendData.length > 0 ? (
                    trendData.map((point, idx) => {
                      const apiHeight = maxTrendValue > 0 ? ((point.API || 0) / maxTrendValue) * 100 : 0;
                      const screenHeight = maxTrendValue > 0 ? ((point.SCREEN || 0) / maxTrendValue) * 100 : 0;
                      const thirdpartyHeight = maxTrendValue > 0 ? ((point.THIRDPARTY || 0) / maxTrendValue) * 100 : 0;
                      const functionHeight = maxTrendValue > 0 ? ((point.FUNCTION || 0) / maxTrendValue) * 100 : 0;
                      return (
                        <div key={idx} className="error-trend-bar-group">
                          <div className="error-trend-bars">
                            {apiHeight > 0 && (
                              <div
                                className="error-trend-bar api"
                                style={{ height: `${apiHeight}%` }}
                                title={`API: ${point.API}`}
                              />
                            )}
                            {screenHeight > 0 && (
                              <div
                                className="error-trend-bar screen"
                                style={{ height: `${screenHeight}%` }}
                                title={`Screen: ${point.SCREEN}`}
                              />
                            )}
                            {thirdpartyHeight > 0 && (
                              <div
                                className="error-trend-bar thirdparty"
                                style={{ height: `${thirdpartyHeight}%` }}
                                title={`Third-party: ${point.THIRDPARTY}`}
                              />
                            )}
                            {functionHeight > 0 && (
                              <div
                                className="error-trend-bar function"
                                style={{ height: `${functionHeight}%` }}
                                title={`Function: ${point.FUNCTION}`}
                              />
                            )}
                          </div>
                          <span className="error-trend-hour-label">{point.hour}h</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                      No trend data available
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-red-400 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">API</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-orange-400 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Screen</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-teal-400 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Third-party</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-purple-400 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Function</span>
                </div>
              </div>
            </div>
          </div>

          {/* Impact Analysis */}
          <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700" data-feedback="Impact Analysis Chart">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Impact Analysis
            </h3>
            <div className="space-y-2">
              {/* Dynamic Severity Impact Cards */}
              {(() => {
                const bySeverityRaw = dashboardStats?.impact?.bySeverity || {};
                // Normalize keys to uppercase for consistent lookup
                const bySeverity: Record<string, any> = {};
                Object.keys(bySeverityRaw).forEach((key) => {
                  bySeverity[key.toUpperCase()] = bySeverityRaw[key];
                });
                const severityColors: Record<string, { bg: string; darkBg: string; border: string; darkBorder: string; text: string; darkText: string; boldText: string; darkBoldText: string }> = {
                  CRITICAL: { bg: 'bg-red-50', darkBg: 'dark:bg-red-900/20', border: 'border-red-200', darkBorder: 'dark:border-red-800', text: 'text-red-600', darkText: 'dark:text-red-400', boldText: 'text-red-700', darkBoldText: 'dark:text-red-300' },
                  HIGH: { bg: 'bg-orange-50', darkBg: 'dark:bg-orange-900/20', border: 'border-orange-200', darkBorder: 'dark:border-orange-800', text: 'text-orange-600', darkText: 'dark:text-orange-400', boldText: 'text-orange-700', darkBoldText: 'dark:text-orange-300' },
                  MEDIUM: { bg: 'bg-yellow-50', darkBg: 'dark:bg-yellow-900/20', border: 'border-yellow-200', darkBorder: 'dark:border-yellow-800', text: 'text-yellow-600', darkText: 'dark:text-yellow-400', boldText: 'text-yellow-700', darkBoldText: 'dark:text-yellow-300' },
                  LOW: { bg: 'bg-green-50', darkBg: 'dark:bg-green-900/20', border: 'border-green-200', darkBorder: 'dark:border-green-800', text: 'text-green-600', darkText: 'dark:text-green-400', boldText: 'text-green-700', darkBoldText: 'dark:text-green-300' },
                };
                const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

                return severityOrder
                  .filter((severity) => bySeverity[severity])
                  .map((severity) => {
                    const data = bySeverity[severity];
                    const colors = severityColors[severity] || severityColors.MEDIUM;
                    const label = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();

                    return (
                      <div key={severity} className={`${colors.bg} ${colors.darkBg} p-2.5 rounded-md border ${colors.border} ${colors.darkBorder}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className={`text-xs ${colors.text} ${colors.darkText}`}>{label} Impact</p>
                            <p className={`text-base font-bold ${colors.boldText} ${colors.darkBoldText}`}>
                              {(data.totalErrors || 0).toLocaleString()} errors
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Affected</p>
                            <p className={`text-base font-bold ${colors.text} ${colors.darkText}`}>
                              {(data.affectedUsers || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  });
              })()}

              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Affected</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {totalAffectedUsers?.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">unique users</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Error Rate</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">
                    {errorRate}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">of all requests</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Error Groups Table */}
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700" data-feedback="Error Groups Table">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Active Error Groups
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <i className="pi pi-exclamation-triangle text-xs" />
                <span>{errorGroups.filter((e) => (e as any).status === 'UNRESOLVED' || !(e as any).status).length} unresolved</span>
              </div>
              <ExportDataButton
                fetchBlob={fetchExportBlob}
                filename="error-logs-export.xlsx"
                testId="ErrorLogs.Button.Export"
              />
            </div>
          </div>
          <DataTable
            data={errorGroups.map((eg, idx) => ({ ...eg, id: eg.errorCode + idx }))}
            columns={errorGroupColumns}
            loading={dashboardLoading}
            dataKey="id"
            emptyMessage="No error groups found"
            paginator
            lazy
            first={first}
            rows={paginationData.limit}
            totalRecords={paginationData.totalItems}
            onPage={handlePageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sortField={sortField || undefined}
            sortOrder={sortOrder || undefined}
            onSort={handleSort}
            removableSort
          />
        </div>
      </div>

      {/* Error Detail Drawer */}
      <ErrorDetailDrawer
        open={drawerOpen}
        error={selectedError}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedError(null);
        }}
      />
    </>
  );
};

export default ErrorLogsMonitorList;
