/**
 * Audit Log Dashboard
 * Full-featured dashboard with Overview and Activity Log tabs.
 */

import { useState, useEffect, useRef } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Skeleton } from 'primereact/skeleton';
import { useAuditDashboard, useAllUsers, useAllTemplates } from '../../hooks/useAuditDashboard';
import type {
  LogTransaction,
  AuditDashboardFilters,
  DashboardData,
} from '../../types/log-transaction.types';
import LogDetailDrawer from './log-detail-drawer';
import OverviewCards from './components/OverviewCards';
import ModuleGrid from './components/ModuleGrid';
import LayerLevelBreakdown from './components/LayerLevelBreakdown';
import TopActivity from './components/TopActivity';
import SystemHealth from './components/SystemHealth';
import ActivityFilterBar from './components/ActivityFilterBar';
import ActivityTable from './components/ActivityTable';
import MasterLogTab from './components/MasterLogTab';

const LogTransactionList = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filters, setFilters] = useState<AuditDashboardFilters>({
    page: 1,
    page_size: 10,
  });
  const [first, setFirst] = useState(0);
  const [selectedLog, setSelectedLog] = useState<LogTransaction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dateRange, setDateRange] = useState<Date[] | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Map tab index to tab param: 0=overview, 1=activity, 2=master (no API call)
  const tabParam = activeTab === 0 ? 'overview' : activeTab === 1 ? 'activity' : 'overview';

  // Fetch dashboard data (single endpoint with tab param)
  const { data: dashboardResponse, isLoading, refetch } = useAuditDashboard({ ...filters, tab: tabParam });
  const dashboard: DashboardData | null = dashboardResponse?.data || null;

  // Fetch dropdown options
  const { data: usersResponse } = useAllUsers();
  const { data: templatesResponse } = useAllTemplates();
  const allUsers = usersResponse?.data || [];
  const allTemplates = templatesResponse?.data || [];

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => refetch(), 120000);
    } else if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [autoRefresh, refetch]);

  // Filter handlers
  const handleFilterChange = (key: keyof AuditDashboardFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));
    setFirst(0);
  };

  const handleDateRangeChange = (dates: Date[] | null) => {
    setDateRange(dates);
    if (dates && dates.length === 2 && dates[0] && dates[1]) {
      setFilters((prev) => ({
        ...prev,
        fromDate: dates[0]!.toISOString(),
        toDate: dates[1]!.toISOString(),
        timeline: undefined,
        page: 1,
      }));
      setFirst(0);
    } else if (!dates) {
      setFilters((prev) => {
        const { fromDate, toDate, timeline, ...rest } = prev;
        return { ...rest, page: 1 };
      });
      setFirst(0);
    }
  };

  const handleDatePreset = (preset: string) => {
    setDateRange(null);
    setFilters((prev) => ({
      ...prev,
      timeline: preset,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
    }));
    setFirst(0);
  };

  const clearFilters = () => {
    setFilters({ page: 1, page_size: 10 });
    setDateRange(null);
    setFirst(0);
  };

  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setFilters((prev) => ({ ...prev, page: newPage, page_size: event.rows }));
  };

  const handleRowClick = (log: LogTransaction) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  // Loading skeleton
  if (isLoading && !dashboard) {
    return (
      <div className="py-2 px-3">
        <div className="flex items-center justify-between mb-2">
          <Skeleton width="280px" height="32px" />
          <Skeleton width="70px" height="32px" />
        </div>
        <div className="grid grid-cols-4 gap-3 mb-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height="80px" />)}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <Skeleton height="240px" />
          <Skeleton height="240px" />
        </div>
        <Skeleton height="320px" />
      </div>
    );
  }

  // Defaults
  const overview = dashboard?.overview || { totalLogs: 0, totalTemplates: 0, todayLogs: 0, weekLogs: 0 };
  const byLevel = dashboard?.byLevel || { info: 0, warning: 0, error: 0 };
  const analytics = dashboard?.analytics || {};
  const topUsers = dashboard?.topUsers || [];
  const topEndpoints = dashboard?.topEndpoints || [];
  const mostRepeated = dashboard?.mostRepeated || [];
  const templateHealth = dashboard?.templateHealth || { total: 0, activeWithLogs: 0, activeNoLogs: 0, inactive: 0, deleted: 0 };
  const topLogModules = dashboard?.topLogModules || [];
  const logs = dashboard?.logs?.items || [];

  return (
    <div className="py-2 px-3" data-testid="SCR-AuditDashboard">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <i className="pi pi-chart-bar" style={{ fontSize: '0.875rem', color: 'white' }} />
              </div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                Audit Log Dashboard
              </h1>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 ml-9">
              Comprehensive audit log monitoring and analysis
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
              data-testid="AuditDashboard.Button.Live"
            >
              <i className={`pi pi-refresh ${autoRefresh ? 'pi-spin' : ''}`} style={{ fontSize: '0.75rem' }} />
              Live
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <OverviewCards overview={overview} byLevel={byLevel} />

      {/* Tab View */}
      <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
        {/* ===== OVERVIEW TAB ===== */}
        <TabPanel header="Overview">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <ModuleGrid topLogModules={topLogModules} />
            <LayerLevelBreakdown analytics={analytics} />
          </div>
          <TopActivity
            topUsers={topUsers}
            topEndpoints={topEndpoints}
            mostRepeated={mostRepeated}
            onUserClick={(actorId) => {
              setFilters((prev) => ({ ...prev, actorId, page: 1 }));
              setFirst(0);
              setActiveTab(1);
            }}
            onEndpointClick={(endpoint) => {
              setFilters((prev) => ({ ...prev, search: endpoint, page: 1 }));
              setFirst(0);
              setActiveTab(1);
            }}
            onEventCodeClick={(eventcode) => {
              setFilters((prev) => ({ ...prev, eventcode, page: 1 }));
              setFirst(0);
              setActiveTab(1);
            }}
          />
          <SystemHealth templateHealth={templateHealth} />
        </TabPanel>

        {/* ===== ACTIVITY LOG TAB ===== */}
        <TabPanel header="Activity Log">
          <ActivityFilterBar
            filters={filters}
            dateRange={dateRange}
            allUsers={allUsers}
            allTemplates={allTemplates}
            allEntityTypes={dashboard?.allEntityTypes || []}
            onFilterChange={handleFilterChange}
            onDateRangeChange={handleDateRangeChange}
            onDatePreset={handleDatePreset}
            onClearFilters={clearFilters}
          />
          <ActivityTable
            logs={logs}
            totalRecords={dashboard?.logs?.total || 0}
            loading={isLoading}
            first={first}
            rows={filters.page_size || 10}
            autoRefresh={autoRefresh}
            sortField={filters.sortField || 'EventTimeStamp'}
            sortOrder={(filters.sortOrder || -1) as 1 | -1}
            onPageChange={handlePageChange}
            onSort={(e: any) => {
              setFilters((prev) => ({
                ...prev,
                sortField: e.sortField,
                sortOrder: e.sortOrder === 1 ? 1 : -1,
                page: 1,
              }));
              setFirst(0);
            }}
            onRowClick={handleRowClick}
          />
        </TabPanel>

        {/* ===== MASTER LOG TAB ===== */}
        <TabPanel header="Master Log">
          <MasterLogTab />
        </TabPanel>
      </TabView>

      {/* Log Detail Drawer */}
      <LogDetailDrawer
        open={drawerOpen}
        log={selectedLog}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLog(null);
        }}
      />
    </div>
  );
};

export default LogTransactionList;
