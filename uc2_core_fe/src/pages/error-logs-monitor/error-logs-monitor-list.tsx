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
import { TabView, TabPanel } from 'primereact/tabview';
import { Dropdown } from 'mainFe/Dropdown';
import { Input } from 'mainFe/Input';
import { DataTable } from 'mainFe/DataTable';
import { Column } from 'primereact/column';
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
  const errorGroupsRef = useRef<HTMLDivElement>(null);

  // Card expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter panel visibility
  const [showFilters, setShowFilters] = useState(true);

  // Tab state: 0 = Overview, 1 = Records
  const [activeTab, setActiveTab] = useState(0);

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

  // All records dialog state
  const [allRecordsDialogOpen, setAllRecordsDialogOpen] = useState(false);
  const [allRecordsDialogError, setAllRecordsDialogError] = useState<ErrorGroup | null>(null);
  const [allRecordsDialogFilter, setAllRecordsDialogFilter] = useState<{ errorCode?: string; endpoint?: string }>({});
  const [allRecordsLoading, setAllRecordsLoading] = useState(false);
  const [allRecordsList, setAllRecordsList] = useState<any[]>([]);
  const [allRecordsPage, setAllRecordsPage] = useState(1);
  const [allRecordsPagination, setAllRecordsPagination] = useState<{
    page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean;
  } | null>(null);

  // Records tab DataTable state
  const [recordsData, setRecordsData] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize, setRecordsPageSize] = useState(25);
  const [recordsPagination, setRecordsPagination] = useState<{
    page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPrevPage: boolean;
  } | null>(null);
  const [recordsUserNames, setRecordsUserNames] = useState<Map<string, string>>(new Map());

  // Records sort
  const [recSortField, setRecSortField] = useState<string>('eventDateTime');
  const [recSortOrder, setRecSortOrder] = useState<'asc' | 'desc'>('desc');

  // Record detail dialog
  const [recordDetailOpen, setRecordDetailOpen] = useState(false);
  const [recordDetailData, setRecordDetailData] = useState<any>(null);

  // Records tab filters (independent from overview filters)
  const [recFilters, setRecFilters] = useState<{
    q: string;
    actorUserId: string;
    errorSeverity: string;
    sourceType: string;
    sourceName: string;
    endpoint: string;
  }>({ q: '', actorUserId: '', errorSeverity: '', sourceType: '', sourceName: '', endpoint: '' });
  const recSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [recSearchInput, setRecSearchInput] = useState('');

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

  // Debounced records search
  useEffect(() => {
    if (recSearchDebounceRef.current) clearTimeout(recSearchDebounceRef.current);
    recSearchDebounceRef.current = setTimeout(() => {
      setRecFilters((prev) => ({ ...prev, q: recSearchInput }));
      setRecordsPage(1);
    }, 500);
    return () => { if (recSearchDebounceRef.current) clearTimeout(recSearchDebounceRef.current); };
  }, [recSearchInput]);

  // Fetch dashboard data
  const {
    data: dashboardResponse,
    isLoading: dashboardLoading,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['error-logs-dashboard', timeRange, filters.sourceType, filters.errorSeverity, (filters as any).module, filters.q, filters.page, (filters as any).limit, filters.includeArchive, sortField, sortOrder, activeTab, recFilters.errorSeverity, recFilters.sourceType, recFilters.actorUserId, recFilters.sourceName, recFilters.endpoint, recFilters.q],
    queryFn: () => {
      // When on Records tab with active filters, apply recFilters to dashboard too
      const hasRecFilters = recFilters.errorSeverity || recFilters.sourceType || recFilters.actorUserId || recFilters.sourceName || recFilters.endpoint || recFilters.q;
      return errorLogsService.getDashboardData({
        timeRange,
        sourceType: hasRecFilters ? (recFilters.sourceType || undefined) : filters.sourceType,
        errorSeverity: hasRecFilters ? (recFilters.errorSeverity || undefined) : filters.errorSeverity,
        moduleId: hasRecFilters ? undefined : (filters as any).module,
        errorCode: hasRecFilters ? (recFilters.q || undefined) : filters.q,
        includeArchive: filters.includeArchive,
        page: filters.page,
        limit: (filters as any).limit,
        ...(sortField && { sort_by: sortField, sort_order: sortOrder === 1 ? 'asc' : 'desc' }),
      });
    },
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

  // Fetch records for the Records tab DataTable
  useEffect(() => {
    if (activeTab !== 1) return;

    let cancelled = false;
    const fetchRecords = async () => {
      setRecordsLoading(true);
      try {
        const res = await errorLogsService.searchRecords({
          page: recordsPage,
          pageSize: recordsPageSize,
          q: recFilters.q || undefined,
          actorUserId: recFilters.actorUserId || undefined,
          errorSeverity: recFilters.errorSeverity || undefined,
          sourceType: recFilters.sourceType || undefined,
          sourceName: recFilters.sourceName || undefined,
          endpoint: recFilters.endpoint || undefined,
          sort_by: recSortField,
          sort_order: recSortOrder,
          includeArchive: filters.includeArchive,
        });
        if (cancelled) return;
        const data = Array.isArray(res) ? res : (res?.data || []);
        const pagination = res?.pagination || null;
        setRecordsData(data);
        setRecordsPagination(pagination);

        // Resolve user names
        const userIds = [...new Set(data.map((r: any) => r.actorUserId).filter(Boolean))] as string[];
        if (userIds.length > 0) {
          const nameMap = await personnelLookupService.getNamesByIds(userIds);
          if (!cancelled) setRecordsUserNames(nameMap);
        }
      } catch (err) {
        console.error('Failed to fetch records:', err);
        if (!cancelled) {
          setRecordsData([]);
          setRecordsPagination(null);
        }
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    };

    fetchRecords();
    return () => { cancelled = true; };
  }, [activeTab, recordsPage, recordsPageSize, recFilters, recSortField, recSortOrder, filters.includeArchive]);

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
  // Base summary from dashboard (unfiltered)
  const dashboardSummary = useMemo(() => {
    const summary = dashboardStats?.summary || {} as any;
    const impactBySeverity = (dashboardStats?.impact as any)?.bySeverity || {};
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
      affectedUsers: (summary as any)?.totalAffectedUsers || summary?.affectedUsers || (dashboardStats?.impact as any)?.totalAffectedUsers || 0,
    };
  }, [dashboardStats]);

  // Filtered stats — when recFilters are active, fetch counts per severity
  const [filteredStats, setFilteredStats] = useState<{ total: number; critical: number; high: number; medium: number; low: number; uniqueErrors: number; uniqueUsers: number } | null>(null);
  const hasRecFilters = !!(recFilters.errorSeverity || recFilters.sourceType || recFilters.actorUserId || recFilters.sourceName || recFilters.endpoint || recFilters.q);

  useEffect(() => {
    if (!hasRecFilters) {
      setFilteredStats(null);
      return;
    }
    let cancelled = false;
    const baseParams = {
      q: recFilters.q || undefined,
      actorUserId: recFilters.actorUserId || undefined,
      sourceType: recFilters.sourceType || undefined,
      sourceName: recFilters.sourceName || undefined,
      endpoint: recFilters.endpoint || undefined,
      includeArchive: filters.includeArchive,
      pageSize: 1,
    };
    const fetchCounts = async () => {
      try {
        // Fetch total count with all filters
        const allRes = await errorLogsService.searchRecords({ ...baseParams, errorSeverity: recFilters.errorSeverity || undefined });
        if (cancelled) return;
        const pag = allRes?.pagination || {};
        const total = pag.totalItems ?? 0;
        const uniqueErrors = pag.uniqueErrorCodes ?? 0;
        const uniqueUsers = pag.uniqueUsers ?? 0;

        // If severity filter is already set, we know the breakdown
        if (recFilters.errorSeverity) {
          setFilteredStats({
            total,
            critical: recFilters.errorSeverity === 'CRITICAL' ? total : 0,
            high: recFilters.errorSeverity === 'HIGH' ? total : 0,
            medium: recFilters.errorSeverity === 'MEDIUM' ? total : 0,
            low: recFilters.errorSeverity === 'LOW' ? total : 0,
            uniqueErrors,
            uniqueUsers,
          });
        } else {
          // Fetch critical and high counts in parallel
          const [critRes, highRes] = await Promise.all([
            errorLogsService.searchRecords({ ...baseParams, errorSeverity: 'CRITICAL' }),
            errorLogsService.searchRecords({ ...baseParams, errorSeverity: 'HIGH' }),
          ]);
          if (cancelled) return;
          setFilteredStats({
            total,
            critical: critRes?.pagination?.totalItems ?? 0,
            high: highRes?.pagination?.totalItems ?? 0,
            medium: 0,
            low: 0,
            uniqueErrors,
            uniqueUsers,
          });
        }
      } catch {
        if (!cancelled) setFilteredStats(null);
      }
    };
    fetchCounts();
    return () => { cancelled = true; };
  }, [recFilters, hasRecFilters, filters.includeArchive]);

  const summaryStats = hasRecFilters && filteredStats
    ? { ...dashboardSummary, total: filteredStats.total, critical: filteredStats.critical, high: filteredStats.high, uniqueErrors: filteredStats.uniqueErrors, affectedUsers: filteredStats.uniqueUsers }
    : dashboardSummary;

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

  // Activity analysis — top 10 error codes, endpoints from error groups
  const activityAnalysis = useMemo(() => {
    const groups: any[] = dashboardStats?.errorGroups || [];

    // Top 10 error codes by occurrences
    const topErrorCodes = [...groups]
      .sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))
      .slice(0, 10)
      .map((g) => ({ name: g.errorCode, count: g.occurrences || 0 }));

    // Top 10 endpoints by occurrences
    const endpointMap: Record<string, number> = {};
    groups.forEach((g) => {
      const ep = (g as any).endpoint;
      if (ep) endpointMap[ep] = (endpointMap[ep] || 0) + (g.occurrences || 0);
    });
    const topEndpoints = Object.entries(endpointMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return { topErrorCodes, topEndpoints };
  }, [dashboardStats]);

  // Top 10 users — from dashboard API topUsers field (server-side aggregation)
  const [topUsersData, setTopUsersData] = useState<{ name: string; userId: string; count: number }[]>([]);
  useEffect(() => {
    const rawTopUsers: any[] = (dashboardStats as any)?.topUsers || [];
    if (rawTopUsers.length === 0) {
      setTopUsersData([]);
      return;
    }

    let cancelled = false;

    const resolveNames = async () => {
      try {
        const userIds = rawTopUsers.map((u: any) => u.userId);
        const nameMap = await personnelLookupService.getNamesByIds(userIds);

        if (!cancelled) {
          setTopUsersData(
            rawTopUsers.map((u: any) => ({
              userId: u.userId,
              name: nameMap.get(u.userId) || u.userId,
              count: u.count,
            }))
          );
        }
      } catch {
        if (!cancelled) {
          setTopUsersData(
            rawTopUsers.map((u: any) => ({
              userId: u.userId,
              name: u.userId,
              count: u.count,
            }))
          );
        }
      }
    };

    resolveNames();
    return () => { cancelled = true; };
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
      const logs = await fetchLogsByPost({ errorCode: error.errorCode });

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

  // Helper: fetch logs via POST /search (works reliably unlike GET /list)
  const fetchLogsByPost = useCallback(async (params: Record<string, any>): Promise<any[]> => {
    const { api } = await import('../../services/api');
    const res = await api.post('/api/v1/error-logs/search', params);
    const body = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return [];
  }, []);

  const allFetchedLogsRef = useRef<any[]>([]);

  // User Analytics — uses dedicated endpoint
  const handleUserAnalyticsClick = useCallback(async (userId: string, userName: string) => {
    // Close users dialog first
    setUsersDialogOpen(false);

    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setUserAnalyticsOpen(true);
    setUserAnalyticsLoading(true);
    setShowUserRecords(false);
    setUserAnalyticsData(null);
    setUserRecords([]);

    // Helper to compute analytics from raw logs
    const computeFromLogs = (logs: any[]) => {
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
      setUserAnalyticsData({ totalErrors: logs.length, severities, environments, errorCodes });
      setUserRecords(logs);
    };

    try {
      // Try dedicated user-analytics endpoint first
      const res = await errorLogsService.getUserAnalytics(userId, filters.includeArchive);
      const result = res?.data || res;

      if (result && result.totalErrors > 0) {
        setUserAnalyticsData({
          totalErrors: result.totalErrors || 0,
          severities: result.severities || {},
          environments: result.environments || {},
          errorCodes: result.errorCodes || {},
        });
        setUserRecords(result.records || []);
      } else {
        // Endpoint returned 0 — fallback to POST /search with large page
        const searchRes = await errorLogsService.searchRecords({ actorUserId: userId, pageSize: 500 });
        const logs = Array.isArray(searchRes) ? searchRes : (searchRes?.data || []);
        computeFromLogs(logs);
      }
    } catch (err) {
      console.error('User analytics endpoint failed, falling back to search:', err);
      // Fallback: fetch via POST /search
      try {
        const searchRes = await errorLogsService.searchRecords({ actorUserId: userId, pageSize: 500 });
        const logs = Array.isArray(searchRes) ? searchRes : (searchRes?.data || []);
        computeFromLogs(logs);
      } catch (err2) {
        console.error('Fallback search also failed:', err2);
        toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Failed to load user analytics', life: 3000 });
        setUserAnalyticsData({ totalErrors: 0, severities: {}, environments: {}, errorCodes: {} });
      }
    } finally {
      setUserAnalyticsLoading(false);
    }
  }, [filters.includeArchive]);

  // Fetch all records for an error code or endpoint — with pagination
  const fetchAllRecordsPage = useCallback(async (params: { errorCode?: string; endpoint?: string }, page: number) => {
    setAllRecordsLoading(true);
    try {
      const res = await errorLogsService.searchRecords({
        errorCode: params.errorCode,
        endpoint: params.endpoint,
        page,
        pageSize: 50,
        includeArchive: filters.includeArchive,
      });
      const data = Array.isArray(res) ? res : (res?.data || []);
      const pagination = res?.pagination || null;
      setAllRecordsList(data);
      setAllRecordsPagination(pagination);
      setAllRecordsPage(page);
    } catch (err) {
      console.error('Failed to fetch all records:', err);
      setAllRecordsList([]);
      setAllRecordsPagination(null);
    } finally {
      setAllRecordsLoading(false);
    }
  }, [filters.includeArchive]);

  const handleOccurrencesClick = useCallback(async (e: React.MouseEvent, error: ErrorGroup) => {
    e.stopPropagation();
    const filterParams = { errorCode: error.errorCode };
    setAllRecordsDialogError(error);
    setAllRecordsDialogFilter(filterParams);
    setAllRecordsDialogOpen(true);
    setAllRecordsList([]);
    setAllRecordsPagination(null);
    setAllRecordsPage(1);
    await fetchAllRecordsPage(filterParams, 1);
  }, [fetchAllRecordsPage]);

  // Open all records dialog for a specific error code (from activity analysis)
  const handleErrorCodeClick = useCallback(async (errorCode: string) => {
    const filterParams = { errorCode };
    setAllRecordsDialogError(null);
    setAllRecordsDialogFilter(filterParams);
    setAllRecordsDialogOpen(true);
    setAllRecordsList([]);
    setAllRecordsPagination(null);
    setAllRecordsPage(1);
    await fetchAllRecordsPage(filterParams, 1);
  }, [fetchAllRecordsPage]);

  // Open all records dialog for a specific endpoint (from activity analysis)
  const handleEndpointClick = useCallback(async (endpoint: string) => {
    const filterParams = { endpoint };
    setAllRecordsDialogError(null);
    setAllRecordsDialogFilter(filterParams);
    setAllRecordsDialogOpen(true);
    setAllRecordsList([]);
    setAllRecordsPagination(null);
    setAllRecordsPage(1);
    await fetchAllRecordsPage(filterParams, 1);
  }, [fetchAllRecordsPage]);

  // Export to styled Excel with 2 sheets: Overview + Records
  const [exporting, setExporting] = useState(false);
  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx-js-style');

      // Style helpers
      const titleStyle = { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '4F46E5' } }, alignment: { horizontal: 'center' } };
      const sectionStyle = { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '6366F1' } }, alignment: { horizontal: 'left' } };
      const headerStyle = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '374151' } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin', color: { rgb: '9CA3AF' } } } };
      const labelStyle = { font: { bold: true, sz: 10, color: { rgb: '1F2937' } }, fill: { fgColor: { rgb: 'F3F4F6' } }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } };
      const valueStyle = { font: { sz: 10 }, alignment: { horizontal: 'right' }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } };
      const sevColors: Record<string, string> = { CRITICAL: 'DC2626', HIGH: 'EA580C', MEDIUM: 'CA8A04', LOW: '2563EB' };

      // --- Sheet 1: Overview ---
      const ov: any[][] = [];
      let r = 0;

      // Title row
      ov.push(['Error Dashboard - Overview', '', '', '']);
      r++;
      ov.push([]); r++;

      // Summary section
      ov.push(['Summary', '', '', '']); r++;
      ov.push(['Metric', 'Value']); r++;
      ov.push(['Total Errors', summaryStats.total]); r++;
      ov.push(['Critical', summaryStats.critical]); r++;
      ov.push(['High', summaryStats.high]); r++;
      ov.push(['Unique Errors', summaryStats.uniqueErrors]); r++;
      ov.push(['Affected Users', summaryStats.affectedUsers]); r++;
      ov.push([]); r++;

      // Source Type
      const stStart = r;
      ov.push(['By Source Type', '', '', '']); r++;
      ov.push(['Type', 'Count', 'Unique Codes', 'Affected Users']); r++;
      sourceTypeBreakdown.forEach((item) => { ov.push([item._id, item.count, item.unique, item.affectedUsers]); r++; });
      ov.push([]); r++;

      // Severity
      const sevStart = r;
      ov.push(['By Severity', '', '', '']); r++;
      ov.push(['Severity', 'Count', 'Affected Users']); r++;
      severityBreakdown.forEach((item) => { ov.push([item._id, item.count, item.affectedUsers]); r++; });
      ov.push([]); r++;

      // Top Error Codes
      const ecStart = r;
      ov.push(['Top Error Codes', '', '']); r++;
      ov.push(['#', 'Error Code', 'Occurrences']); r++;
      activityAnalysis.topErrorCodes.forEach((item, i) => { ov.push([i + 1, item.name, item.count]); r++; });
      ov.push([]); r++;

      // Top Endpoints
      const epStart = r;
      ov.push(['Top Endpoints', '', '']); r++;
      ov.push(['#', 'Endpoint', 'Occurrences']); r++;
      activityAnalysis.topEndpoints.forEach((item, i) => { ov.push([i + 1, item.name, item.count]); r++; });
      ov.push([]); r++;

      // Top Users
      const usStart = r;
      ov.push(['Top Users', '', '', '']); r++;
      ov.push(['#', 'User', 'User ID', 'Error Count']); r++;
      topUsersData.slice(0, 20).forEach((u, i) => { ov.push([i + 1, u.name, u.userId, u.count]); r++; });

      const wsOv = XLSX.utils.aoa_to_sheet(ov);
      wsOv['!cols'] = [{ wch: 22 }, { wch: 48 }, { wch: 18 }, { wch: 18 }];
      wsOv['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }]; // merge title

      // Apply styles to Overview
      const applyStyle = (ws: any, row: number, col: number, style: any) => {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        ws[addr].s = style;
      };

      // Title
      for (let c = 0; c < 4; c++) applyStyle(wsOv, 0, c, titleStyle);
      // Section headers + table headers
      const sectionRows = [2, stStart, sevStart, ecStart, epStart, usStart];
      sectionRows.forEach((sr) => { for (let c = 0; c < 4; c++) applyStyle(wsOv, sr, c, sectionStyle); });
      const headerRows = [3, stStart + 1, sevStart + 1, ecStart + 1, epStart + 1, usStart + 1];
      headerRows.forEach((hr) => { for (let c = 0; c < 4; c++) applyStyle(wsOv, hr, c, headerStyle); });

      // Summary labels + values (rows 4-8)
      for (let i = 4; i <= 8; i++) {
        applyStyle(wsOv, i, 0, labelStyle);
        applyStyle(wsOv, i, 1, valueStyle);
        // Color critical/high values
        if (i === 5) applyStyle(wsOv, i, 1, { ...valueStyle, font: { sz: 10, bold: true, color: { rgb: 'DC2626' } } });
        if (i === 6) applyStyle(wsOv, i, 1, { ...valueStyle, font: { sz: 10, bold: true, color: { rgb: 'EA580C' } } });
      }

      // Severity rows — color by severity name
      for (let i = sevStart + 2; i < sevStart + 2 + severityBreakdown.length; i++) {
        const cell = wsOv[XLSX.utils.encode_cell({ r: i, c: 0 })];
        const sev = cell?.v?.toString()?.toUpperCase() || '';
        if (sevColors[sev]) {
          applyStyle(wsOv, i, 0, { font: { bold: true, sz: 10, color: { rgb: sevColors[sev] } }, fill: { fgColor: { rgb: 'F9FAFB' } }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } });
        }
      }

      // --- Sheet 2: Records ---
      const allRecords: any[] = [];
      let pg = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await errorLogsService.searchRecords({
          page: pg, pageSize: 200,
          q: recFilters.q || undefined, actorUserId: recFilters.actorUserId || undefined,
          errorSeverity: recFilters.errorSeverity || undefined, sourceType: recFilters.sourceType || undefined,
          sourceName: recFilters.sourceName || undefined, endpoint: recFilters.endpoint || undefined,
          sort_by: recSortField, sort_order: recSortOrder, includeArchive: filters.includeArchive,
        });
        const data = Array.isArray(res) ? res : (res?.data || []);
        allRecords.push(...data);
        hasMore = res?.pagination?.hasNextPage ?? false;
        pg++;
        if (pg > 100) break;
      }

      const recHeaders = ['Time', 'Error Code', 'Severity', 'Message', 'Source Name', 'Source Type', 'Endpoint', 'Method', 'Environment', 'User ID', 'User Agent', 'IP'];
      const recRows = allRecords.map((rec: any) => [
        rec.eventDateTime ? new Date(rec.eventDateTime).toLocaleString() : '',
        rec.errorCode || '', rec.errorSeverity || '', rec.resolvedMessage || '',
        rec.sourceName || '', rec.sourceType || '', rec.endpoint || '', rec.method || '',
        rec.environment || '', rec.actorUserId || '', rec.userAgent || '', rec.ip || '',
      ]);

      const wsRec = XLSX.utils.aoa_to_sheet([recHeaders, ...recRows]);
      wsRec['!cols'] = [
        { wch: 20 }, { wch: 48 }, { wch: 12 }, { wch: 50 }, { wch: 20 }, { wch: 14 },
        { wch: 38 }, { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 25 }, { wch: 16 },
      ];

      // Style records header row
      for (let c = 0; c < recHeaders.length; c++) {
        applyStyle(wsRec, 0, c, headerStyle);
      }

      // Stripe rows + color severity cells
      for (let i = 0; i < recRows.length; i++) {
        const rowIdx = i + 1;
        const isEven = i % 2 === 0;
        const rowBg = isEven ? 'FFFFFF' : 'F9FAFB';
        for (let c = 0; c < recHeaders.length; c++) {
          const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c });
          if (!wsRec[cellAddr]) continue;
          wsRec[cellAddr].s = {
            font: { sz: 9 },
            fill: { fgColor: { rgb: rowBg } },
            border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } },
          };
        }
        // Color severity cell (col 2)
        const sevAddr = XLSX.utils.encode_cell({ r: rowIdx, c: 2 });
        if (wsRec[sevAddr]) {
          const sev = (wsRec[sevAddr].v || '').toString().toUpperCase();
          const color = sevColors[sev];
          if (color) {
            wsRec[sevAddr].s = {
              font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
              fill: { fgColor: { rgb: color } },
              alignment: { horizontal: 'center' },
              border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } },
            };
          }
        }
      }

      // Freeze header row in records
      wsRec['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsOv, 'Overview');
      XLSX.utils.book_append_sheet(wb, wsRec, 'Records');
      XLSX.writeFile(wb, 'error-dashboard-export.xlsx');
    } catch (err) {
      console.error('Export failed:', err);
      toast.current?.show({ severity: 'error', summary: 'Export Failed', detail: 'Could not generate Excel file', life: 3000 });
    } finally {
      setExporting(false);
    }
  }, [summaryStats, sourceTypeBreakdown, severityBreakdown, activityAnalysis, topUsersData, recFilters, recSortField, recSortOrder, filters.includeArchive]);

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

  // Pagination handlers for Overview error group cards
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
            <button
              onClick={() => {
                setTimeRange('all');
                setSearchInput('');
                setFilters({ page: 1, limit: 10, includeArchive: false });
                setFirst(0);
                setRecFilters({ q: '', actorUserId: '', errorSeverity: '', sourceType: '', sourceName: '', endpoint: '' });
                setRecSearchInput('');
                setRecordsPage(1);
                setTimeout(() => refetchDashboard(), 0);
              }}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="Refresh"
              data-testid="ErrorLogs.Button.Refresh"
            >
              <i className={`pi pi-refresh text-gray-500 dark:text-gray-400 ${dashboardLoading ? 'pi-spin' : ''}`} style={{ fontSize: '0.875rem' }} />
            </button>
            {activeTab === 1 && <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer transition-all ${
                showFilters
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
              title={showFilters ? 'Hide Filters' : 'Show Filters'}
            >
              <i className={`pi ${showFilters ? 'pi-filter-slash' : 'pi-filter'}`} style={{ fontSize: '0.875rem' }} />
            </button>}
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to Excel"
              data-testid="ErrorLogs.Button.Export"
            >
              <i className={`pi ${exporting ? 'pi-spin pi-spinner' : 'pi-download'} text-green-600`} style={{ fontSize: '0.875rem' }} />
            </button>
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

        {/* Summary Cards — always visible, above tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.625rem', marginBottom: '0.625rem' }} data-feedback="Error Summary Cards">
          <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all"
            onClick={() => { setRecFilters({ q: '', actorUserId: '', errorSeverity: '', sourceType: '', sourceName: '', endpoint: '' }); setRecSearchInput(''); setRecordsPage(1); setActiveTab(1); }}
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Errors</p>
            <p className="text-2xl font-black" style={{ color: '#4f46e5' }}>{summaryStats.total}</p>
          </div>
          <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm cursor-pointer hover:border-red-400 hover:shadow-md transition-all"
            onClick={() => { setRecFilters({ q: '', actorUserId: '', errorSeverity: 'CRITICAL', sourceType: '', sourceName: '', endpoint: '' }); setRecSearchInput(''); setRecordsPage(1); setActiveTab(1); }}
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Critical</p>
            <p className="text-2xl font-black" style={{ color: '#dc2626' }}>{summaryStats.critical}</p>
          </div>
          <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm cursor-pointer hover:border-orange-400 hover:shadow-md transition-all"
            onClick={() => { setRecFilters({ q: '', actorUserId: '', errorSeverity: 'HIGH', sourceType: '', sourceName: '', endpoint: '' }); setRecSearchInput(''); setRecordsPage(1); setActiveTab(1); }}
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">High Severity</p>
            <p className="text-2xl font-black" style={{ color: '#ea580c' }}>{summaryStats.high}</p>
          </div>
          <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm cursor-pointer hover:border-purple-400 hover:shadow-md transition-all"
            onClick={() => { setActiveTab(0); setTimeout(() => errorGroupsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Unique Errors</p>
            <p className="text-2xl font-black" style={{ color: '#7c3aed' }}>{summaryStats.uniqueErrors}</p>
          </div>
          <div
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm cursor-pointer hover:border-green-400 hover:shadow-md transition-all"
            onClick={() => { setUsersDialogError(null); setUsersDialogOpen(true); setUsersDialogLoading(false); setAffectedUsersList(topUsersData.map((u) => ({ userId: u.userId, name: u.name, count: u.count }))); }}
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Unique Users</p>
            <p className="text-2xl font-black" style={{ color: '#059669' }}>{topUsersData.length > 0 ? topUsersData.length : summaryStats.affectedUsers}</p>
          </div>
        </div>

        {/* Tab View */}
        <TabView activeIndex={activeTab} onTabChange={(e) => {
          if (e.index === 0) {
            setRecFilters({ q: '', actorUserId: '', errorSeverity: '', sourceType: '', sourceName: '', endpoint: '' });
            setRecSearchInput('');
            setRecordsPage(1);
          }
          setActiveTab(e.index);
        }}>
          {/* ===== OVERVIEW TAB ===== */}
          <TabPanel header="Overview">

        {/* Breakdown Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }} data-feedback="Error Breakdown Cards">
          {/* Source Type Distribution */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Source Type Distribution</h4>
            {sourceTypeBreakdown.length > 0 ? (() => {
              const maxCount = Math.max(...sourceTypeBreakdown.map((i) => i.count), 1);
              const typeColors: Record<string, [string, string]> = {
                API: ['#6366f1', '#4f46e5'], SCREEN: ['#22c55e', '#16a34a'], FUNCTION: ['#f97316', '#ea580c'],
                THIRDPARTY: ['#ec4899', '#db2777'], UI: ['#14b8a6', '#0d9488'],
              };
              return sourceTypeBreakdown.map((item) => {
                const pct = Math.max((item.count / maxCount) * 100, item.count > 0 ? 3 : 0);
                const [barColor, labelColor] = typeColors[item._id.toUpperCase()] || ['#6366f1', '#4f46e5'];
                return (
                  <div
                    key={item._id}
                    className="flex items-center gap-3 mb-3 last:mb-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => { setRecFilters(prev => ({ ...prev, sourceType: item._id })); setRecordsPage(1); setActiveTab(1); }}
                  >
                    <span className="text-xs font-bold w-20 flex-shrink-0" style={{ color: labelColor }}>{item._id}</span>
                    <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)` }} />
                    </div>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 w-14 text-right flex-shrink-0">{item.count.toLocaleString()}</span>
                  </div>
                );
              });
            })() : (
              <p className="text-xs text-gray-400">No data</p>
            )}
          </div>

          {/* Severity Distribution */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Severity Distribution</h4>
            {severityBreakdown.length > 0 ? (() => {
              const maxCount = Math.max(...severityBreakdown.map((i) => i.count), 1);
              const barColors: Record<string, string> = { LOW: '#22c55e', MEDIUM: '#6366f1', HIGH: '#f97316', CRITICAL: '#ef4444' };
              const labelColors: Record<string, string> = { LOW: '#16a34a', MEDIUM: '#4f46e5', HIGH: '#ea580c', CRITICAL: '#dc2626' };
              return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((sev) => {
                const item = severityBreakdown.find((i) => i._id === sev);
                const count = item?.count || 0;
                const pct = Math.max((count / maxCount) * 100, count > 0 ? 3 : 0);
                return (
                  <div
                    key={sev}
                    className="flex items-center gap-3 mb-3 last:mb-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => { setRecFilters(prev => ({ ...prev, errorSeverity: sev })); setRecordsPage(1); setActiveTab(1); }}
                  >
                    <span className="text-xs font-bold w-16 flex-shrink-0" style={{ color: labelColors[sev] }}>{sev}</span>
                    <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColors[sev]}, ${barColors[sev]}cc)` }} />
                    </div>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 w-14 text-right flex-shrink-0">{count.toLocaleString()}</span>
                  </div>
                );
              });
            })() : (
              <p className="text-xs text-gray-400">No data</p>
            )}
          </div>

          {/* Impact Summary */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Impact Summary</h4>
            {severityBreakdown.length > 0 ? (
              <>
                <div className="flex justify-between items-center pb-1.5 mb-1 border-b border-gray-200 dark:border-gray-600">
                  <span className="text-xs font-semibold text-gray-400 uppercase">Severity</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase">Users</span>
                </div>
                {severityBreakdown.map((item) => (
              <div
                key={item._id}
                className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded transition-colors"
                onClick={() => { setRecFilters(prev => ({ ...prev, errorSeverity: item._id })); setRecordsPage(1); setActiveTab(1); }}
              >
                <span className="text-xs text-gray-600 dark:text-gray-300">{item._id}</span>
                <div className="flex items-center gap-1.5">
                  <i className="pi pi-users text-gray-400" style={{ fontSize: '0.625rem' }} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {item.affectedUsers}
                  </span>
                </div>
              </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-gray-400">No data</p>
            )}
          </div>
        </div>

        {/* Activity Analysis */}
        {(activityAnalysis.topErrorCodes.length > 0 || activityAnalysis.topEndpoints.length > 0 || topUsersData.length > 0) && (
          <>
            <div className="flex items-center gap-2 mb-2 mt-3">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Analysis</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }} data-feedback="Activity Analysis">
              {/* Top 10 Error Codes */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  Top 10 Error Codes
                </h4>
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                  {activityAnalysis.topErrorCodes.length > 0 ? activityAnalysis.topErrorCodes.map((item, i) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors cursor-pointer"
                      onClick={() => { setRecSearchInput(item.name); setRecFilters(prev => ({ ...prev, q: item.name })); setRecordsPage(1); setActiveTab(1); }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-400 font-bold w-5 flex-shrink-0">#{i + 1}</span>
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate" title={item.name}>{item.name}</span>
                      </div>
                      <span className="text-xs font-bold text-white bg-indigo-600 px-1.5 py-0.5 rounded-md flex-shrink-0 ml-2">{item.count.toLocaleString()}</span>
                    </div>
                  )) : <p className="text-xs text-gray-400">No data</p>}
                </div>
              </div>

              {/* Top 10 Endpoints */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  Top 10 Endpoints
                </h4>
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                  {activityAnalysis.topEndpoints.length > 0 ? activityAnalysis.topEndpoints.map((item, i) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md bg-gray-50 dark:bg-gray-700/50 hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-colors cursor-pointer"
                      onClick={() => { setRecFilters(prev => ({ ...prev, endpoint: item.name })); setRecordsPage(1); setActiveTab(1); }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-400 font-bold w-5 flex-shrink-0">#{i + 1}</span>
                        <span className="text-xs text-sky-600 dark:text-sky-400 font-mono truncate" title={item.name}>{item.name}</span>
                      </div>
                      <span className="text-xs font-bold text-white bg-sky-600 px-1.5 py-0.5 rounded-md flex-shrink-0 ml-2">{item.count.toLocaleString()}</span>
                    </div>
                  )) : <p className="text-xs text-gray-400">No data</p>}
                </div>
              </div>
            </div>
            {/* Top 10 Users */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm" style={{ marginBottom: '0.625rem' }}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Top 10 Users
                </h4>
                <button
                  onClick={() => {
                    setUsersDialogError(null);
                    setUsersDialogOpen(true);
                    setUsersDialogLoading(false);
                    // Use topUsersData which already has resolved names from dashboard API
                    setAffectedUsersList(
                      topUsersData.map((u) => ({ userId: u.userId, name: u.name, count: u.count }))
                    );
                  }}
                  className="text-xs font-semibold text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700 rounded-md px-2.5 py-1 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors bg-transparent"
                >
                  Show All Users ({topUsersData.length})
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {topUsersData.length > 0 ? topUsersData.slice(0, 10).map((user, i) => (
                  <div
                    key={user.userId + i}
                    className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:bg-green-50 dark:hover:bg-green-900/10 hover:border-green-300 dark:hover:border-green-700 transition-all cursor-pointer"
                    onClick={() => handleUserAnalyticsClick(user.userId, user.name)}
                    title={`View analytics for ${user.name}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-gray-400 font-bold flex-shrink-0">#{i + 1}</span>
                      <span className="text-xs font-semibold text-green-600 dark:text-green-400 truncate" title={user.name}>{user.name}</span>
                    </div>
                    <span className="text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-md flex-shrink-0 ml-2">{user.count.toLocaleString()}</span>
                  </div>
                )) : <p className="text-xs text-gray-400">No data</p>}
              </div>
            </div>
          </>
        )}

        {/* Error Group Cards — moved from Records tab to Overview */}
        <div ref={errorGroupsRef} className="flex items-center gap-2 mb-2 mt-3">
          <span className="w-1.5 h-4 bg-indigo-500 rounded-full" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Error Groups</h3>
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
                          <span
                            className="text-xs font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-md cursor-pointer hover:bg-orange-600 transition-colors"
                            onClick={(e) => handleOccurrencesClick(e, error)}
                            title="View all records"
                          >{error.occurrences}x</span>
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

        {/* Pagination for error group cards */}
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
          </TabPanel>

          {/* ===== RECORDS TAB ===== */}
          <TabPanel header="Records">
        {/* Filters — clean row with dropdowns + search */}
        {showFilters && <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-2 shadow-sm" style={{ padding: '0.5rem 0.75rem' }} data-feedback="Records Filters">
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <Input name="rec-search" value={recSearchInput} onChange={(e: any) => setRecSearchInput(e?.target?.value ?? e)} placeholder="Search error code or message..." icon="pi pi-search" className="w-full" testId="Rec.Filter.Search" />
            </div>
            <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
              <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
              <Dropdown
                value={(recFilters as any).actorUserId || ''}
                options={[{ label: 'All Users', value: '' }, ...topUsersData.map((u) => ({ label: u.name, value: u.userId }))]}
                optionLabel="label" optionValue="value" filter filterPlaceholder="Search user..."
                onChange={(e: { value: string }) => { setRecFilters(prev => ({ ...prev, actorUserId: e.value } as any)); setRecordsPage(1); }}
                placeholder="All Users" className="w-full" resetFilterOnHide={true} showClear={!!(recFilters as any).actorUserId}
              />
            </div>
            <div style={{ flex: '0 1 140px', minWidth: '120px' }}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Severity</label>
              <Dropdown
                value={recFilters.errorSeverity} options={severityOptions} optionLabel="label" optionValue="value"
                onChange={(e: { value: string }) => { setRecFilters(prev => ({ ...prev, errorSeverity: e.value })); setRecordsPage(1); }}
                placeholder="All" className="w-full" resetFilterOnHide={true}
              />
            </div>
            <div style={{ flex: '0 1 140px', minWidth: '120px' }}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source Type</label>
              <Dropdown
                value={recFilters.sourceType} options={errorTypeOptions} optionLabel="label" optionValue="value"
                onChange={(e: { value: string }) => { setRecFilters(prev => ({ ...prev, sourceType: e.value })); setRecordsPage(1); }}
                placeholder="All" className="w-full" resetFilterOnHide={true}
              />
            </div>
            <div style={{ flex: '1 1 160px', minWidth: '130px' }}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source Name</label>
              <Dropdown
                value={recFilters.sourceName}
                options={[{ label: 'All Sources', value: '' }, ...[...new Set((dashboardStats?.errorGroups || []).map((g: any) => g.sourceName).filter(Boolean))].map((s: any) => ({ label: s, value: s }))]}
                optionLabel="label" optionValue="value" filter filterPlaceholder="Search source..."
                onChange={(e: { value: string }) => { setRecFilters(prev => ({ ...prev, sourceName: e.value })); setRecordsPage(1); }}
                placeholder="All Sources" className="w-full" resetFilterOnHide={true} showClear={!!recFilters.sourceName}
              />
            </div>
            <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Endpoint</label>
              <Dropdown
                value={recFilters.endpoint}
                options={[{ label: 'All Endpoints', value: '' }, ...[...new Set((dashboardStats?.errorGroups || []).map((g: any) => (g as any).endpoint).filter(Boolean))].map((ep: any) => ({ label: ep, value: ep }))]}
                optionLabel="label" optionValue="value" filter filterPlaceholder="Search endpoint..."
                onChange={(e: { value: string }) => { setRecFilters(prev => ({ ...prev, endpoint: e.value })); setRecordsPage(1); }}
                placeholder="All Endpoints" className="w-full" resetFilterOnHide={true} showClear={!!recFilters.endpoint}
              />
            </div>
            {(recFilters.q || recFilters.actorUserId || recFilters.errorSeverity || recFilters.sourceType || recFilters.sourceName || recFilters.endpoint) && (
              <button
                onClick={() => { setRecFilters({ q: '', actorUserId: '', errorSeverity: '', sourceType: '', sourceName: '', endpoint: '' }); setRecSearchInput(''); setRecordsPage(1); }}
                className="text-xs text-red-500 border border-red-300 rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-red-50 transition-colors bg-transparent whitespace-nowrap"
                style={{ marginBottom: '1px' }}
              >
                <i className="pi pi-times" style={{ fontSize: '0.6rem', marginRight: '0.25rem' }} /> Clear
              </button>
            )}
          </div>
        </div>}

        {/* Records DataTable */}
        {recordsLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <ProgressSpinner style={{ width: '36px', height: '36px' }} />
            <p className="text-xs text-gray-400 mt-2">Loading records...</p>
          </div>
        ) : (
          <>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
              <table className="w-full text-left" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    {([
                      ['eventDateTime', 'Time'],
                      ['errorCode', 'Error Code'],
                      ['errorSeverity', 'Severity'],
                      ['resolvedMessage', 'Message'],
                      ['sourceName', 'Source'],
                      ['endpoint', 'Endpoint'],
                      ['method', 'Method'],
                      ['actorUserId', 'User'],
                    ] as [string, string][]).map(([field, label]) => {
                      const active = recSortField === field;
                      const icon = active ? (recSortOrder === 'asc' ? 'pi-sort-amount-up' : 'pi-sort-amount-down') : 'pi-sort-alt';
                      return (
                        <th
                          key={field}
                          className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-indigo-600 transition-colors"
                          onClick={() => {
                            if (recSortField === field) {
                              setRecSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                            } else {
                              setRecSortField(field);
                              setRecSortOrder('desc');
                            }
                            setRecordsPage(1);
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {label}
                            <i className={`pi ${icon}`} style={{ fontSize: '0.6rem', color: active ? '#4f46e5' : '#9ca3af' }} />
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {recordsData.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-gray-400">No records found.</td></tr>
                  ) : recordsData.map((row: any, idx: number) => {
                    const sev = (row.errorSeverity || '').toUpperCase();
                    const msg = row.resolvedMessage || '';
                    const userName = recordsUserNames.get(row.actorUserId) || row.actorUserId || '-';
                    return (
                      <tr
                        key={row.id || idx}
                        className="border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                        onClick={() => { setRecordDetailData(row); setRecordDetailOpen(true); }}
                      >
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{row.eventDateTime ? new Date(row.eventDateTime).toLocaleString() : '-'}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white max-w-[200px] truncate" title={row.errorCode}>{row.errorCode || '-'}</td>
                        <td className="px-3 py-2">{sev ? <Tag value={sev} severity={getSeverityColor(sev)} style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }} /> : <span className="text-xs text-gray-400">-</span>}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 max-w-[250px] truncate" title={msg}>{msg || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs text-gray-700 dark:text-gray-300">{row.sourceName || '-'}</span>
                          {row.sourceType && <span className="text-xs text-gray-400 ml-1">({row.sourceType})</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono max-w-[160px] truncate" title={row.endpoint || ''}>{row.endpoint || '-'}</td>
                        <td className="px-3 py-2 text-xs font-medium text-gray-600">{row.method || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[100px] truncate" title={userName}>{userName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Records Pagination */}
            {recordsPagination && recordsPagination.totalItems > 0 && (
              <div className="flex items-center justify-between mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Rows:</span>
                  <select value={recordsPageSize} onChange={(e) => { setRecordsPageSize(Number(e.target.value)); setRecordsPage(1); }}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer">
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">Page {recordsPagination.page} of {recordsPagination.totalPages} ({recordsPagination.totalItems})</span>
                  <div className="flex gap-1">
                    <button onClick={() => setRecordsPage((p) => Math.max(1, p - 1))} disabled={!recordsPagination.hasPrevPage}
                      className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-500 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
                      <i className="pi pi-chevron-left" style={{ fontSize: '0.75rem' }} />
                    </button>
                    <button onClick={() => setRecordsPage((p) => p + 1)} disabled={!recordsPagination.hasNextPage}
                      className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 text-gray-500 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors">
                      <i className="pi pi-chevron-right" style={{ fontSize: '0.75rem' }} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
          </TabPanel>
        </TabView>
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
            <span className="text-base font-semibold text-gray-900 dark:text-white">{usersDialogError ? 'Affected Users' : 'All Users'}</span>
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
        style={{ width: '750px', maxHeight: '90vh' }}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
        contentStyle={{ overflowX: 'auto' }}
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
                        <div
                          key={code}
                          className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 rounded transition-colors"
                          onClick={() => { setUserAnalyticsOpen(false); setRecSearchInput(code); setRecFilters(prev => ({ ...prev, q: code })); setRecordsPage(1); setActiveTab(1); }}
                          title={`Filter records by ${code}`}
                        >
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-mono mr-2 break-all">{code}</span>
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
                        className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                        style={{ borderLeft: `3px solid ${severityColor[logSev] || '#94a3b8'}` }}
                        onClick={() => { setRecordDetailData(log); setRecordDetailOpen(true); }}
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

      {/* All Records Dialog — with pagination */}
      <Dialog
        visible={allRecordsDialogOpen}
        onHide={() => { setAllRecordsDialogOpen(false); setAllRecordsDialogError(null); setAllRecordsDialogFilter({}); setAllRecordsList([]); setAllRecordsPagination(null); setAllRecordsPage(1); }}
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-list text-orange-500" style={{ fontSize: '1rem' }} />
            <span className="text-base font-semibold text-gray-900 dark:text-white">All Records</span>
            {allRecordsDialogError && (
              <span className="text-xs font-bold text-white bg-orange-500 px-2 py-0.5 rounded-md ml-1">{allRecordsDialogError.errorCode}</span>
            )}
            {!allRecordsDialogError && allRecordsDialogFilter.errorCode && (
              <span className="text-xs font-bold text-white bg-indigo-600 px-2 py-0.5 rounded-md ml-1">{allRecordsDialogFilter.errorCode}</span>
            )}
            {!allRecordsDialogError && allRecordsDialogFilter.endpoint && (
              <span className="text-xs font-bold text-white bg-sky-600 px-2 py-0.5 rounded-md ml-1 truncate max-w-[300px]" title={allRecordsDialogFilter.endpoint}>{allRecordsDialogFilter.endpoint}</span>
            )}
            {!allRecordsLoading && allRecordsPagination && (
              <span className="text-xs text-gray-500 ml-1">({allRecordsPagination.totalItems})</span>
            )}
          </div>
        }
        style={{ width: '800px', maxHeight: '85vh' }}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        {allRecordsLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <ProgressSpinner style={{ width: '36px', height: '36px' }} />
            <p className="text-xs text-gray-400 mt-2">Loading records...</p>
          </div>
        ) : allRecordsList.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
              {allRecordsList.map((log: any, i: number) => {
                const logSev = (log.errorSeverity || '').toUpperCase();
                const itemIndex = ((allRecordsPage - 1) * 50) + i + 1;
                return (
                  <div
                    key={log._id || log.id || i}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-orange-300 dark:hover:border-orange-700 cursor-pointer transition-colors"
                    style={{ borderLeft: `3px solid ${severityColor[logSev] || '#94a3b8'}` }}
                    onClick={() => { setRecordDetailData(log); setRecordDetailOpen(true); }}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400">#{itemIndex}</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{log.errorCode}</span>
                        <Tag
                          value={logSev}
                          severity={getSeverityColor(logSev)}
                          style={{ fontSize: '0.5625rem', padding: '0.0625rem 0.3rem' }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {log.eventDateTime ? new Date(log.eventDateTime).toLocaleString() : '-'}
                      </span>
                    </div>

                    {/* Message */}
                    {log.resolvedMessage && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 whitespace-pre-wrap">{log.resolvedMessage}</p>
                    )}

                    {/* Details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {log.sourceType && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Source Type</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{log.sourceType}</p>
                        </div>
                      )}
                      {log.sourceName && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Source Name</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{log.sourceName}</p>
                        </div>
                      )}
                      {log.endpoint && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Endpoint</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono truncate" title={log.endpoint}>{log.endpoint}</p>
                        </div>
                      )}
                      {log.method && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Method</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{log.method}</p>
                        </div>
                      )}
                      {log.environment && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Environment</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{log.environment}</p>
                        </div>
                      )}
                      {log.actorUserId && (
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">User ID</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 font-mono truncate" title={log.actorUserId}>{log.actorUserId}</p>
                        </div>
                      )}
                      {log.userAgent && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-400 mb-0.5">User Agent</p>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={log.userAgent}>{log.userAgent}</p>
                        </div>
                      )}
                    </div>

                    {/* Parameters JSON */}
                    {log.parametersJson && Object.keys(log.parametersJson).length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-gray-500 font-medium hover:text-gray-700 dark:hover:text-gray-300">Parameters</summary>
                        <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded overflow-x-auto">{JSON.stringify(log.parametersJson, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination controls for All Records dialog */}
            {allRecordsPagination && allRecordsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500">
                  Page {allRecordsPagination.page} of {allRecordsPagination.totalPages} ({allRecordsPagination.totalItems} items)
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => fetchAllRecordsPage(allRecordsDialogFilter, allRecordsPage - 1)}
                    disabled={!allRecordsPagination.hasPrevPage || allRecordsLoading}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <i className="pi pi-chevron-left" style={{ fontSize: '0.75rem' }} />
                  </button>
                  <button
                    onClick={() => fetchAllRecordsPage(allRecordsDialogFilter, allRecordsPage + 1)}
                    disabled={!allRecordsPagination.hasNextPage || allRecordsLoading}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <i className="pi pi-chevron-right" style={{ fontSize: '0.75rem' }} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <i className="pi pi-info-circle text-gray-300 mb-2" style={{ fontSize: '1.5rem' }} />
            <p className="text-sm text-gray-400">No records found.</p>
          </div>
        )}
      </Dialog>

      {/* Record Detail Dialog — shows ALL fields from DB */}
      <Dialog
        visible={recordDetailOpen}
        onHide={() => { setRecordDetailOpen(false); setRecordDetailData(null); }}
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-file text-indigo-500" style={{ fontSize: '1rem' }} />
            <span className="text-base font-semibold text-gray-900 dark:text-white">Record Details</span>
            {recordDetailData?.errorCode && (
              <span className="text-xs font-mono text-white bg-indigo-600 px-2 py-0.5 rounded-md ml-1">{recordDetailData.errorCode}</span>
            )}
          </div>
        }
        style={{ width: '800px', maxHeight: '90vh' }}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        {recordDetailData ? (
          <div className="flex flex-col gap-3">
            {/* Severity + Environment + Method badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {recordDetailData.errorSeverity && (
                <Tag value={recordDetailData.errorSeverity.toUpperCase()} severity={getSeverityColor(recordDetailData.errorSeverity.toUpperCase())} />
              )}
              {recordDetailData.environment && (
                <Tag value={recordDetailData.environment} className="text-xs" />
              )}
              {recordDetailData.method && (
                <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded">{recordDetailData.method}</span>
              )}
              {recordDetailData.sourceType && (
                <span className="text-xs text-gray-600 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{recordDetailData.sourceType}</span>
              )}
            </div>

            {/* Message */}
            {recordDetailData.resolvedMessage && (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Message</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{recordDetailData.resolvedMessage}</p>
              </div>
            )}

            {/* All fields in a grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              {(() => {
                // Fields to show in a specific order first, then the rest
                const priorityFields = [
                  'id', 'errorCode', 'errorSeverity', 'eventDateTime', 'createdAt',
                  'sourceName', 'sourceType', 'endpoint', 'method',
                  'environment', 'actorUserId', 'ip', 'userAgent',
                  'resolvedMessage',
                  'affectedFeature', 'category', 'assignedTo', 'status',
                  'impactLevel', 'occurrences', 'firstOccurrence', 'lastOccurrence',
                  'resolutionTime', 'suggestedAction', 'userFriendlyMessage',
                  'userId', 'userName', 'sourceScreen',
                ];
                const skipFields = ['parameters', 'parametersJson']; // shown separately
                const allKeys = Object.keys(recordDetailData);
                const orderedKeys = [
                  ...priorityFields.filter(k => allKeys.includes(k)),
                  ...allKeys.filter(k => !priorityFields.includes(k) && !skipFields.includes(k)),
                ];

                return orderedKeys.map((key) => {
                  let val = recordDetailData[key];
                  if (val === null || val === undefined) val = '-';
                  else if (typeof val === 'object' && !Array.isArray(val)) val = JSON.stringify(val);
                  else if (Array.isArray(val)) return null; // arrays shown below
                  else val = String(val);

                  // Format datetime strings
                  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
                    try { val = new Date(val).toLocaleString(); } catch { /* keep as-is */ }
                  }

                  const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                  return (
                    <div key={key} className="py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                      <p className="text-xs text-gray-400 font-medium">{label}</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 break-all">{val}</p>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Parameters */}
            {recordDetailData.parameters && Array.isArray(recordDetailData.parameters) && recordDetailData.parameters.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">Parameters ({recordDetailData.parameters.length})</p>
                <div className="grid grid-cols-2 gap-2">
                  {recordDetailData.parameters.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded px-2 py-1.5">
                      <span className="text-xs font-semibold text-indigo-600">{p.name || p.key || `#${i + 1}`}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-300 break-all">{p.value || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ParametersJson */}
            {recordDetailData.parametersJson && typeof recordDetailData.parametersJson === 'object' && Object.keys(recordDetailData.parametersJson).length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">Parameters JSON</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-48 text-gray-700 dark:text-gray-300">
                  {JSON.stringify(recordDetailData.parametersJson, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : null}
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
