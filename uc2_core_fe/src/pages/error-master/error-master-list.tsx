/**
 * Error Master List Page
 * Card-based view for managing error definitions, severity levels, and localized messages
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { Skeleton } from 'primereact/skeleton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { errorMasterService } from '../../services/error-master.service';
import { valueSetsService } from '../../services/value-sets.service';
import { extractErrorMessage } from '../../utils/error-handler';
import type { ErrorMaster, ErrorMasterSearchParams } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

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

// Source type icon helper
const getSourceTypeIcon = (type: string): string => {
  switch (type?.toUpperCase()) {
    case 'API': return 'pi pi-server';
    case 'SCREEN': return 'pi pi-desktop';
    case 'FUNCTION': return 'pi pi-code';
    default: return 'pi pi-box';
  }
};

const ErrorMasterList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'errorMaster',
    basePath: '/error-master',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.ERROR_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.ERROR_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.ERROR_MASTER);
  const [errorMasters, setErrorMasters] = useState<ErrorMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Card expand state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter panel visibility
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [errorSeverityFilter, setErrorSeverityFilter] = useState<string>('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Pagination states
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Debounce search text
  const debouncedSearchFilter = useDebounce(searchFilter, 500);

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Fetch value-sets for dropdowns
  const { data: errorSeverityItems = [] } = useQuery({
    queryKey: ['value-sets', 'errorSeverity'],
    queryFn: () => valueSetsService.getItems('errorSeverity', 'en'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: sourceTypeItems = [] } = useQuery({
    queryKey: ['value-sets', 'sourceType'],
    queryFn: () => valueSetsService.getItems('sourceType', 'en'),
    staleTime: 5 * 60 * 1000,
  });

  const fetchErrorMasters = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);
      const params: ErrorMasterSearchParams = {
        page,
        pageSize: size,
      };

      if (debouncedSearchFilter) params.q = debouncedSearchFilter;
      if (errorSeverityFilter) params.errorSeverity = errorSeverityFilter;
      if (sourceTypeFilter) (params as any).sourceType = sourceTypeFilter;
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await errorMasterService.getAll(params);
      const mappedData = (response.data || []).map((em) => ({ ...em, id: em.id || em._id }));
      setErrorMasters(mappedData);
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? response.total ?? 0;
      setTotalRecords(total);
    } catch (error) {
      console.error('Failed to fetch error masters:', error);
      showError(extractErrorMessage(error, 'Failed to load error masters'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchFilter, errorSeverityFilter, sourceTypeFilter, pageSize, sortField, sortOrder, showError]);

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchErrorMasters(1, pageSize);
  }, [debouncedSearchFilter, errorSeverityFilter, sourceTypeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => navigateToView(String(id));
  const handleEdit = (id: string | number) => navigateToEdit(String(id));

  const handleDeleteClick = (id: string | number) => {
    setSelectedErrorId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedErrorId) return;
    try {
      setDeleteLoading(true);
      await errorMasterService.delete(selectedErrorId);
      setDeleteDialogOpen(false);
      setSelectedErrorId(null);
      fetchErrorMasters(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (error: any) {
      console.error('Failed to delete error master:', error);
      setDeleteDialogOpen(false);
      setSelectedErrorId(null);
      showError(extractErrorMessage(error, 'Failed to delete error master'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedErrorId(null);
  };

  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'success' | 'secondary' => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return 'danger';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'success';
      default: return 'secondary';
    }
  };

  const severityOptions = [
    { label: 'All Severities', value: '' },
    ...errorSeverityItems.map((item) => ({ label: item.label, value: item.code })),
  ];

  const sourceTypeOptions = [
    { label: 'All Source Types', value: '' },
    ...sourceTypeItems.map((item) => ({ label: item.label, value: item.code })),
  ];

  const fetchExportBlob = useCallback(() => errorMasterService.export(), []);

  const clearFilters = () => {
    setSearchFilter('');
    setErrorSeverityFilter('');
    setSourceTypeFilter('');
  };

  const hasActiveFilters = searchFilter || errorSeverityFilter || sourceTypeFilter;

  // Fetch all records for summary stats — re-fetches when filters change
  const [allRecords, setAllRecords] = useState<ErrorMaster[]>([]);
  const [allRecordsLoaded, setAllRecordsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const fetchAllForStats = async () => {
      try {
        const params: any = { page: 1, pageSize: 5000 };
        if (debouncedSearchFilter) params.q = debouncedSearchFilter;
        if (errorSeverityFilter) params.errorSeverity = errorSeverityFilter;
        if (sourceTypeFilter) params.sourceType = sourceTypeFilter;

        const response = await errorMasterService.getAll(params);
        if (!cancelled) {
          setAllRecords((response.data || []) as ErrorMaster[]);
          setAllRecordsLoaded(true);
        }
      } catch {
        if (!cancelled) setAllRecordsLoaded(true);
      }
    };
    fetchAllForStats();
    return () => { cancelled = true; };
  }, [debouncedSearchFilter, errorSeverityFilter, sourceTypeFilter]);

  // Summary stats computed from all filtered records
  const summaryStats = useMemo(() => {
    const source = allRecordsLoaded ? allRecords : errorMasters;
    const severityCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const sourceTypeCounts: Record<string, number> = {};
    let activeCount = 0;

    source.forEach((em) => {
      const sev = (em.errorSeverity || '').toUpperCase();
      if (sev) severityCounts[sev] = (severityCounts[sev] || 0) + 1;
      const type = (em as any).errorType || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      const st = ((em as any).sourceType || '').toUpperCase();
      if (st) sourceTypeCounts[st] = (sourceTypeCounts[st] || 0) + 1;
      if (!(em as any).isDelete && !em.isDeleted) activeCount++;
    });

    return { severityCounts, typeCounts, sourceTypeCounts, activeCount };
  }, [allRecords, allRecordsLoaded, errorMasters]);

  // Pagination
  const totalPages = Math.ceil(totalRecords / pageSize);
  const currentPage = Math.floor(first / pageSize) + 1;
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;

  const handlePrevPage = () => {
    if (hasPrevPage) {
      const newPage = currentPage - 1;
      setFirst((newPage - 1) * pageSize);
      fetchErrorMasters(newPage, pageSize, sortField, sortOrder);
    }
  };

  const handleNextPage = () => {
    if (hasNextPage) {
      const newPage = currentPage + 1;
      setFirst((newPage - 1) * pageSize);
      fetchErrorMasters(newPage, pageSize, sortField, sortOrder);
    }
  };

  const handleRowsChange = (rows: number) => {
    setFirst(0);
    setPageSize(rows);
    fetchErrorMasters(1, rows, sortField, sortOrder);
  };

  // Loading skeleton
  if (loading && errorMasters.length === 0) {
    return (
      <PermissionGuard jobName={JOB_NAMES.ERROR_MASTER}>
        <div className="py-2 px-3">
          <div className="flex items-center justify-between mb-4">
            <Skeleton width="280px" height="32px" />
            <div className="flex gap-2">
              <Skeleton width="90px" height="32px" />
              <Skeleton width="32px" height="32px" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[1, 2, 3, 4].map((i) => (<Skeleton key={i} height="80px" />))}
          </div>
          {[1, 2, 3].map((i) => (<Skeleton key={i} height="70px" className="mb-3" />))}
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.ERROR_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className="py-2 px-3" data-testid="SCR-ErrorMaster-List">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-sky-500">
              Error Master Management
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Manage error definitions, severity levels, and localized messages
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1">
              {totalRecords} {totalRecords === 1 ? 'definition' : 'definitions'}
            </span>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="Toggle Filters"
            >
              <i className="pi pi-filter text-gray-500 dark:text-gray-400" style={{ fontSize: '0.875rem' }} />
            </button>
            <ExportDataButton fetchBlob={fetchExportBlob} filename="error-masters-export.xlsx" testId="ErrorMasterList.Button.Export" />
            <RefreshButton onClick={() => fetchErrorMasters(currentPage, pageSize, sortField, sortOrder)} loading={loading} testId="ErrorMasterList.Button.Refresh" />
            {canCreate && (
              <Button label="Create Error" icon="pi pi-plus" onClick={() => navigateToCreate()} testId="ErrorMasterList.Button.Create" size="small" />
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '0.625rem' }}>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Definitions</p>
            <p className="text-2xl font-black" style={{ color: '#7c3aed' }}>{totalRecords}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Active</p>
            <p className="text-2xl font-black" style={{ color: '#059669' }}>{summaryStats.activeCount}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Critical</p>
            <p className="text-2xl font-black" style={{ color: '#dc2626' }}>{summaryStats.severityCounts['CRITICAL'] || 0}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">High Severity</p>
            <p className="text-2xl font-black" style={{ color: '#ea580c' }}>{summaryStats.severityCounts['HIGH'] || 0}</p>
          </div>
        </div>

        {/* Breakdown Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }}>
          {/* By Severity */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By Severity</h4>
            {Object.keys(summaryStats.severityCounts).length > 0 ? (
              ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].filter((sev) => summaryStats.severityCounts[sev]).map((sev) => (
                <div key={sev} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <span className="text-xs text-gray-600 dark:text-gray-300">{sev}</span>
                  <Tag value={String(summaryStats.severityCounts[sev])} severity={getSeverityColor(sev)} className="text-xs font-bold" />
                </div>
              ))
            ) : (<p className="text-xs text-gray-400">No data</p>)}
          </div>

          {/* By Error Type */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By Error Type</h4>
            {Object.keys(summaryStats.typeCounts).length > 0 ? (
              Object.entries(summaryStats.typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <span className="text-xs text-gray-600 dark:text-gray-300">{type}</span>
                  <Tag value={String(count)} className="text-xs" />
                </div>
              ))
            ) : (<p className="text-xs text-gray-400">No data</p>)}
          </div>

          {/* By Source Type */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">By Source Type</h4>
            {Object.keys(summaryStats.sourceTypeCounts).length > 0 ? (
              Object.entries(summaryStats.sourceTypeCounts).sort((a, b) => b[1] - a[1]).map(([st, count]) => (
                <div key={st} className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                  <div className="flex items-center gap-1.5">
                    <i className={`${getSourceTypeIcon(st)} text-gray-400`} style={{ fontSize: '0.625rem' }} />
                    <span className="text-xs text-gray-600 dark:text-gray-300">{st}</span>
                  </div>
                  <Tag value={String(count)} className="text-xs" />
                </div>
              ))
            ) : (<p className="text-xs text-gray-400">No data</p>)}
          </div>
        </div>

        {/* Filters (Collapsible) */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-2 shadow-sm" style={{ padding: '0.625rem 0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '160px' }}>
                <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Search</label>
                <Input name="search" placeholder="Search errors..." value={searchFilter} onChange={(value: string) => setSearchFilter(value)} testId="ErrorMasterList.Filter.Search" clearable className="w-full" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '150px' }}>
                <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Source Type</label>
                <Dropdown value={sourceTypeFilter} options={sourceTypeOptions} onChange={(e: { value: string }) => setSourceTypeFilter(e.value || '')} placeholder="Source Type" className="w-full" data-testid="ErrorMasterList.Filter.SourceType" resetFilterOnHide={true} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '150px' }}>
                <label style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#6b7280', textTransform: 'uppercase' }}>Severity</label>
                <Dropdown value={errorSeverityFilter} options={severityOptions} onChange={(e: { value: string }) => setErrorSeverityFilter(e.value || '')} placeholder="Severity" className="w-full" data-testid="ErrorMasterList.Filter.ErrorSeverity" resetFilterOnHide={true} />
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-transparent">
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden mb-2">
            <div className="h-full bg-indigo-500 rounded animate-pulse" style={{ width: '60%' }} />
          </div>
        )}

        {/* Error Master Cards */}
        <div className="flex flex-col gap-2.5">
          {errorMasters.map((em) => {
            const cardId = em.id || em._id;
            const isExpanded = expandedId === cardId;
            const sev = (em.errorSeverity || '').toUpperCase();
            const isDeleted = (em as any).isDelete || em.isDeleted;

            return (
              <div key={cardId} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm transition-all" style={{ border: `1px solid ${isExpanded ? '#4f46e5' : '#e5e7eb'}`, borderLeft: `4px solid ${severityColor[sev] || '#94a3b8'}`, opacity: isDeleted ? 0.6 : 1 }}>
                <div style={{ padding: isExpanded ? '0.875rem 1rem 0.5rem' : '0.875rem 1rem' }}>
                  {/* Main row */}
                  <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : cardId)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">{em.errorCode}</p>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {(em as any).errorType && (
                          <span className="inline-flex items-center text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#f1f5f9', color: '#334155', fontWeight: 500 }}>{(em as any).errorType}</span>
                        )}
                        <Tag value={sev || 'N/A'} severity={getSeverityColor(sev)} style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem' }} />
                        {(em as any).sourceType && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-500">
                            <i className={getSourceTypeIcon((em as any).sourceType)} style={{ fontSize: '0.5rem' }} />
                            {(em as any).sourceType}
                          </span>
                        )}
                        {(em as any).sourceName && (
                          <span className="inline-flex items-center text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-500">{(em as any).sourceName}</span>
                        )}
                        <Tag value={em.isActive ? 'Active' : 'Inactive'} severity={em.isActive ? 'success' : 'secondary'} style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem' }} />
                        {(em as any).appCode && (
                          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap font-mono">{(em as any).appCode}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions + Expand */}
                    <div className="flex items-center gap-1 ml-2">
                      {!isDeleted && (
                        <>
                          <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors bg-transparent border-none cursor-pointer" onClick={(e) => { e.stopPropagation(); handleView(cardId); }} data-testid="ErrorMasterList.Action.View" data-pr-tooltip="View">
                            <i className="pi pi-eye text-green-600 dark:text-green-400" style={{ fontSize: '0.875rem' }} />
                          </button>
                          {canUpdate && (
                            <button className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors bg-transparent border-none cursor-pointer" onClick={(e) => { e.stopPropagation(); handleEdit(cardId); }} data-testid="ErrorMasterList.Action.Edit" data-pr-tooltip="Edit">
                              <i className="pi pi-pencil text-blue-600" style={{ fontSize: '0.875rem' }} />
                            </button>
                          )}
                          {canDelete && (
                            <button className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors bg-transparent border-none cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDeleteClick(cardId); }} data-testid="ErrorMasterList.Action.Delete" data-pr-tooltip="Delete">
                              <i className="pi pi-trash text-red-600" style={{ fontSize: '0.875rem' }} />
                            </button>
                          )}
                        </>
                      )}
                      <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer">
                        <i className={`pi ${isExpanded ? 'pi-chevron-up' : 'pi-chevron-down'}`} style={{ fontSize: '0.875rem' }} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      {/* Messages block */}
                      {em.messages && em.messages.length > 0 && (
                        <div className="rounded-md p-3 mb-3" style={{ backgroundColor: severityBg[sev] || '#f8fafc', borderLeft: `3px solid ${severityColor[sev] || '#94a3b8'}` }}>
                          <p className="text-xs font-semibold mb-2" style={{ color: severityColor[sev] || '#64748b' }}>Localized Messages</p>
                          {em.messages.map((msg, i) => (
                            <div key={i} className="mb-1.5 last:mb-0">
                              <span className="inline-block text-xs font-bold text-gray-500 uppercase mr-2 bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded">{msg.language}</span>
                              <span className="text-sm text-gray-700 dark:text-gray-300">{msg.template}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Details grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                        <DetailRow label="Error Code" value={em.errorCode} />
                        <DetailRow label="Error Type" value={(em as any).errorType || '-'} />
                        <DetailRow label="Severity" value={em.errorSeverity || '-'} />
                        <DetailRow label="Source Type" value={(em as any).sourceType || '-'} />
                        <DetailRow label="Source Name" value={(em as any).sourceName || '-'} />
                        <DetailRow label="App Code" value={(em as any).appCode || '-'} />
                        <DetailRow label="Business Area" value={em.businessArea || '-'} />
                        <DetailRow label="Technical Area" value={em.technicalArea || '-'} />
                        <DetailRow label="Tool" value={em.tool || '-'} />
                        <DetailRow label="Partner System" value={em.partnerSystem || '-'} />
                        <DetailRow label="Third Party" value={em.thirdParty || '-'} />
                        <DetailRow label="Logging" value={em.log ? 'Enabled' : 'Disabled'} />
                      </div>

                      {/* Developer details */}
                      {(em.devMessage || em.helpLink || em.videoLink) && (
                        <details className="mb-2">
                          <summary className="cursor-pointer text-xs text-gray-500 font-medium hover:text-gray-700 dark:hover:text-gray-300">Developer Information</summary>
                          <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                            {em.devMessage && <DetailRow label="Developer Message" value={em.devMessage} />}
                            {em.helpLink && (
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Help Link</p>
                                <a href={em.helpLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 break-all" onClick={(e) => e.stopPropagation()}>
                                  {em.helpLink} <i className="pi pi-external-link" style={{ fontSize: '0.75rem' }} />
                                </a>
                              </div>
                            )}
                            {em.videoLink && (
                              <div>
                                <p className="text-xs text-gray-400 mb-0.5">Video Link</p>
                                <a href={em.videoLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 break-all" onClick={(e) => e.stopPropagation()}>
                                  {em.videoLink} <i className="pi pi-external-link" style={{ fontSize: '0.75rem' }} />
                                </a>
                              </div>
                            )}
                          </div>
                        </details>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                        <button className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-transparent border-none cursor-pointer flex items-center gap-1" onClick={(e) => { e.stopPropagation(); handleView(cardId); }}>
                          <i className="pi pi-eye" style={{ fontSize: '0.75rem' }} /> View Full Details
                        </button>
                        <span className="text-xs text-gray-400">
                          {em.createdAt ? `Created: ${new Date(em.createdAt).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {!loading && errorMasters.length === 0 && (
            <div className="text-center py-12 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
              <i className="pi pi-exclamation-triangle text-gray-300 mb-2" style={{ fontSize: '2rem' }} />
              <p className="text-sm text-gray-400">No error masters found.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalRecords > 0 && (
          <div className="flex items-center justify-between mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Rows per page:</span>
              <select value={pageSize} onChange={(e) => handleRowsChange(Number(e.target.value))} className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-transparent text-gray-700 dark:text-gray-300 cursor-pointer">
                {[5, 10, 25, 50].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Page {currentPage} of {totalPages} ({totalRecords} items)</span>
              <div className="flex gap-1">
                <button onClick={handlePrevPage} disabled={!hasPrevPage} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <i className="pi pi-chevron-left" style={{ fontSize: '0.75rem' }} />
                </button>
                <button onClick={handleNextPage} disabled={!hasNextPage} className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <i className="pi pi-chevron-right" style={{ fontSize: '0.75rem' }} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Tooltip target="[data-pr-tooltip]" />
      <DeleteConfirmDialog visible={deleteDialogOpen} onCancel={handleDeleteCancel} onDelete={handleDeleteConfirm} message="Are you sure you want to delete this error master? This action cannot be undone if the error is not referenced in any logs." testId="ErrorMasterList.Dialog.Delete" loading={deleteLoading} />
    </PermissionGuard>
  );
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium break-all">{value}</p>
    </div>
  );
}

export default ErrorMasterList;
