/**
 * Error Logs Monitor Page
 * Card-based dashboard view for tracking, analyzing, and resolving application errors
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { Skeleton } from 'primereact/skeleton';
import { Dialog } from 'primereact/dialog';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Dropdown } from 'mainFe/Dropdown';
import { Input } from 'mainFe/Input';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useQuery } from '@tanstack/react-query';
import { errorLogsService } from '../../services/error-logs.service';
import { personnelLookupService } from '../../services/personnel-lookup.service';
import type {
  ErrorLogSearchParams,
  ErrorLogDashboardStats,
  ErrorGroup,
} from '../../types';
import type {
  ErrorSeverity,
  TimeRange,
} from '../../types/error-logs.types';
import ErrorDetailDrawer from './error-detail-drawer';
import './error-logs-monitor-list.css';
import { modulesService } from '../../services/modules.service';

// Severity color mapping
const severityColor: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#2563eb',
};

const severityBg: Record<string, string> = {
  CRITICAL: '#fef2f2',
  HIGH: '#fff7ed',
  MEDIUM: '#fefce8',
  LOW: '#eff6ff',
};

const ErrorLogsMonitorList = () => {
  const toast = useRef<Toast>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [filters, setFilters] = useState<ErrorLogSearchParams>({
    page: 1,
    limit: 10,
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

  // Card expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter panel visibility
  const [showFilters, setShowFilters] = useState(false);

  // Users dialog state
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersDialogError, setUsersDialogError] = useState<ErrorGroup | null>(null);
  const [usersDialogLoading, setUsersDialogLoading] = useState(false);
  const [affectedUsersList, setAffectedUsersList] = useState<{ userId: string; name: string; count: number }[]>([]);

  // User analytics dialog state
  const [userAnalyticsOpen, setUserAnalyticsOpen] = useState(false);
  const [userAnalyticsLoading, setUserAnalyticsLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [userAnalyticsData, setUserAnalyticsData] = useState<{
    totalErrors: number;
    severities: Record<string, number>;
    environments: Record<string, number>;
    errorCodes: Record<string, number>;
  } | null>(null);
  const [showUserRecords, setShowUserRecords] = useState(false);
  const [userRecords, setUserRecords] = useState<any[]>([]);

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

  // Pagination data
  const paginationData = useMemo(() => {
    const pagination = (dashboardResponse as any)?.data?.pagination || (dashboardResponse as any)?.pagination || {};
    return {
      page: pagination?.page ?? filters.page ?? 1,
      limit: pagination?.limit ?? (filters as any).limit ?? 10,
      totalItems: pagination?.totalItems ?? 0,
      totalPages: pagination?.totalPages ?? 0,
      hasNextPage: pagination?.hasNextPage ?? false,
      hasPrevPage: pagination?.hasPrevPage ?? false,
    };
  }, [dashboardResponse, filters.page, (filters as any).limit]);

  // Auto-refresh
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

  // Dynamic error type options
  const errorTypeOptions = useMemo(() => {
    const sourceTypes = (dashboardStats as any)?.sourceTypes || [];
    const dynamicOptions = sourceTypes.map((type: any) => {
      const typeValue = typeof type === 'string' ? type : (type?.value || type?.name || type?.type || '');
      return {
        label: typeValue.charAt(0).toUpperCase() + typeValue.slice(1).toLowerCase(),
        value: typeValue,
      };
    }).filter((opt: any) => opt.value);
    return [{ label: 'All Types', value: '' }, ...dynamicOptions];
  }, [(dashboardStats as any)?.sourceTypes]);

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  // Severity options
  const severityOptions = useMemo(() => {
    const severityLevels = (dashboardStats as any)?.severityLevels || [];
    const dynamicOptions = severityLevels.map((severity: any) => {
      const severityValue = typeof severity === 'string' ? severity : (severity?.value || severity?.name || severity?.level || '');
      return {
        label: severityValue.charAt(0).toUpperCase() + severityValue.slice(1).toLowerCase(),
        value: severityValue,
      };
    }).filter((opt: any) => opt.value);
    return [{ label: 'All Severities', value: '' }, ...dynamicOptions];
  }, [(dashboardStats as any)?.severityLevels]);

  const modulesOptions = [
    { label: 'All Modules', value: '' },
    ...modules.map((m) => ({ label: m.name, value: m._id })),
  ];

  // Error groups from dashboard
  const errorGroups: ErrorGroup[] = dashboardStats?.errorGroups || [];

  // Summary stats — use impact.bySeverity (filtered) for severity counts, summary for totals
  const summaryStats = useMemo(() => {
    const summary = dashboardStats?.summary || {} as any;
    // impact.bySeverity is filtered (respects all filters), unlike top-level bySeverity which is global
    const impactBySeverity = (dashboardStats?.impact as any)?.bySeverity || {};

    // Normalize keys to uppercase
    const normalized: Record<string, any> = {};
    Object.keys(impactBySeverity).forEach((key) => {
      normalized[key.toUpperCase()] = impactBySeverity[key];
    });

    return {
      total: summary?.totalErrors || 0,
      uniqueErrors: summary?.uniqueErrors || summary?.totalUniqueErrors || 0,
      critical: normalized['CRITICAL']?.totalErrors || normalized['CRITICAL']?.count || 0,
      high: normalized['HIGH']?.totalErrors || normalized['HIGH']?.count || 0,
      medium: normalized['MEDIUM']?.totalErrors || normalized['MEDIUM']?.count || 0,
      low: normalized['LOW']?.totalErrors || normalized['LOW']?.count || 0,
      affectedUsers: summary?.affectedUsers || (dashboardStats?.impact as any)?.totalAffectedUsers || 0,
    };
  }, [dashboardStats]);

  // Source type breakdown — byType is filtered
  const sourceTypeBreakdown = useMemo(() => {
    const byType = dashboardStats?.byType || {};
    return Object.entries(byType).map(([type, data]: [string, any]) => ({
      _id: type,
      count: data?.count || data?.totalErrors || 0,
      unique: data?.unique || data?.uniqueErrors || 0,
      affectedUsers: data?.affectedUsers || 0,
    })).sort((a, b) => b.count - a.count);
  }, [dashboardStats]);

  // Severity breakdown — use impact.bySeverity (filtered) instead of top-level bySeverity (global)
  const severityBreakdown = useMemo(() => {
    const impactBySeverity = (dashboardStats?.impact as any)?.bySeverity || {};
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    return order
      .map((sev) => {
        const key = Object.keys(impactBySeverity).find(k => k.toUpperCase() === sev);
        const data = key ? impactBySeverity[key] : null;
        return {
          _id: sev,
          count: data?.totalErrors || data?.count || 0,
          affectedUsers: data?.affectedUsers || 0,
        };
      })
      .filter((item) => item.count > 0);
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

  // Clear all filters
  const clearFilters = () => {
    setTimeRange('all');
    setSearchInput('');
    setFilters({
      page: 1,
      limit: 10,
      includeArchive: false,
    });
    setFirst(0);
  };

  const hasActiveFilters = filters.sourceType || filters.errorSeverity || (filters as any).module || searchInput;

  // Fetch affected users for an error code
  const handleUsersClick = useCallback(async (e: React.MouseEvent, error: ErrorGroup) => {
    e.stopPropagation();
    setUsersDialogError(error);
    setUsersDialogOpen(true);
    setUsersDialogLoading(true);
    setAffectedUsersList([]);

    try {
      // Fetch all logs for this error code to extract unique users
      const { api } = await import('../../services/api');
      const res = await api.get('/api/v1/error-logs/list', {
        params: { errorCode: error.errorCode, pageSize: 2000 },
      });

      // Handle various response shapes
      const responseBody = res.data;
      const logs: any[] = Array.isArray(responseBody)
        ? responseBody
        : Array.isArray(responseBody?.data)
          ? responseBody.data
          : [];

      // Store logs for user analytics reuse
      allFetchedLogsRef.current = logs;

      // Count occurrences per user
      const userCounts: Record<string, number> = {};
      logs.forEach((log: any) => {
        const uid = log.actorUserId;
        if (uid) {
          userCounts[uid] = (userCounts[uid] || 0) + 1;
        }
      });

      // Resolve names
      const userIds = Object.keys(userCounts);
      if (userIds.length > 0) {
        const nameMap = await personnelLookupService.getNamesByIds(userIds);
        const userList = userIds
          .map((uid) => ({
            userId: uid,
            name: nameMap.get(uid) || uid,
            count: userCounts[uid],
          }))
          .sort((a, b) => b.count - a.count);
        setAffectedUsersList(userList);
      }
    } catch (err) {
      console.error('Failed to fetch affected users:', err);
    } finally {
      setUsersDialogLoading(false);
    }
  }, []);

  // Fetch user analytics — reuses the already-fetched users dialog logs
  // We store the raw logs from the users fetch so analytics can filter by userId locally
  const allFetchedLogsRef = useRef<any[]>([]);

  const handleUserAnalyticsClick = useCallback((userId: string, userName: string) => {
    // Close users dialog first to prevent stacking/moving issues
    setUsersDialogOpen(false);

    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setUserAnalyticsOpen(true);
    setUserAnalyticsLoading(false);
    setShowUserRecords(false);

    // Filter the already-fetched logs by this userId
    const logs = allFetchedLogsRef.current.filter(
      (log: any) => log.actorUserId === userId
    );

    // Store records for "Show All Records"
    setUserRecords(logs);

    const severities: Record<string, number> = {};
    const environments: Record<string, number> = {};
    const errorCodes: Record<string, number> = {};

    logs.forEach((log: any) => {
      const sev = (log.errorSeverity || '').toUpperCase();
      if (sev) severities[sev] = (severities[sev] || 0) + 1;
      const env = log.environment || '';
      if (env) environments[env] = (environments[env] || 0) + 1;
      const ec = log.errorCode || '';
      if (ec) errorCodes[ec] = (errorCodes[ec] || 0) + 1;
    });

    setUserAnalyticsData({
      totalErrors: logs.length,
      severities,
      environments,
      errorCodes,
    });
  }, []);

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => errorLogsService.exportCSV(), []);

  // Get severity tag color
  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'success' | undefined => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return 'danger';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'success';
      default: return undefined;
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

  // Pagination handlers
  const handlePrevPage = () => {
    if (paginationData.hasPrevPage) {
      const newPage = paginationData.page - 1;
      setFirst((newPage - 1) * paginationData.limit);
      setFilters((prev) => ({ ...prev, page: newPage }));
    }
  };

  const handleNextPage = () => {
    if (paginationData.hasNextPage) {
      const newPage = paginationData.page + 1;
      setFirst((newPage - 1) * paginationData.limit);
      setFilters((prev) => ({ ...prev, page: newPage }));
    }
  };

  const handleRowsChange = (rows: number) => {
    setFirst(0);
    setFilters((prev) => ({ ...prev, page: 1, limit: rows } as any));
  };

  // Loading skeleton
  if (dashboardLoading && !dashboardStats) {
    return (
      <div className="py-2 px-3">
        <div className="flex items-center justify-between mb-4">
          <Skeleton width="280px" height="32px" />
          <div className="flex gap-2">
            <Skeleton width="90px" height="32px" />
            <Skeleton width="32px" height="32px" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height="90px" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height="180px" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height="80px" className="mb-3" />
        ))}
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-2 px-3" data-testid="SCR-ErrorLogsMonitor">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-sky-500">
              Error Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1">
              {summaryStats.total} Total Errors
            </span>
            <button
              onClick={() => {
                setTimeRange('all');
                setSearchInput('');
                setFilters({ page: 1, limit: 10, includeArchive: false });
                setFirst(0);
                setShowFilters(false);
                setTimeout(() => refetchDashboard(), 0);
              }}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="Refresh"
              data-testid="ErrorLogs.Button.Refresh"
            >
              <i className={`pi pi-refresh text-gray-500 dark:text-gray-400 ${dashboardLoading ? 'pi-spin' : ''}`} style={{ fontSize: '0.875rem' }} />
            </button>
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
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="Toggle Filters"
            >
              <i className="pi pi-filter text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem' }} />
            </button>
            <ExportDataButton
              fetchBlob={fetchExportBlob}
              filename="error-logs-export.xlsx"
              testId="ErrorLogs.Button.Export"
            />
          </div>
        </div>

        {/* Time Range Toggle */}
        <div className="flex items-center gap-0 mb-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm w-fit">
          {timeRangeOptions.map((t) => (
            <button
              key={t.value}
              onClick={() => setTimeRange(t.value as TimeRange)}
              className={`px-4 py-1.5 text-xs font-medium cursor-pointer border-none transition-all ${
                timeRange === t.value
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              style={{ borderRight: '1px solid #e5e7eb' }}
              data-testid={`ErrorLogs.TimeRange.${t.value}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '0.625rem' }} data-feedback="Error Summary Cards">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Critical</p>
            <p className="text-2xl font-black" style={{ color: '#dc2626' }}>{summaryStats.critical}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">High Severity</p>
            <p className="text-2xl font-black" style={{ color: '#ea580c' }}>{summaryStats.high}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Unique Errors</p>
            <p className="text-2xl font-black" style={{ color: '#7c3aed' }}>{summaryStats.uniqueErrors}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Affected Users</p>
            <p className="text-2xl font-black" style={{ color: '#059669' }}>{summaryStats.affectedUsers}</p>
          </div>
        </div>

        {/* Breakdown Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }} data-feedback="Error Breakdown Cards">
          {/* By Source Type */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By Source Type</h4>
            {sourceTypeBreakdown.length > 0 ? sourceTypeBreakdown.map((item) => (
              <div key={item._id} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <div className="flex items-center gap-2">
                  <i className={`${getSourceTypeIcon(item._id)} text-gray-400`} style={{ fontSize: '0.75rem' }} />
                  <span className="text-xs text-gray-600 dark:text-gray-300">{item._id}</span>
                </div>
                <Tag value={String(item.count)} className="text-xs" />
              </div>
            )) : (
              <p className="text-xs text-gray-400">No data</p>
            )}
          </div>

          {/* By Severity */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By Severity</h4>
            {severityBreakdown.length > 0 ? severityBreakdown.map((item) => (
              <div key={item._id} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <span className="text-xs text-gray-600 dark:text-gray-300">{item._id}</span>
                <Tag
                  value={String(item.count)}
                  severity={getSeverityColor(item._id)}
                  className="text-xs font-bold"
                />
              </div>
            )) : (
              <p className="text-xs text-gray-400">No data</p>
            )}
          </div>

          {/* Impact Summary */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Impact Summary</h4>
            {severityBreakdown.length > 0 ? severityBreakdown.map((item) => (
              <div key={item._id} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <span className="text-xs text-gray-600 dark:text-gray-300">{item._id}</span>
                <div className="flex items-center gap-1.5">
                  <i className="pi pi-users text-gray-400" style={{ fontSize: '0.625rem' }} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {item.affectedUsers} users
                  </span>
                </div>
              </div>
            )) : (
              <p className="text-xs text-gray-400">No data</p>
            )}
          </div>
        </div>

        {/* Filters (Collapsible) */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-2 shadow-sm" style={{ padding: '0.625rem 0.75rem' }} data-feedback="Error Filters">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '140px' }}>
                <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>
                  Search
                </label>
                <Input
                  name="search"
                  value={searchInput}
                  onChange={(value: any) => setSearchInput(value)}
                  placeholder="Search errors..."
                  icon="pi pi-search"
                  className="w-full"
                  testId="ErrorLogs.Filter.Search"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '140px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '140px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '140px' }}>
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
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-transparent"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {dashboardLoading && (
          <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden mb-2">
            <div className="h-full bg-indigo-500 rounded animate-pulse" style={{ width: '60%' }} />
          </div>
        )}

        {/* Error Cards List */}
        <div className="flex flex-col gap-2.5" data-feedback="Error Cards List">
          {errorGroups.map((error, idx) => {
            const cardId = error.errorCode + idx;
            const isExpanded = expandedId === cardId;
            const sev = (error.severity || 'MEDIUM').toUpperCase();

            return (
              <div
                key={cardId}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm transition-all"
                style={{
                  border: `1px solid ${isExpanded ? '#4f46e5' : '#e5e7eb'}`,
                  borderLeft: `4px solid ${severityColor[sev] || '#94a3b8'}`,
                }}
              >
                <div style={{ padding: isExpanded ? '0.875rem 1rem 0.5rem' : '0.875rem 1rem' }}>
                  {/* Main row — always visible */}
                  <div
                    className="flex justify-between items-start cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : cardId)}
                  >
                    <div className="flex-1 min-w-0">
                      {/* Error code / message */}
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5 truncate">
                        {error.resolvedMessage || error.message || error.errorCode}
                      </p>
                      {/* Chips row */}
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                          style={{ backgroundColor: '#f1f5f9', color: '#334155', fontWeight: 500 }}
                        >
                          <i className={`${getSourceTypeIcon(error.sourceType)}`} style={{ fontSize: '0.625rem' }} />
                          {error.sourceType}
                        </span>
                        <span
                          className="inline-flex items-center text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600"
                          style={{ color: '#475569' }}
                        >
                          {error.sourceName}
                        </span>
                        <Tag
                          value={sev}
                          severity={getSeverityColor(sev)}
                          style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem' }}
                        />
                        {(error as any).endpoint && (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-500 font-mono"
                            title={(error as any).endpoint}
                          >
                            <i className="pi pi-link" style={{ fontSize: '0.5rem' }} />
                            <span className="max-w-[150px] truncate">{(error as any).endpoint}</span>
                          </span>
                        )}
                        {error.affectedUsers > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-blue-200 dark:border-blue-600 text-blue-600 dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            onClick={(e) => handleUsersClick(e, error)}
                            title="View affected users"
                          >
                            <i className="pi pi-users" style={{ fontSize: '0.6rem' }} />
                            {error.affectedUsers} users
                          </span>
                        )}
                        <span className="ml-auto whitespace-nowrap flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-md">{error.occurrences}x</span>
                          <span className="text-xs text-gray-400">{error.lastSeen ? new Date(error.lastSeen).toLocaleString() : '-'}</span>
                        </span>
                      </div>
                    </div>
                    <button className="ml-2 mt-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer p-1">
                      <i className={`pi ${isExpanded ? 'pi-chevron-up' : 'pi-chevron-down'}`} style={{ fontSize: '0.875rem' }} />
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      {/* Error message block */}
                      {(error.resolvedMessage || error.message) && (
                        <div
                          className="rounded-md p-3 mb-3"
                          style={{ backgroundColor: severityBg[sev] || '#f8fafc', borderLeft: `3px solid ${severityColor[sev] || '#94a3b8'}` }}
                        >
                          <p className="text-xs font-semibold mb-1" style={{ color: severityColor[sev] || '#64748b' }}>
                            Error Message
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {error.resolvedMessage || error.message || 'No message available'}
                          </p>
                        </div>
                      )}

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <DetailRow label="Error Code" value={error.errorCode} />
                        <DetailRow label="Source" value={`${error.sourceName} (${error.sourceType})`} />
                        {(error as any).endpoint && (
                          <DetailRow label="Endpoint" value={(error as any).endpoint} />
                        )}
                        <DetailRow label="First Seen" value={error.firstSeen ? new Date(error.firstSeen).toLocaleString() : '-'} />
                        <DetailRow label="Last Seen" value={error.lastSeen ? new Date(error.lastSeen).toLocaleString() : '-'} />
                        <DetailRow label="Total Occurrences" value={String(error.occurrences || 0)} />
                        <DetailRow label="Affected Users" value={String(error.affectedUsers || 0)} />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-transparent border-none cursor-pointer flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedError(error);
                            setDrawerOpen(true);
                          }}
                        >
                          <i className="pi pi-eye" style={{ fontSize: '0.75rem' }} />
                          View Full Details
                        </button>
                        <span className="text-xs text-gray-400">
                          Ref: {error.errorCode}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {!dashboardLoading && errorGroups.length === 0 && (
            <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
              <i className="pi pi-check-circle text-green-400 mb-2" style={{ fontSize: '2rem' }} />
              <p className="text-sm text-gray-400">No errors match the current filters.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {paginationData.totalItems > 0 && (
          <div className="flex items-center justify-between mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Rows per page:</span>
              <select
                value={paginationData.limit}
                onChange={(e) => handleRowsChange(Number(e.target.value))}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Page {paginationData.page} of {paginationData.totalPages} ({paginationData.totalItems} items)
              </span>
              <div className="flex gap-1">
                <button
                  onClick={handlePrevPage}
                  disabled={!paginationData.hasPrevPage}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <i className="pi pi-chevron-left" style={{ fontSize: '0.75rem' }} />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={!paginationData.hasNextPage}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <i className="pi pi-chevron-right" style={{ fontSize: '0.75rem' }} />
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/* Affected Users Dialog */}
      <Dialog
        visible={usersDialogOpen}
        onHide={() => { setUsersDialogOpen(false); setUsersDialogError(null); setAffectedUsersList([]); }}
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-users text-blue-600" style={{ fontSize: '1rem' }} />
            <span className="text-base font-semibold text-gray-900 dark:text-white">Affected Users</span>
            {usersDialogError && (
              <span className="text-xs text-gray-500 font-normal ml-1">— {usersDialogError.errorCode}</span>
            )}
          </div>
        }
        style={{ width: '480px' }}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        {usersDialogLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <ProgressSpinner style={{ width: '36px', height: '36px' }} />
            <p className="text-xs text-gray-400 mt-2">Loading users...</p>
          </div>
        ) : affectedUsersList.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 mb-1">{affectedUsersList.length} user{affectedUsersList.length !== 1 ? 's' : ''} affected</p>
            {affectedUsersList.map((user, i) => (
              <div
                key={user.userId}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                onClick={() => handleUserAnalyticsClick(user.userId, user.name)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-bold w-5">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                    {user.name !== user.userId && (
                      <p className="text-xs text-gray-400 font-mono">{user.userId}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white bg-indigo-600 px-2 py-0.5 rounded-md">{user.count}</span>
                  <i className="pi pi-chevron-right text-gray-400" style={{ fontSize: '0.625rem' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <i className="pi pi-info-circle text-gray-300 mb-2" style={{ fontSize: '1.5rem' }} />
            <p className="text-sm text-gray-400">No user data available for this error.</p>
          </div>
        )}
      </Dialog>

      {/* User Analytics Dialog */}
      <Dialog
        visible={userAnalyticsOpen}
        onHide={() => { setUserAnalyticsOpen(false); setSelectedUserId(null); setUserAnalyticsData(null); setShowUserRecords(false); setUserRecords([]); }}
        header={
          <div className="flex items-center gap-2">
            <button
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 bg-transparent border-none cursor-pointer"
              onClick={() => {
                setUserAnalyticsOpen(false);
                setSelectedUserId(null);
                setUserAnalyticsData(null);
                setShowUserRecords(false);
                setUserRecords([]);
                setUsersDialogOpen(true);
              }}
              title="Back to users"
            >
              <i className="pi pi-arrow-left text-gray-500" style={{ fontSize: '0.875rem' }} />
            </button>
            <i className="pi pi-chart-bar text-orange-500" style={{ fontSize: '1rem' }} />
            <span className="text-base font-semibold text-gray-900 dark:text-white">User Analytics</span>
            {selectedUserName && (
              <span className="text-xs font-bold text-white bg-indigo-600 px-2 py-0.5 rounded-md ml-1">{selectedUserName}</span>
            )}
          </div>
        }
        style={{ width: '600px' }}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        {userAnalyticsLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <ProgressSpinner style={{ width: '36px', height: '36px' }} />
            <p className="text-xs text-gray-400 mt-2">Loading analytics...</p>
          </div>
        ) : userAnalyticsData ? (
          <div className="flex flex-col gap-4">
            {/* Total errors */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 text-center">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Total Errors Created</p>
              <p className="text-3xl font-black text-indigo-700 dark:text-indigo-300">{userAnalyticsData.totalErrors}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* By Severity */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Severity
                </h4>
                <div className="flex flex-col gap-1.5">
                  {Object.keys(userAnalyticsData.severities).length > 0 ? (
                    Object.entries(userAnalyticsData.severities)
                      .sort((a, b) => b[1] - a[1])
                      .map(([sev, count]) => (
                        <div key={sev} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{sev}</span>
                          <span className="text-xs font-bold" style={{ color: severityColor[sev] || '#64748b' }}>{count}</span>
                        </div>
                      ))
                  ) : (
                    <span className="text-xs text-gray-400">No data</span>
                  )}
                </div>
              </div>

              {/* By Environment */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Environment
                </h4>
                <div className="flex flex-col gap-1.5">
                  {Object.keys(userAnalyticsData.environments).length > 0 ? (
                    Object.entries(userAnalyticsData.environments)
                      .sort((a, b) => b[1] - a[1])
                      .map(([env, count]) => (
                        <div key={env} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{env}</span>
                          <span className="text-xs font-bold text-blue-600">{count}</span>
                        </div>
                      ))
                  ) : (
                    <span className="text-xs text-gray-400">No data</span>
                  )}
                </div>
              </div>

              {/* Top Error Codes */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Top Errors
                </h4>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {Object.keys(userAnalyticsData.errorCodes).length > 0 ? (
                    Object.entries(userAnalyticsData.errorCodes)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 10)
                      .map(([code, count]) => (
                        <div key={code} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate mr-2" title={code}>{code}</span>
                          <span className="text-xs font-bold text-purple-600 flex-shrink-0">{count}</span>
                        </div>
                      ))
                  ) : (
                    <span className="text-xs text-gray-400">No data</span>
                  )}
                </div>
              </div>
            </div>

            {/* Show All Records Button / Section */}
            <button
              onClick={() => setShowUserRecords(!showUserRecords)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 font-semibold text-xs cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors bg-transparent"
            >
              <i className="pi pi-list" style={{ fontSize: '0.75rem' }} />
              {showUserRecords ? 'Hide Records' : `Show All Records (${userRecords.length})`}
              <i className={`pi ${showUserRecords ? 'pi-chevron-up' : 'pi-chevron-down'}`} style={{ fontSize: '0.625rem' }} />
            </button>

            {showUserRecords && userRecords.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {userRecords.length} record{userRecords.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {userRecords.map((log: any, i: number) => {
                    const logSev = (log.errorSeverity || '').toUpperCase();
                    return (
                      <div
                        key={log._id || log.id || i}
                        className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        style={{ borderLeft: `3px solid ${severityColor[logSev] || '#94a3b8'}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {log.errorCode}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {log.resolvedMessage || '-'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Tag
                            value={logSev}
                            severity={getSeverityColor(logSev)}
                            style={{ fontSize: '0.5625rem', padding: '0.0625rem 0.3rem' }}
                          />
                          {log.environment && (
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {log.environment}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {log.eventDateTime ? new Date(log.eventDateTime).toLocaleString() : '-'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <i className="pi pi-info-circle text-gray-300 mb-2" style={{ fontSize: '1.5rem' }} />
            <p className="text-sm text-gray-400">No analytics data available.</p>
          </div>
        )}
      </Dialog>
    </>
  );
};

/** Small detail label + value pair */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium break-all">{value}</p>
    </div>
  );
}

export default ErrorLogsMonitorList;
