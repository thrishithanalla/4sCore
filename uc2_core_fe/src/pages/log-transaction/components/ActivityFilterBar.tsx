import { useMemo } from 'react';
import { Calendar } from 'primereact/calendar';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Tooltip } from 'mainFe/Tooltip';
import type { AuditDashboardFilters, UserOption, LogTemplate } from '../../../types/log-transaction.types';

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
  const userOptions = [
    { label: 'All Users', value: '' },
    ...allUsers.map((u) => ({ label: u.name, value: u.actorId })),
  ];

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
      if (t.keyFields) {
        t.keyFields.split(',').forEach((k) => {
          const trimmed = k.trim();
          if (trimmed) keySet.add(trimmed);
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
            <Dropdown
              value={filters.actorId ?? ''}
              options={userOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e: { value: string }) => onFilterChange('actorId', e.value)}
              placeholder="All Users"
              className="w-full"
              data-testid="AuditDashboard.Filter.User"
              resetFilterOnHide={true}
              filter
              virtualScrollerOptions={{ itemSize: 38 }}
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
              icon="pi pi-search"
              className="w-full"
              testId="AuditDashboard.Filter.Search"
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
                icon="pi pi-search"
                className="w-full"
                testId="AuditDashboard.Filter.ParamValue"
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

export default ActivityFilterBar;
