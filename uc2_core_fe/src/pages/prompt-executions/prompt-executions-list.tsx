import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { Dropdown } from 'mainFe/Dropdown';
import { StatCard } from 'mainFe/StatCard';
import { Dialog } from 'mainFe/Dialog';
import { ProgressBar } from 'mainFe/ProgressBar';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { formatTimestamp } from 'mainFe/dateUtils';

import PromptExecutionDetailDrawer from './prompt-execution-detail-drawer';

import { promptExecutionsService } from '../../services/prompt-executions.service';
import type {
  PromptExecutionRecentCall,
  PromptExecutionDashboardResponse,
  PromptExecutionDashboardParams,
  ModelStats,
  UseCaseStats,
} from '../../types/prompt-execution.types';
import {
  TIME_RANGE_OPTIONS,
  getModelColors,
  getStatusSeverity,
  getAccuracyColor,
  formatTokenCount,
  formatCurrency,
  formatResponseTime,
} from '../../types/prompt-execution.types';

const PromptExecutionsList = () => {
  // Dashboard state
  const [dashboard, setDashboard] = useState<PromptExecutionDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Recent calls state
  const [recentCalls, setRecentCalls] = useState<PromptExecutionRecentCall[]>([]);
  const [recentCallsLoading, setRecentCallsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting state for server-side sorting
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Filter state
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedUseCase, setSelectedUseCase] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // LLM Model options from API
  const [llmModelOptions, setLlmModelOptions] = useState<{ label: string; value: string }[]>([
    { label: 'All Models', value: '' },
  ]);

  // Prompt type options - populated from initial unfiltered dashboard response
  const [promptTypeOptions, setPromptTypeOptions] = useState<{ label: string; value: string }[]>([
    { label: 'All Prompt Types', value: '' },
  ]);

  // Module type options - populated from dashboard list response
  const [moduleOptions, setModuleOptions] = useState<{ label: string; value: string }[]>([
    { label: 'All Modules', value: '' },
  ]);
  // Flag to track if we've already populated the prompt type options
  const [promptTypeOptionsLoaded, setPromptTypeOptionsLoaded] = useState(false);

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => promptExecutionsService.export(), []);

  // Modal state
  const [selectedExecution, setSelectedExecution] = useState<PromptExecutionRecentCall | null>(null);
  const [detailsDialogVisible, setDetailsDialogVisible] = useState(false);
  const [useCaseAnalyticsVisible, setUseCaseAnalyticsVisible] = useState(false);

  // Fetch dashboard data (includes recent calls for table)
  const fetchDashboard = useCallback(async () => {
    try {
      setDashboardLoading(true);
      setRecentCallsLoading(true);

      const params: PromptExecutionDashboardParams = {
        timeRange,
        llmModel: selectedModel || undefined,
        useCase: selectedUseCase || undefined,
        page,
        pageSize,
        sort_by: sortField || undefined,
        sort_order: sortField ? (sortOrder === 1 ? 'asc' : 'desc') : undefined,
      };

      const response = await promptExecutionsService.getDashboard(params);
      setDashboard(response);
      // Set list data from dashboard response for DataTable
      setRecentCalls(response.list || []);
      // Handle both direct totalCount and nested pagination object
      const total = response.totalCount
        ?? response.pagination?.totalCount
        ?? response.pagination?.totalItems
        ?? response.pagination?.total
        ?? (response.list?.length || 0);
      setTotalCount(total);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
      setRecentCalls([]);
    } finally {
      setDashboardLoading(false);
      setRecentCallsLoading(false);
    }
  }, [timeRange, selectedModel, selectedUseCase, page, pageSize, sortField, sortOrder]);

  // Initial fetch
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch filter options from unfiltered dashboard API (LLM Models and Prompt Types)
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const dashboardResponse = await promptExecutionsService.getDashboard({
          timeRange: '7d', // Use longer time range to get all options
        });

        // Set LLM Model options from byModel
        if (dashboardResponse?.byModel?.length) {
          const modelOptions = [
            { label: 'All Models', value: '' },
            ...dashboardResponse.byModel.map((model: any) => ({
              label: model.model,
              value: model.model,
            })),
          ];
          setLlmModelOptions(modelOptions);
        }

        // Set Prompt Type options from byUseCase
        if (dashboardResponse?.byUseCase?.length) {
          const typeOptions = [
            { label: 'All Prompt Types', value: '' },
            ...dashboardResponse.byUseCase.map((uc: any) => ({
              label: uc.useCase,
              value: uc.useCase,
            })),
          ];
          setPromptTypeOptions(typeOptions);
        }

        // Set Module options from list (unique moduleId/moduleName pairs)
        if (dashboardResponse?.list?.length) {
          const moduleMap = new Map<string, string>();
          dashboardResponse.list.forEach((item: any) => {
            if (item.moduleId && item.moduleName && !moduleMap.has(item.moduleId)) {
              moduleMap.set(item.moduleId, item.moduleName);
            }
          });
          const moduleOpts = [
            { label: 'All Modules', value: '' },
            ...Array.from(moduleMap.entries()).map(([id, name]) => ({
              label: name,
              value: id,
            })),
          ];
          setModuleOptions(moduleOpts);
        }
        setPromptTypeOptionsLoaded(true);
      } catch (error) {
        console.error('Failed to fetch filter options from dashboard:', error);
        setPromptTypeOptionsLoaded(true);
      }
    };
    fetchFilterOptions();
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchDashboard();
    }, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboard]);

  // Filter rows based on selected module and ensure unique keys
  const filteredRows = useMemo(() => {
    // Map to ensure each row has a unique _id
    let rowsWithKeys = recentCalls.map((row, index) => ({
      ...row,
      _id: row._id || row.id || `row-${index}`,
    }));

    // Filter by selected module (client-side filtering)
    if (selectedModule) {
      rowsWithKeys = rowsWithKeys.filter((row: any) => row.moduleId === selectedModule);
    }

    return rowsWithKeys;
  }, [recentCalls, selectedModule]);


  // Handle sort change - server-side sorting
  const handleSort = (event: any) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder as 1 | -1 | null);
    setPage(1); // Reset to first page on sort
  };

  // Handle view details
  const handleViewDetails = async (execution: PromptExecutionRecentCall) => {
    try {
      const fullDetails = await promptExecutionsService.getById(execution._id);
      setSelectedExecution({ ...execution, ...fullDetails });
      setDetailsDialogVisible(true);
    } catch (error) {
      console.error('Failed to fetch execution details:', error);
      setSelectedExecution(execution);
      setDetailsDialogVisible(true);
    }
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      timeRange !== '24h' ||
      selectedModel !== '' ||
      selectedUseCase !== '' ||
      selectedModule !== ''
    );
  }, [timeRange, selectedModel, selectedUseCase, selectedModule]);

  // Clear all filters
  const handleClearFilters = () => {
    setTimeRange('24h');
    setSelectedModel('');
    setSelectedUseCase('');
    setSelectedModule('');
  };

  // Get model color classes
  const getModelBadgeClass = (model: string) => {
    const colors = getModelColors(model);
    return `${colors.bg} ${colors.text}`;
  };

  // Table columns
  const columns: DataTableColumn<PromptExecutionRecentCall>[] = useMemo(
    () => [
      {
        field: 'timestamp',
        header: 'Timestamp',
        sortable: true,
        body: (rowData: PromptExecutionRecentCall) => (
          <span className="font-mono text-sm">
            {formatTimestamp(rowData.timestamp)}
          </span>
        ),
      },
      {
        field: 'model',
        header: 'Model',
        sortable: true,
        body: (rowData: PromptExecutionRecentCall) => (
          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getModelBadgeClass(rowData.model)}`}>
            {rowData.model}
          </span>
        ),
      },
      {
        field: 'useCase',
        header: 'Use Case',
        sortable: true,
      },
      {
        field: 'tokens',
        header: 'Tokens',
        sortable: true,
        body: (rowData: PromptExecutionRecentCall) => (
          <div className="text-sm">
            <p className="font-mono font-medium">{formatTokenCount(rowData.tokens)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {rowData.inputTokens}+{rowData.outputTokens}
            </p>
          </div>
        ),
      },
      {
        field: 'cost',
        header: 'Cost',
        sortable: true,
        body: (rowData: PromptExecutionRecentCall) => (
          <span className="font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(rowData.cost)}
          </span>
        ),
      },
      {
        field: 'responseTime',
        header: 'Time',
        sortable: true,
        body: (rowData: PromptExecutionRecentCall) => formatResponseTime(rowData.responseTime),
      },
      {
        field: 'status',
        header: 'Status',
        sortable: true,
        body: (rowData: PromptExecutionRecentCall) => (
          <Tag value={rowData.status} severity={getStatusSeverity(rowData.status)} />
        ),
      },
      {
        field: 'actions',
        header: 'Actions',
      headerStyle: { textAlign: 'center' },
        sortable: false,
        body: (rowData: PromptExecutionRecentCall) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 cursor-pointer"
              style={{ background: 'none', border: 'none', outline: 'none' }}
              onClick={() => handleViewDetails(rowData)}
              data-testid="PromptExecutions.Action.View"
              data-pr-tooltip="View Details"
            >
              <i className="pi pi-eye text-blue-600 hover:text-blue-800" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target="[data-pr-tooltip]" />
          </div>
        ),
      },
    ],
    []
  );

  // Render model stats cards
  const renderModelCards = () => {
    if (!dashboard?.byModel?.length) return null;

    const modelCardVariants: Record<string, 'green' | 'blue' | 'purple' | 'orange'> = {
      'gpt-4': 'green',
      'GPT-4': 'green',
      'claude-3': 'blue',
      'Claude-3': 'blue',
      'gemini-pro': 'purple',
      'Gemini-Pro': 'purple',
      'llama-2': 'orange',
      'Llama-2': 'orange',
    };

    return dashboard.byModel.map((model: ModelStats, index: number) => {
      const colors = getModelColors(model.model);
      const variant = modelCardVariants[model.model] || 'blue';

      return (
        <div
          key={model.model}
          className={`bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border-l-4 ${colors.border} cursor-pointer hover:shadow-md transition-shadow`}
          style={{ flex: '1 1 calc(20% - 0.5rem)', minWidth: '160px', maxWidth: '19%' }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className={`p-2 rounded-md ${colors.bg} flex-shrink-0`}>
              <i className={`pi pi-microchip ${colors.text}`} style={{ fontSize: '1.125rem' }} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{model.model}</h3>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Calls:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{(model.calls ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Tokens:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatTokenCount(model.tokens)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Cost:</span>
              <span className="font-semibold text-green-600">{formatCurrency(model.cost)}</span>
            </div>
            {model.avgAccuracy && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Accuracy:</span>
                <span className={`font-semibold ${getAccuracyColor(model.avgAccuracy)}`}>
                  {model.avgAccuracy?.toFixed(1) ?? '-'}%
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Avg Time:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatResponseTime(model.avgResponseTime)}</span>
            </div>
          </div>
        </div>
      );
    });
  };

  // Render use case distribution
  // Render Prompt Type Distribution with colors
  const renderPromptTypeDistribution = () => {
    if (!dashboard?.byUseCase?.length) return null;

    // Calculate total calls for percentage
    const totalCalls = dashboard.byUseCase.reduce((sum, uc) => sum + (uc.calls ?? 0), 0);

    // Gradient color palette for prompt types (similar to trends graph)
    const promptTypeGradients = [
      { gradient: 'bg-gradient-to-r from-blue-600 to-cyan-400', dot: 'bg-gradient-to-r from-blue-600 to-cyan-400' },
      { gradient: 'bg-gradient-to-r from-purple-600 to-pink-500', dot: 'bg-gradient-to-r from-purple-600 to-pink-500' },
      { gradient: 'bg-gradient-to-r from-green-600 to-emerald-400', dot: 'bg-gradient-to-r from-green-600 to-emerald-400' },
      { gradient: 'bg-gradient-to-r from-orange-500 to-amber-400', dot: 'bg-gradient-to-r from-orange-500 to-amber-400' },
      { gradient: 'bg-gradient-to-r from-pink-500 to-rose-400', dot: 'bg-gradient-to-r from-pink-500 to-rose-400' },
      { gradient: 'bg-gradient-to-r from-indigo-600 to-violet-400', dot: 'bg-gradient-to-r from-indigo-600 to-violet-400' },
      { gradient: 'bg-gradient-to-r from-teal-500 to-cyan-400', dot: 'bg-gradient-to-r from-teal-500 to-cyan-400' },
      { gradient: 'bg-gradient-to-r from-red-500 to-orange-400', dot: 'bg-gradient-to-r from-red-500 to-orange-400' },
    ];

    return dashboard.byUseCase.slice(0, 5).map((useCase: UseCaseStats, index: number) => {
      const callsPercentage = totalCalls > 0 ? ((useCase.calls ?? 0) / totalCalls) * 100 : 0;
      const colors = promptTypeGradients[index % promptTypeGradients.length];

      return (
        <div key={useCase.useCase} className="cursor-pointer hover:opacity-80">
          <div className="flex justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 ${colors.dot} rounded`} />
              <span className="font-medium text-gray-900 dark:text-white">{useCase.useCase}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{(useCase.calls ?? 0).toLocaleString()} calls</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">({callsPercentage.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`${colors.gradient} h-2 rounded-full transition-all duration-300`}
              style={{ width: `${callsPercentage}%` }}
            />
          </div>
        </div>
      );
    });
  };

  return (
    <div className="py-2 px-3" data-testid="SCR-Prompt-Executions-List">
      {/* Header */}
      <div className="mb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-md bg-purple-600 flex items-center justify-center">
                <i className="pi pi-microchip" style={{ fontSize: '0.875rem', color: 'white' }} />
              </div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white">AI Prompts Monitor</h1>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 ml-9">
              Track LLM usage, performance, costs, and accuracy across all AI calls
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
              data-testid="PromptExecutions.Button.AutoRefresh"
            >
              <i className={`pi pi-refresh ${autoRefresh ? 'pi-spin' : ''}`} style={{ fontSize: '0.75rem' }} />
              Live
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-3">
        <StatCard
          title="Total AI Calls"
          value={dashboard?.summary?.totalCalls?.toLocaleString() || '0'}
          subtitle={dashboardLoading ? 'Loading...' : undefined}
          variant="blue"
          icon={<i className="pi pi-microchip" />}
          trendIcon={<i className="pi pi-arrow-up" />}
          // @ts-ignore - horizontal prop added to StatCard
          horizontal
        />
        <StatCard
          title="Total Tokens"
          value={formatTokenCount(dashboard?.summary?.totalTokens || 0)}
          variant="green"
          icon={<i className="pi pi-bolt" />}
          trendIcon={<i className="pi pi-arrow-up" />}
          // @ts-ignore - horizontal prop added to StatCard
          horizontal
        />
        <StatCard
          title="Total Cost"
          value={formatCurrency(dashboard?.summary?.totalCost || 0)}
          variant="purple"
          icon={<i className="pi pi-dollar" />}
          trendIcon={<i className="pi pi-arrow-up" />}
          // @ts-ignore - horizontal prop added to StatCard
          horizontal
        />
        <StatCard
          title="Avg Response"
          value={formatResponseTime(dashboard?.summary?.avgResponseTime || 0)}
          variant="red"
          icon={<i className="pi pi-clock" />}
          onClick={() => setUseCaseAnalyticsVisible(true)}
          // @ts-ignore - horizontal prop added to StatCard
          horizontal
        />
      </div>

      {/* LLM Model Cards */}
      

      {/* Filters Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 mb-3" style={{ padding: '0.625rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Time Period</label>
            <Dropdown
              name="timeRange"
              value={timeRange}
              options={TIME_RANGE_OPTIONS}
              onChange={(e: { value: string }) => setTimeRange(e.value as typeof timeRange)}
              placeholder="Select time range"
              className="w-full"
              data-testid="PromptExecutions.Filter.TimeRange"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>LLM Model</label>
            <Dropdown
              name="llmModel"
              value={selectedModel}
              options={llmModelOptions}
              onChange={(e: { value: string }) => setSelectedModel(e.value)}
              placeholder="All Models"
              className="w-full"
              data-testid="PromptExecutions.Filter.Model"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Prompt Type</label>
            <Dropdown
              name="promptType"
              value={selectedUseCase}
              options={promptTypeOptions}
              onChange={(e: { value: string }) => setSelectedUseCase(e.value)}
              placeholder="All Prompt Types"
              className="w-full"
              data-testid="PromptExecutions.Filter.PromptType"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Module Type</label>
            <Dropdown
              name="moduleType"
              value={selectedModule}
              options={moduleOptions}
              onChange={(e: { value: string }) => setSelectedModule(e.value)}
              placeholder="All Modules"
              className="w-full"
              data-testid="PromptExecutions.Filter.ModuleType"
              resetFilterOnHide={true}
            />
          </div>
          {hasActiveFilters && (
            <div style={{ flexShrink: 0 }}>
              <button
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={handleClearFilters}
                data-testid="PromptExecutions.Button.ClearFilters"
                data-pr-tooltip="Clear Filters"
              >
                <i className="pi pi-filter-slash text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">{renderModelCards()}</div>

      {/* Charts Section */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Token Usage Trend */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 relative" style={{ overflow: 'visible' }}>
          <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">Token Usage Trend (Last 24 Hours)</h3>
          <div className="h-44 flex items-end gap-0.5 pb-4 relative" style={{ overflow: 'visible' }}>
            {(() => {
              // Create a map of hour -> trend data from response
              const trendMap: Record<number, any> = {};
              if (dashboard?.trends?.length) {
                dashboard.trends.forEach((t: any) => {
                  const h = typeof t.hour === 'number' ? t.hour : parseInt(t.hour, 10);
                  if (!isNaN(h)) trendMap[h] = t;
                });
              }

              // Find max tokens from actual data for scaling
              const maxTokens = Math.max(...Object.values(trendMap).map((t: any) => t.tokens || 0), 1);

              // Generate all 24 hours (0-23)
              return Array.from({ length: 24 }, (_, hour) => {
                const trend = trendMap[hour];
                const hasData = trend && trend.calls > 0;
                const tokens = trend?.tokens || 0;
                const tokenHeight = hasData ? Math.max((tokens / maxTokens) * 100, 10) : 0;

                // Color based on token volume - only for bars with data
                const getBarColor = () => {
                  if (!hasData) return 'bg-gray-200 dark:bg-gray-700';
                  const ratio = tokens / maxTokens;
                  if (ratio > 0.7) return 'bg-gradient-to-t from-purple-600 to-pink-500';
                  if (ratio > 0.4) return 'bg-gradient-to-t from-blue-600 to-purple-500';
                  if (ratio > 0.2) return 'bg-gradient-to-t from-blue-500 to-cyan-400';
                  return 'bg-gradient-to-t from-blue-400 to-blue-300';
                };

                // Show tooltip below for tall bars
                const ratio = tokens / maxTokens;
                const showTooltipBelow = ratio > 0.4;

                return (
                  <div
                    key={hour}
                    className="flex flex-col items-center group relative"
                    style={{ flex: '1 1 0', minWidth: 0 }}
                  >
                    {/* Tooltip on hover */}
                    <div className={`absolute ${showTooltipBelow ? 'top-full mt-6' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl border border-gray-700`} style={{ zIndex: 9999 }}>
                      <div className="font-bold text-blue-300 border-b border-gray-700 pb-1 mb-1">Hour: {hour}:00</div>
                      {hasData ? (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <span className="text-gray-400">Calls:</span>
                          <span className="font-semibold text-right">{trend.calls}</span>
                          <span className="text-gray-400">Tokens:</span>
                          <span className="font-semibold text-right">{formatTokenCount(trend.tokens)}</span>
                          <span className="text-gray-400">Input:</span>
                          <span className="font-semibold text-right text-cyan-400">{formatTokenCount(trend.inputTokens)}</span>
                          <span className="text-gray-400">Output:</span>
                          <span className="font-semibold text-right text-orange-400">{formatTokenCount(trend.outputTokens)}</span>
                          <span className="text-gray-400">Cost:</span>
                          <span className="font-semibold text-right text-green-400">{formatCurrency(trend.cost)}</span>
                        </div>
                      ) : (
                        <div className="text-gray-400">No activity</div>
                      )}
                    </div>
                    {/* Bar */}
                    <div className="flex flex-col items-center w-full">
                      <div
                        className={`w-full ${getBarColor()} rounded-t cursor-pointer hover:opacity-80 transition-all duration-200`}
                        style={{ height: hasData ? `${Math.min(tokenHeight * 1.3, 120)}px` : '6px', minHeight: '6px', maxHeight: '120px' }}
                      />
                    </div>
                    <span className="text-[7px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium">{hour}</span>
                  </div>
                );
              });
            })()}
          </div>
          {/* Legend */}
          <div className="flex justify-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gradient-to-t from-purple-600 to-pink-500 rounded" />
              <span>High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gradient-to-t from-blue-600 to-purple-500 rounded" />
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gradient-to-t from-blue-400 to-blue-300 rounded" />
              <span>Low</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded" />
              <span>None</span>
            </div>
          </div>
        </div>

        {/* Prompt Type Distribution */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">Prompt Type Distribution</h3>
          <div className="space-y-3">{renderPromptTypeDistribution()}</div>
        </div>
      </div>

      {/* Cost Analysis Section */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Cost per Model */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">Cost per Model</h3>
          <div className="space-y-3">
            {dashboard?.costByModel?.length ? (
              dashboard.costByModel.map((item) => {
                const modelColors: Record<string, string> = {
                  'gpt-4': 'bg-green-500',
                  'GPT-4': 'bg-green-500',
                  'gpt-4.1': 'bg-emerald-500',
                  'gpt-oss-120b': 'bg-blue-500',
                  'gpt-oss-120B': 'bg-blue-400',
                  'claude-3': 'bg-purple-500',
                  'Claude-3': 'bg-purple-500',
                  'gemini-pro': 'bg-orange-500',
                  'Gemini-Pro': 'bg-orange-500',
                  'llama-2': 'bg-red-500',
                  'Llama-2': 'bg-red-500',
                  'Unknown': 'bg-gray-500',
                };
                return (
                  <div key={item.model} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 ${modelColors[item.model] || 'bg-gray-500'} rounded`} />
                      <span className="text-sm text-gray-900 dark:text-white">{item.model}</span>
                      {item.percentage != null && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">({item.percentage.toFixed(1)}%)</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(item.cost)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">No cost data available</p>
            )}
          </div>
        </div>

        {/* Model Performance */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">Model Performance</h3>
          <div className="space-y-3">
            {dashboard?.modelPerformance?.length ? (
              dashboard.modelPerformance.map((perf) => (
                <div key={perf.model} className="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{perf.model}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{perf.totalCalls} calls</span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div className="text-center">
                      <p className="font-semibold text-blue-600">{formatResponseTime(perf.avgResponseTime)}</p>
                      <p className="text-gray-500 dark:text-gray-400">Avg Time</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-green-600">{formatTokenCount(perf.avgTokensPerCall)}</p>
                      <p className="text-gray-500 dark:text-gray-400">Tokens/Call</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-purple-600">{formatCurrency(perf.costPerToken * 1000)}/1K</p>
                      <p className="text-gray-500 dark:text-gray-400">Cost</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">No performance data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent AI Calls Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        {/* Toolbar / Filter Panel */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-gray-600 dark:text-gray-400">Monitoring active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {totalCount} {totalCount === 1 ? 'record' : 'records'}
              </span>
              <ExportDataButton
                fetchBlob={fetchExportBlob}
                filename="prompt-executions-export.xlsx"
                testId="PromptExecutions.Button.Export"
              />
            </div>
          </div>
        </div>

        <DataTable
          data={filteredRows}
          columns={columns}
          loading={recentCallsLoading}
          showSkeleton={recentCallsLoading}
          skeletonRows={10}
          emptyMessage="No AI calls found"
          dataKey="_id"
          stripedRows
          paginator
          rows={pageSize}
          rowsPerPageOptions={[5, 10, 25, 50]}
          totalRecords={totalCount}
          lazy
          first={(page - 1) * pageSize}
          onPage={(e: any) => {
            setPage(Math.floor(e.first / e.rows) + 1);
            setPageSize(e.rows);
          }}
          sortField={sortField || undefined}
          sortOrder={sortOrder || undefined}
          onSort={handleSort}
          removableSort
        />
      </div>

      {/* Execution Details Drawer */}
      <PromptExecutionDetailDrawer
        open={detailsDialogVisible}
        execution={selectedExecution}
        onClose={() => {
          setDetailsDialogVisible(false);
          setSelectedExecution(null);
        }}
      />

      {/* Use Case Analytics Dialog */}
      <Dialog
        visible={useCaseAnalyticsVisible}
        onHide={() => setUseCaseAnalyticsVisible(false)}
        header={
          <div className="flex items-center justify-between w-full pr-8">
            <span>Use Case Analytics</span>
            <Button label="Export" icon="pi pi-download" severity="info" size="small" />
          </div>
        }
        style={{ width: '80vw', maxWidth: '1000px' }}
        modal
        draggable={false}
      >
        <div className="p-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Detailed breakdown by investigation use case
          </p>

          {dashboard?.byUseCase && dashboard.byUseCase.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Use Case
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Calls
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Distribution
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Avg Accuracy
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {dashboard.byUseCase.map((useCase, idx) => (
                    <tr key={useCase.useCase} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white">{idx + 1}</td>
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{useCase.useCase}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{(useCase.calls ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900 dark:text-white">{useCase.percentage || 0}%</span>
                          <div className="w-20 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${useCase.percentage || 0}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-sm font-semibold ${useCase.avgAccuracy ? getAccuracyColor(useCase.avgAccuracy) : ''}`}>
                          {useCase.avgAccuracy ? `${useCase.avgAccuracy.toFixed(1)}%` : '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm font-semibold text-green-600">{formatCurrency(useCase.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">No use case data available</p>
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default PromptExecutionsList;
