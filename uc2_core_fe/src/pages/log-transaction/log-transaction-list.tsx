import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Skeleton } from 'primereact/skeleton';
import { Calendar } from 'primereact/calendar';
import { Sidebar } from 'primereact/sidebar';
import { StatCard } from 'mainFe/StatCard';
import { Tag } from 'mainFe/Tag';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { ExportButton } from 'mainFe/ExportButton';
import { Button } from 'mainFe/Button';
import { formatTimestamp } from 'mainFe/dateUtils';
import FormSearchableSelect from '../../components/forms/form-searchable-select';
import type { SelectOption } from '../../components/forms/form-searchable-select';
import { useAuditDashboard, useAllUsers, useAllTemplates } from '../../hooks/useAuditDashboard';
import { useDebounce } from '../../hooks/useDebounce';
import { logTransactionService } from '../../services/log-transaction.service';
import { logMasterService } from '../../services/log-master.service';
import LogTransactionView from './log-transaction-view';
import type { LogTransaction, LogLayer, AuditDashboardFilters, UserOption, LogTemplate, DashboardData, AuditOverview, LevelBreakdown, TopLogModule, TopUser, TopEndpoint, MostRepeatedLog, TemplateHealth } from '../../types/log-transaction.types';
import type { LogMaster, LogMasterQueryParams } from '../../types';

// --- OverviewCards.tsx ---
interface OverviewCardsProps {
  overview: AuditOverview;
  byLevel: LevelBreakdown;
}

const OverviewCards = ({ overview, byLevel }: OverviewCardsProps) => {
  const total = byLevel.info + byLevel.warning + byLevel.error;
  const pct = (val: number) => total > 0 ? ((val / total) * 100).toFixed(1) : '0';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '0.5rem' }}>
      <StatCard
        title="Total Logs"
        value={overview.totalLogs.toLocaleString()}
        subtitle="All log entries"
        variant="blue"
        icon={<i className="pi pi-chart-line" />}
        // @ts-ignore
        horizontal
      />
      <StatCard
        title="Info"
        value={byLevel.info.toLocaleString()}
        subtitle={`${pct(byLevel.info)}% of total`}
        variant="green"
        icon={<i className="pi pi-info-circle" />}
        // @ts-ignore
        horizontal
      />
      <StatCard
        title="Warnings"
        value={byLevel.warning.toLocaleString()}
        subtitle={`${pct(byLevel.warning)}% of total`}
        variant="orange"
        icon={<i className="pi pi-exclamation-triangle" />}
        // @ts-ignore
        horizontal
      />
      <StatCard
        title="Errors"
        value={byLevel.error.toLocaleString()}
        subtitle={`${pct(byLevel.error)}% of total`}
        variant="red"
        icon={<i className="pi pi-times-circle" />}
        // @ts-ignore
        horizontal
      />
    </div>
  );
};

// --- ModuleGrid.tsx ---
interface ModuleGridProps {
  topLogModules: TopLogModule[];
}

const ModuleGrid = ({ topLogModules }: ModuleGridProps) => {
  const maxCount = useMemo(() => {
    if (!topLogModules.length) return 1;
    return Math.max(...topLogModules.map((m) => m.logCount), 1);
  }, [topLogModules]);

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Entity Type Activity Breakdown
      </h3>
      <div className="space-y-2">
        {topLogModules.length > 0 ? topLogModules.map((mod, idx) => (
          <div key={idx}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-900 dark:text-white">{mod.entityType || 'Unknown'}</span>
              <span className="text-blue-600 dark:text-blue-400">{mod.logCount.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${(mod.logCount / maxCount) * 100}%` }}
              />
            </div>
          </div>
        )) : (
          <div className="text-center text-gray-400 text-sm py-6">No module data</div>
        )}
      </div>
    </div>
  );
};

// --- LayerLevelBreakdown.tsx ---
interface LayerLevelBreakdownProps {
  analytics: Record<string, number>;
}

const LAYER_COLORS: Record<string, string> = {
  api: 'bg-orange-500', API: 'bg-orange-500',
  function: 'bg-green-500', screen: 'bg-blue-500',
  config: 'bg-gray-500', db: 'bg-purple-500',
  Server: 'bg-red-500',
};

const LayerLevelBreakdown = ({ analytics }: LayerLevelBreakdownProps) => {
  const total = analytics.total || 1;
  const layers = Object.entries(analytics)
    .filter(([key]) => key !== 'total')
    .sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Layer Activity
      </h3>
      <div className="space-y-2">
        {layers.length > 0 ? layers.map(([layer, count]) => {
          const pct = ((count as number) / total) * 100;
          return (
            <div key={layer}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-900 dark:text-white uppercase">{layer}</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {(count as number).toLocaleString()} ({pct.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`${LAYER_COLORS[layer] || 'bg-gray-500'} h-2 rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        }) : (
          <div className="text-center text-gray-400 text-sm py-6">No layer data</div>
        )}
      </div>
    </div>
  );
};

// --- TopActivity.tsx ---
interface TopActivityProps {
  topUsers: TopUser[];
  topEndpoints: TopEndpoint[];
  mostRepeated: MostRepeatedLog[];
  onUserClick?: (actorId: string) => void;
  onEndpointClick?: (endpoint: string) => void;
  onEventCodeClick?: (eventcode: string) => void;
}

const RankedList = ({
  title,
  items,
  color,
  onItemClick,
}: {
  title: string;
  items: { label: string; value: number; key: string }[];
  color: 'blue' | 'green' | 'purple';
  onItemClick?: (key: string) => void;
}) => {
  const colorMap = {
    blue: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-400' },
    green: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-600 dark:text-green-400' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-600 dark:text-purple-400' },
  };
  const c = colorMap[color];

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <div className="space-y-1.5">
        {items.length > 0 ? items.slice(0, 8).map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0 ${onItemClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 -mx-1 transition-colors' : ''}`}
            onClick={() => onItemClick?.(item.key)}
          >
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full ${c.bg} ${c.text} text-xs flex items-center justify-center font-medium`}>
                {idx + 1}
              </span>
              <span className={`text-xs text-gray-900 dark:text-white truncate ${onItemClick ? 'hover:underline' : ''}`} style={{ maxWidth: '180px' }}>
                {item.label}
              </span>
            </div>
            <span className={`text-xs font-medium ${c.text}`}>{item.value.toLocaleString()}</span>
          </div>
        )) : (
          <div className="text-center text-gray-400 text-sm py-4">No data</div>
        )}
      </div>
    </div>
  );
};

const TopActivity = ({ topUsers, topEndpoints, mostRepeated, onUserClick, onEndpointClick, onEventCodeClick }: TopActivityProps) => {
  return (
    <div className="grid grid-cols-3 gap-3 mb-3">
      <RankedList
        title="Top Users"
        items={topUsers.map((u) => ({ label: u.name, value: u.count, key: u.actorId }))}
        color="blue"
        onItemClick={onUserClick}
      />
      <RankedList
        title="Most Accessed Endpoints"
        items={topEndpoints.map((e) => ({ label: e.endpoint, value: e.count, key: e.endpoint }))}
        color="green"
        onItemClick={onEndpointClick}
      />
      <RankedList
        title="Most Repeated Logs"
        items={mostRepeated.map((l) => ({ label: l.name, value: l.count, key: l.eventcode }))}
        color="purple"
        onItemClick={onEventCodeClick}
      />
    </div>
  );
};

// --- SystemHealth.tsx ---
interface SystemHealthProps {
  templateHealth: TemplateHealth;
}

const SystemHealth = ({ templateHealth }: SystemHealthProps) => {
  return (
    <div className="mb-3">
      <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Log Master Health
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 dark:bg-green-900/20 p-2.5 rounded-md border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-600 dark:text-green-400">Active (with logs)</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">{templateHealth.activeWithLogs}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2.5 rounded-md border border-yellow-200 dark:border-yellow-800">
            <p className="text-xs text-yellow-600 dark:text-yellow-400">Active (no logs)</p>
            <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{templateHealth.activeNoLogs}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 p-2.5 rounded-md border border-gray-200 dark:border-gray-600">
            <p className="text-xs text-gray-600 dark:text-gray-400">Inactive</p>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-300">{templateHealth.inactive}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2.5 rounded-md border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400">Deleted</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-300">{templateHealth.deleted}</p>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Templates</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{templateHealth.total}</p>
        </div>
      </div>
    </div>
  );
};

// --- ActivityFilterBar.tsx ---
interface ActivityFilterBarProps {
  filters: AuditDashboardFilters;
  dateRange: Date[] | null;
  allUsers: UserOption[];
  allTemplates: LogTemplate[];
  allEntityTypes: string[];
  onFilterChange: (key: keyof AuditDashboardFilters, value: any) => void;
  onDateRangeChange: (dates: Date[] | null) => void;
  onDatePreset: (preset: string) => void;
  onClearFilters: () => void;
}

const LAYER_OPTIONS = [
  { label: 'All Layers', value: '' },
  { label: 'Screen', value: 'screen' },
  { label: 'Function', value: 'function' },
  { label: 'API', value: 'api' },
  { label: 'Config', value: 'config' },
];

const ActivityFilterBar = ({
  filters,
  dateRange,
  allUsers,
  allTemplates,
  allEntityTypes,
  onFilterChange,
  onDateRangeChange,
  onDatePreset,
  onClearFilters,
}: ActivityFilterBarProps) => {
  const userOptions = useMemo(() => [
    { label: 'All Users', value: '' },
    ...allUsers.map((u) => ({ label: u.name, value: u.actorId })),
  ], [allUsers]);

  const handleUserSearch = async (searchTerm: string): Promise<SelectOption[]> => {
    try {
      const response = await logTransactionService.getAllUsers(searchTerm);
      return (response.data || []).map((u) => ({
        label: u.name,
        value: u.actorId,
      }));
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  };

  const templateOptions = [
    { label: 'All Templates', value: '' },
    ...allTemplates.map((t) => ({ label: `${t.eventCode} - ${t.name}`, value: t.eventCode })),
  ];

  const entityTypeOptions = [
    { label: 'All Entity Types', value: '' },
    ...allEntityTypes.map((t) => ({ label: t, value: t })),
  ];

  const keyFieldOptions = useMemo(() => {
    const keySet = new Set<string>();
    allTemplates.forEach((t) => {
      if (t.parameters && Array.isArray(t.parameters)) {
        t.parameters.forEach((p) => {
          if (p.isKeyField && p.name) {
            keySet.add(p.name.trim());
          }
        });
      }
    });
    const sorted = Array.from(keySet).sort();
    return [
      { label: 'All Key Fields', value: '' },
      ...sorted.map((k) => ({ label: k, value: k })),
    ];
  }, [allTemplates]);

  return (
    <>
      <Tooltip target="[data-pr-tooltip]" />
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 mb-2" style={{ padding: '0.625rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Layer</label>
            <Dropdown
              value={filters.layer ?? ''}
              options={LAYER_OPTIONS}
              onChange={(e: { value: string }) => onFilterChange('layer', e.value)}
              placeholder="All Layers"
              className="w-full"
              data-testid="AuditDashboard.Filter.Layer"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Entity Type</label>
            <Dropdown
              value={filters.entityType ?? ''}
              options={entityTypeOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e: { value: string }) => onFilterChange('entityType', e.value)}
              placeholder="All Entity Types"
              className="w-full"
              data-testid="AuditDashboard.Filter.EntityType"
              resetFilterOnHide={true}
              filter
              virtualScrollerOptions={{ itemSize: 38 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>User</label>
            <FormSearchableSelect
              name="actorId"
              label=""
              value={filters.actorId ?? ''}
              initialOptions={userOptions}
              onSearch={handleUserSearch}
              onChange={(e: { target: { name: string; value: string } }) => onFilterChange('actorId', e.target.value)}
              placeholder="All Users"
              testId="AuditDashboard.Filter.User"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Event Code</label>
            <Dropdown
              value={filters.eventcode ?? ''}
              options={templateOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e: { value: string }) => onFilterChange('eventcode', e.value)}
              placeholder="All Event Codes"
              className="w-full"
              data-testid="AuditDashboard.Filter.EventCode"
              resetFilterOnHide={true}
              filter
              virtualScrollerOptions={{ itemSize: 38 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Search</label>
            <Input
              name="search"
              value={filters.search || ''}
              onChange={(e: any) => onFilterChange('search', e.target.value)}
              placeholder="Search in message..."
              className="w-full"
              data-testid="AuditDashboard.Filter.Search"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Key Field</label>
            <Dropdown
              value={filters.paramKey ?? ''}
              options={keyFieldOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e: { value: string }) => {
                onFilterChange('paramKey', e.value);
                if (!e.value) onFilterChange('paramValue', '');
              }}
              placeholder="All Key Fields"
              className="w-full"
              data-testid="AuditDashboard.Filter.ParamKey"
              resetFilterOnHide={true}
              filter
              virtualScrollerOptions={{ itemSize: 38 }}
            />
          </div>
          {filters.paramKey && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '120px' }}>
              <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Value</label>
              <Input
                name="paramValue"
                value={filters.paramValue || ''}
                onChange={(e: any) => onFilterChange('paramValue', e.target.value)}
                placeholder={`Search ${filters.paramKey}...`}
                className="w-full"
                data-testid="AuditDashboard.Filter.ParamValue"
              />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Date Range</label>
            <Calendar
              value={dateRange as any}
              onChange={(e) => onDateRangeChange(e.value as Date[] | null)}
              selectionMode="range"
              placeholder="Select date range"
              className="w-full"
              dateFormat="dd/mm/yy"
              showIcon
              data-testid="AuditDashboard.Filter.DateRange"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
            {[
              { key: 'today', label: 'Today' },
              { key: 'last7Days', label: '7 Days' },
              { key: 'last30Days', label: '30 Days' },
              { key: 'thisMonth', label: 'This Month' },
            ].map((preset) => (
              <button
                key={preset.key}
                onClick={() => onDatePreset(preset.key)}
                className="px-2 py-1.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-none cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ flexShrink: 0 }}>
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={onClearFilters}
              data-testid="AuditDashboard.Button.ClearFilters"
              data-pr-tooltip="Clear Filters"
            >
              <i className="pi pi-filter-slash text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// --- ActivityTable.tsx ---
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

// --- MasterDetailDrawer.tsx ---
interface MasterDetailDrawerProps {
  open: boolean;
  master: LogMaster | null;
  onClose: () => void;
}

const getLevelSeverity = (level: string): 'info' | 'warning' | 'danger' | 'secondary' => {
  switch (level?.toUpperCase()) {
    case 'INFO': return 'info';
    case 'WARNING': case 'WARN': return 'warning';
    case 'ERROR': return 'danger';
    default: return 'secondary';
  }
};



const MasterDetailDrawer = ({ open, master, onClose }: MasterDetailDrawerProps) => {
  if (!master) return null;

  return (
    <Sidebar
      visible={open}
      onHide={onClose}
      position="right"
      style={{ width: '700px' }}
      header={
        <div className="flex items-center gap-3 px-4 py-3">
          <i className="pi pi-file-edit text-blue-600" style={{ fontSize: '1.25rem' }} />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Master Template Details
          </span>
        </div>
      }
    >
      <div className="flex flex-col h-full p-6" style={{ fontSize: '14px' }}>
        <div className="flex-1 overflow-y-auto">
          {/* Event Code & Basic Info */}
          <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Event Code</p>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 font-mono break-all">
                {master.eventCode || '-'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Object</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{master.logObject || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Action</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{master.action || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Layer</p>
                <p className="text-sm text-gray-900 dark:text-white">{master.layer || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Level</p>
                <Tag value={master.logLevel || 'INFO'} severity={getLevelSeverity(master.logLevel)} className="text-xs" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Type</p>
                <p className="text-sm text-gray-900 dark:text-white">{master.logtype || '-'}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          {master.description && (
            <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-info-circle text-blue-600 dark:text-blue-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Description</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{master.description}</p>
            </div>
          )}

          {/* Message Template */}
          {master.messageTemplate && (
            <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-comment text-amber-600 dark:text-amber-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Message Template</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 font-mono bg-white dark:bg-gray-700 p-3 rounded border border-amber-100 dark:border-gray-600 whitespace-pre-wrap">
                {master.messageTemplate}
              </p>
            </div>
          )}

          {/* Key Fields & Parameters */}
          <div className="bg-teal-50 dark:bg-gray-800 border border-teal-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-key text-teal-600 dark:text-teal-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">Key Fields & Parameters</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Key Fields</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono break-all">
                  {master.parameters && master.parameters.some((p: any) => typeof p === 'object' && p !== null && p.isKeyField)
                    ? master.parameters.filter((p: any) => typeof p === 'object' && p !== null && p.isKeyField).map((p: any) => p.name).join(', ')
                    : (master as any).keyFields || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Retention Period</p>
                <p className="text-sm text-gray-900 dark:text-white">{master.retentionPeriod} days</p>
              </div>
            </div>
            {master.parameters && master.parameters.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Parameters</p>
                <div className="flex flex-wrap gap-1.5">
                  {master.parameters.map((p: any, i) => {
                    const isObj = typeof p === 'object' && p !== null;
                    const name = isObj ? p.name : String(p);
                    const isKey = isObj && p.isKeyField;
                    const isSensitive = isObj && p.isSensitive;

                    let bgClass = "bg-teal-50 text-teal-700 border-teal-200 dark:bg-gray-700 dark:text-teal-300 dark:border-gray-600";
                    if (isSensitive) bgClass = "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800";
                    else if (isKey) bgClass = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800";

                    return (
                      <span key={i} className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 font-mono border ${bgClass}`}>
                        {isKey && <i className="pi pi-key" style={{ fontSize: '0.65rem' }} />}
                        {isSensitive && <i className="pi pi-shield" style={{ fontSize: '0.65rem' }} />}
                        {name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Template Parameters */}
          {master.templateParameters && Object.keys(master.templateParameters).length > 0 && (
            <div className="bg-purple-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-database text-purple-600 dark:text-purple-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                  Template Parameters ({Object.keys(master.templateParameters).length} fields)
                </span>
              </div>
              <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
                {Object.entries(master.templateParameters).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1.5 border-b border-purple-100 dark:border-gray-600 last:border-0">
                    <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 font-mono">{key}</span>
                    <span className="text-xs text-gray-900 dark:text-white font-mono break-all text-right max-w-[70%]">
                      {typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value) || '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flags */}
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-flag text-gray-600 dark:text-gray-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Flags</span>
            </div>
            <div className="flex gap-3">
              <Tag value={master.isActive ? 'Active' : 'Inactive'} severity={master.isActive ? 'success' : 'danger'} className="text-xs" />
              {master.isUsageTrackable && <Tag value="Usage Trackable" severity="info" className="text-xs" />}
              {(master as any).isSensitive && <Tag value="Sensitive" severity="warning" className="text-xs" />}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Created At</p>
                <p className="text-xs text-gray-900 dark:text-white font-mono">{formatTimestamp(master.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Updated At</p>
                <p className="text-xs text-gray-900 dark:text-white font-mono">{formatTimestamp(master.updatedAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">ID</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all">{master._id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-5 flex gap-3">
          <Button label="Copy ID" icon="pi pi-copy" onClick={() => navigator.clipboard.writeText(master._id)} data-testid="MasterDetail.Button.CopyId" />
          <Button label="Close" severity="secondary" outlined onClick={onClose} data-testid="MasterDetail.Button.Close" />
        </div>
      </div>
    </Sidebar>
  );
};

const MasterLogTab = () => {
  const [selectedMaster, setSelectedMaster] = useState<LogMaster | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [data, setData] = useState<(LogMaster & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState('');
  const [searchText, setSearchText] = useState('');
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const debouncedSearch = useDebounce(searchText, 500);

  const fetchData = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const response = await logMasterService.getAllPaginated({
        page,
        page_size: size,
        layer: selectedLayer || undefined,
        eventCode: debouncedSearch || undefined,
      });
      setData((response.items || []).map((item) => ({ ...item, id: item._id })));
      setTotalRecords(response.total || 0);
    } catch (err) {
      console.error('Failed to fetch log masters:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedLayer, debouncedSearch, pageSize]);

  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchData(newPage, event.rows);
  };

  useEffect(() => {
    setFirst(0);
    fetchData(1, pageSize);
  }, [selectedLayer, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportColumns = useMemo(() => [
    { field: 'eventCode', header: 'Event Code' },
    { field: 'logObject', header: 'Log Object' },
    { field: 'action', header: 'Action' },
    { field: 'description', header: 'Description' },
    { field: 'layer', header: 'Layer' },
    { field: 'logLevel', header: 'Log Level' },
    { field: 'parametersSummary', header: 'Parameters' },
  ], []);

  const fetchExportData = useCallback(async (): Promise<any[]> => {
    const params: Omit<LogMasterQueryParams, 'page' | 'page_size'> = {};
    if (selectedLayer) params.layer = selectedLayer;
    if (debouncedSearch?.trim()) params.eventCode = debouncedSearch.trim();
    const data = await logMasterService.getAllForExport(params, pageSize);
    return data.map((item) => {
      const p = item.parameters || [];
      const keyCount = p.filter((x: any) => typeof x === 'object' && x !== null && x.isKeyField).length;
      const sensitiveCount = p.filter((x: any) => typeof x === 'object' && x !== null && x.isSensitive).length;
      return {
        ...item,
        parametersSummary: `${p.length} fields, ${keyCount} keys, ${sensitiveCount} sensitive`,
      };
    });
  }, [selectedLayer, debouncedSearch, pageSize]);

  const columns: DataTableColumn<LogMaster & { id: string }>[] = useMemo(() => [
    {
      field: 'eventCode',
      header: 'Event Code',
      style: { minWidth: '280px' },
      body: (rowData: LogMaster) => (
        <div>
          <span className="font-mono text-xs text-gray-900 dark:text-white break-all">
            {rowData.eventCode || '-'}
          </span>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {rowData.logObject || '-'}
          </div>
        </div>
      ),
    },
    {
      field: 'action',
      header: 'Action',
      style: { width: '100px' },
      body: (rowData: LogMaster) => (
        <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
          {rowData.action || '-'}
        </span>
      ),
    },
    {
      field: 'description',
      header: 'Description',
      sortable: false,
      style: { minWidth: '250px' },
      body: (rowData: LogMaster) => (
        <span
          className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1"
          data-pr-tooltip={rowData.description || undefined}
        >
          {rowData.description || '-'}
        </span>
      ),
    },
    {
      field: 'layer',
      header: 'Layer',
      style: { width: '80px' },
      body: (rowData: LogMaster) => (
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {rowData.layer || '-'}
        </span>
      ),
    },
    {
      field: 'logLevel',
      header: 'Level',
      style: { width: '90px' },
      body: (rowData: LogMaster) => (
        <Tag value={rowData.logLevel || 'INFO'} severity={getLevelSeverity(rowData.logLevel)} className="text-xs" />
      ),
    },
    {
      field: 'parameters',
      header: 'Parameters',
      style: { width: '130px' },
      body: (rowData: LogMaster) => {
        const params = rowData.parameters || [];
        if (!params.length) return <span className="text-xs text-gray-400">-</span>;

        let keyCount = 0;
        let sensitiveCount = 0;

        params.forEach((p: any) => {
          if (typeof p === 'object' && p !== null) {
            if (p.isKeyField) keyCount++;
            if (p.isSensitive) sensitiveCount++;
          }
        });

        return (
          <div className="flex flex-col gap-0.5" style={{ lineHeight: '1.2' }}>
            <span className="text-xs text-gray-700 dark:text-gray-300">
              {params.length} field{params.length !== 1 ? 's' : ''}
            </span>
            {keyCount > 0 && (
              <span className="text-xs text-blue-500">
                {keyCount} key{keyCount !== 1 ? 's' : ''}
              </span>
            )}
            {sensitiveCount > 0 && (
              <span className="text-xs text-red-500">
                {sensitiveCount} sensitive
              </span>
            )}
          </div>
        );
      },
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      body: (rowData: LogMaster & { id: string }) => (
        <div className="flex justify-center">
          <button
            onClick={() => { setSelectedMaster(rowData); setDrawerOpen(true); }}
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
    <>
      <Tooltip target="[data-pr-tooltip]" />
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 mb-2" style={{ padding: '0.625rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Input
              name="search"
              placeholder="Search by event code..."
              value={searchText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
              data-testid="MasterLogTab.Search"
              style={{ minWidth: '200px', width: '200px' }}
            />
            <Dropdown
              value={selectedLayer}
              options={LAYER_OPTIONS}
              onChange={(e: { value: string }) => setSelectedLayer(e.value || '')}
              placeholder="All Layers"
              style={{ width: '160px' }}
              data-testid="MasterLogTab.Filter.Layer"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="text-xs text-gray-500">{totalRecords} {totalRecords === 1 ? 'record' : 'records'}</span>
            <ExportButton
              fetchData={fetchExportData}
              columns={exportColumns}
              filename="log-masters"
              testId="MasterLogTab.Button.Export"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        <DataTable
          data={data}
          columns={columns}
          loading={loading}
          emptyMessage="No log masters found"
          dataKey="id"
          paginator
          lazy
          first={first}
          rows={pageSize}
          totalRecords={totalRecords}
          onPage={handlePageChange}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </div>

      <MasterDetailDrawer
        open={drawerOpen}
        master={selectedMaster}
        onClose={() => { setDrawerOpen(false); setSelectedMaster(null); }}
      />
    </>
  );
};

// --- log-transaction-list.tsx ---
/**
 * Audit Log Dashboard
 * Full-featured dashboard with Overview and Activity Log tabs.
 */



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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-all ${autoRefresh
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
      <LogTransactionView
        open={drawerOpen}
        log={selectedLog}
        templates={allTemplates}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLog(null);
        }}
      />
    </div>
  );
};

export default LogTransactionList;
