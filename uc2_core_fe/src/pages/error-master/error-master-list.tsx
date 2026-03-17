/**
 * Error Master List Page
 * Table view with overview cards, matching log-master style
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { Dialog } from 'primereact/dialog';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

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
import styles from './error-master-list.module.css';

const ErrorMasterList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({ entity: 'errorMaster', basePath: '/error-master' });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.ERROR_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.ERROR_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.ERROR_MASTER);

  const [errorMasters, setErrorMasters] = useState<(ErrorMaster & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<ErrorMaster | null>(null);

  // Filters
  const [searchFilter, setSearchFilter] = useState('');
  const [errorSeverityFilter, setErrorSeverityFilter] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [errorTypeFilter, setErrorTypeFilter] = useState('');
  const [businessAreaFilter, setBusinessAreaFilter] = useState('');
  const [technicalAreaFilter, setTechnicalAreaFilter] = useState('');
  const [partnerSystemFilter, setPartnerSystemFilter] = useState('');
  const [thirdPartyFilter, setThirdPartyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const debouncedSearch = useDebounce(searchFilter, 500);

  const showError = useCallback((msg: string) => {
    toast.current?.show({ severity: 'error', summary: 'Error', detail: msg, life: 10000 });
  }, []);

  // Value-sets
  const { data: severityItems = [] } = useQuery({ queryKey: ['value-sets', 'errorSeverity'], queryFn: () => valueSetsService.getItems('errorSeverity', 'en'), staleTime: 5 * 60 * 1000 });
  const { data: sourceTypeItems = [] } = useQuery({ queryKey: ['value-sets', 'sourceType'], queryFn: () => valueSetsService.getItems('sourceType', 'en'), staleTime: 5 * 60 * 1000 });
  const { data: errorTypeItems = [] } = useQuery({ queryKey: ['value-sets', 'errorType'], queryFn: () => valueSetsService.getItems('errorType', 'en'), staleTime: 5 * 60 * 1000 });

  const severityOptions = [{ label: 'All Severities', value: '' }, ...severityItems.map((i) => ({ label: i.label, value: i.code }))];
  const sourceTypeOptions = [{ label: 'All Source Types', value: '' }, ...sourceTypeItems.map((i) => ({ label: i.label, value: i.code }))];
  const errorTypeOptions = [{ label: 'All Error Types', value: '' }, ...errorTypeItems.map((i) => ({ label: i.label, value: i.code }))];

  const fetchData = useCallback(async (page = 1, size = pageSize) => {
    try {
      setLoading(true);
      const params: ErrorMasterSearchParams = { page, pageSize: size };
      if (debouncedSearch) params.q = debouncedSearch;
      if (errorSeverityFilter) params.errorSeverity = errorSeverityFilter;
      if (sourceTypeFilter) (params as any).sourceType = sourceTypeFilter;
      if (errorTypeFilter) (params as any).errorType = errorTypeFilter;
      if (businessAreaFilter) (params as any).businessArea = businessAreaFilter;
      if (technicalAreaFilter) (params as any).technicalArea = technicalAreaFilter;
      if (partnerSystemFilter) (params as any).partnerSystem = partnerSystemFilter;
      if (thirdPartyFilter) (params as any).thirdParty = thirdPartyFilter;
      if (statusFilter) (params as any).isActive = statusFilter === 'active';
      const response = await errorMasterService.getAll(params);
      setErrorMasters((response.data || []).map((em) => ({ ...em, id: em.id || em._id })));
      setTotalRecords(response.pagination?.totalItems ?? (response.pagination as any)?.total ?? response.total ?? 0);
    } catch (error) {
      showError(extractErrorMessage(error, 'Failed to load error masters'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, errorSeverityFilter, sourceTypeFilter, errorTypeFilter, businessAreaFilter, technicalAreaFilter, partnerSystemFilter, thirdPartyFilter, statusFilter, pageSize, showError]);

  useEffect(() => { setFirst(0); fetchData(1); }, [debouncedSearch, errorSeverityFilter, sourceTypeFilter, errorTypeFilter, businessAreaFilter, technicalAreaFilter, partnerSystemFilter, thirdPartyFilter, statusFilter]); // eslint-disable-line

  const handlePageChange = (e: any) => {
    const newPage = Math.floor(e.first / e.rows) + 1;
    setFirst(e.first);
    setPageSize(e.rows);
    fetchData(newPage, e.rows);
  };

  const handleDeleteClick = (id: string) => { setSelectedErrorId(id); setDeleteDialogOpen(true); };
  const handleDeleteConfirm = async () => {
    if (!selectedErrorId) return;
    try {
      setDeleteLoading(true);
      await errorMasterService.delete(selectedErrorId);
      setDeleteDialogOpen(false); setSelectedErrorId(null);
      fetchData(Math.floor(first / pageSize) + 1, pageSize);
    } catch (error: any) {
      setDeleteDialogOpen(false); showError(extractErrorMessage(error, 'Failed to delete'));
    } finally { setDeleteLoading(false); }
  };

  // Export to styled Excel
  const [exporting, setExporting] = useState(false);
  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx-js-style');

      // Fetch all records matching current filters
      const allData: any[] = [];
      let pg = 1;
      let hasMore = true;
      while (hasMore) {
        const params: any = { page: pg, pageSize: 200 };
        if (debouncedSearch) params.q = debouncedSearch;
        if (errorSeverityFilter) params.errorSeverity = errorSeverityFilter;
        if (sourceTypeFilter) params.sourceType = sourceTypeFilter;
        if (errorTypeFilter) params.errorType = errorTypeFilter;
        if (businessAreaFilter) params.businessArea = businessAreaFilter;
        if (technicalAreaFilter) params.technicalArea = technicalAreaFilter;
        if (partnerSystemFilter) params.partnerSystem = partnerSystemFilter;
        if (thirdPartyFilter) params.thirdParty = thirdPartyFilter;
        if (statusFilter) params.isActive = statusFilter === 'active';
        const res = await errorMasterService.getAll(params);
        allData.push(...(res.data || []));
        const total = res.pagination?.totalItems ?? res.total ?? 0;
        hasMore = allData.length < total;
        pg++;
        if (pg > 100) break;
      }

      // Styles
      const titleStyle = { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '4F46E5' } }, alignment: { horizontal: 'center' } };
      const headerStyle = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '374151' } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin', color: { rgb: '9CA3AF' } } } };
      const sevColors: Record<string, string> = { CRITICAL: 'DC2626', HIGH: 'EA580C', MEDIUM: 'CA8A04', LOW: '2563EB' };

      // Build rows
      const headers = ['Error Code', 'Type', 'Severity', 'Message (EN)', 'Status', 'Log', 'Source Type', 'Source Name', 'App Code', 'Business Area', 'Technical Area', 'Tool', 'Partner System', 'Third Party', 'Created'];
      const rows = allData.map((em: any) => {
        const enMsg = em.messages?.find((m: any) => m.language === 'en');
        return [
          em.errorCode || '', (em as any).errorType || '', em.errorSeverity || '',
          enMsg?.template || em.messages?.[0]?.template || '',
          em.isActive ? 'Active' : 'Inactive', em.log ? 'On' : 'Off',
          (em as any).sourceType || '', (em as any).sourceName || '', (em as any).appCode || '',
          em.businessArea || '', em.technicalArea || '', em.tool || '',
          em.partnerSystem || '', em.thirdParty || '',
          em.createdAt ? new Date(em.createdAt).toLocaleDateString() : '',
        ];
      });

      // Title row
      const sheetData = [['Error Master Export', ...Array(headers.length - 1).fill('')], headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws['!cols'] = [{ wch: 48 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 12 }];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

      // Apply styles
      const applyStyle = (row: number, col: number, style: any) => {
        const addr = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        ws[addr].s = style;
      };

      // Title
      for (let c = 0; c < headers.length; c++) applyStyle(0, c, titleStyle);
      // Headers
      for (let c = 0; c < headers.length; c++) applyStyle(1, c, headerStyle);

      // Data rows — stripe + severity color
      for (let i = 0; i < rows.length; i++) {
        const rowIdx = i + 2;
        const bg = i % 2 === 0 ? 'FFFFFF' : 'F9FAFB';
        for (let c = 0; c < headers.length; c++) {
          const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
          if (!ws[addr]) continue;
          ws[addr].s = { font: { sz: 9 }, fill: { fgColor: { rgb: bg } }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } };
        }
        // Color severity cell (col 2)
        const sevAddr = XLSX.utils.encode_cell({ r: rowIdx, c: 2 });
        if (ws[sevAddr]) {
          const sev = (ws[sevAddr].v || '').toString().toUpperCase();
          if (sevColors[sev]) {
            ws[sevAddr].s = { font: { bold: true, sz: 9, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: sevColors[sev] } }, alignment: { horizontal: 'center' }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } };
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Error Master');
      XLSX.writeFile(wb, 'error-master-export.xlsx');
    } catch (err) {
      console.error('Export failed:', err);
      toast.current?.show({ severity: 'error', summary: 'Export Failed', detail: 'Could not generate Excel file', life: 3000 });
    } finally {
      setExporting(false);
    }
  }, [debouncedSearch, errorSeverityFilter, sourceTypeFilter, errorTypeFilter, businessAreaFilter, technicalAreaFilter, partnerSystemFilter, thirdPartyFilter, statusFilter]);

  // Overview stats — fetch counts for all records (not just current page)
  const [overviewStats, setOverviewStats] = useState<{ active: number; critical: number; high: number; medium: number; low: number }>({ active: 0, critical: 0, high: 0, medium: 0, low: 0 });
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const baseParams: any = { page: 1, pageSize: 1 };
        if (debouncedSearch) baseParams.q = debouncedSearch;
        if (sourceTypeFilter) baseParams.sourceType = sourceTypeFilter;
        if (errorTypeFilter) baseParams.errorType = errorTypeFilter;
        if (businessAreaFilter) baseParams.businessArea = businessAreaFilter;
        if (technicalAreaFilter) baseParams.technicalArea = technicalAreaFilter;
        if (partnerSystemFilter) baseParams.partnerSystem = partnerSystemFilter;
        if (thirdPartyFilter) baseParams.thirdParty = thirdPartyFilter;
        if (statusFilter) baseParams.isActive = statusFilter === 'active';

        const [activeRes, critRes, highRes, medRes, lowRes] = await Promise.all([
          errorMasterService.getAll({ ...baseParams, errorSeverity: errorSeverityFilter || undefined }),
          errorMasterService.getAll({ ...baseParams, errorSeverity: 'CRITICAL' }),
          errorMasterService.getAll({ ...baseParams, errorSeverity: 'HIGH' }),
          errorMasterService.getAll({ ...baseParams, errorSeverity: 'MEDIUM' }),
          errorMasterService.getAll({ ...baseParams, errorSeverity: 'LOW' }),
        ]);
        if (cancelled) return;
        setOverviewStats({
          active: activeRes.pagination?.totalItems ?? activeRes.total ?? 0,
          critical: critRes.pagination?.totalItems ?? critRes.total ?? 0,
          high: highRes.pagination?.totalItems ?? highRes.total ?? 0,
          medium: medRes.pagination?.totalItems ?? medRes.total ?? 0,
          low: lowRes.pagination?.totalItems ?? lowRes.total ?? 0,
        });
      } catch { /* ignore */ }
    };
    fetchCounts();
    return () => { cancelled = true; };
  }, [debouncedSearch, errorSeverityFilter, sourceTypeFilter, errorTypeFilter, businessAreaFilter, technicalAreaFilter, partnerSystemFilter, thirdPartyFilter, statusFilter]);

  const getSeverityTag = (sev: string) => {
    const s = (sev || '').toUpperCase();
    const map: Record<string, 'danger' | 'warning' | 'info' | 'success'> = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'success' };
    return s ? <Tag value={s} severity={map[s] || 'secondary' as any} className="text-xs" /> : <span style={{ fontSize: '0.75rem' }} className="text-gray-400">-</span>;
  };

  // Table columns
  const columns: DataTableColumn<ErrorMaster & { id: string }>[] = useMemo(() => {
    const cols: DataTableColumn<ErrorMaster & { id: string }>[] = [
      {
        field: 'createdAt', header: 'Created', sortable: true, style: { width: '95px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-500 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</span>,
      },
      {
        field: 'errorCode', header: 'Error Code', sortable: true, style: { minWidth: '200px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.8rem' }} className="font-semibold text-gray-900 dark:text-white break-all">{r.errorCode}</span>,
      },
      {
        field: 'errorType', header: 'Type', sortable: true, style: { width: '80px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600">{(r as any).errorType || '-'}</span>,
      },
      {
        field: 'errorSeverity', header: 'Severity', sortable: true, style: { width: '85px' },
        body: (r: ErrorMaster) => getSeverityTag(r.errorSeverity),
      },
      {
        field: 'messages', header: 'Message (EN)', sortable: false, style: { minWidth: '180px' },
        body: (r: ErrorMaster) => {
          const en = r.messages?.find((m) => m.language === 'en');
          const msg = en?.template || r.messages?.[0]?.template || '-';
          return <span style={{ fontSize: '0.75rem' }} className="text-gray-500 line-clamp-1" data-pr-tooltip={msg}>{msg}</span>;
        },
      },
      {
        field: 'isActive', header: 'Status', sortable: true, style: { width: '70px' },
        body: (r: ErrorMaster) => <Tag value={r.isActive ? 'Active' : 'Inactive'} severity={r.isActive ? 'success' : 'secondary'} className="text-xs" />,
      },
      {
        field: 'log', header: 'Log', sortable: true, style: { width: '55px' },
        body: (r: ErrorMaster) => <Tag value={r.log ? 'On' : 'Off'} severity={r.log ? 'success' : 'secondary'} className="text-xs" />,
      },
      {
        field: 'sourceType', header: 'Source Type', sortable: true, style: { width: '90px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600">{(r as any).sourceType || '-'}</span>,
      },
      {
        field: 'sourceName', header: 'Source Name', sortable: true, style: { width: '110px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600 truncate block max-w-[120px]" title={(r as any).sourceName || ''}>{(r as any).sourceName || '-'}</span>,
      },
      {
        field: 'businessArea', header: 'Business Area', sortable: true, style: { width: '110px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600 truncate block max-w-[120px]" title={r.businessArea || ''}>{r.businessArea || '-'}</span>,
      },
      {
        field: 'technicalArea', header: 'Technical Area', sortable: true, style: { width: '110px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600 truncate block max-w-[120px]" title={r.technicalArea || ''}>{r.technicalArea || '-'}</span>,
      },
      {
        field: 'tool', header: 'Tool', sortable: true, style: { width: '80px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600">{r.tool || '-'}</span>,
      },
      {
        field: 'partnerSystem', header: 'Partner System', sortable: true, style: { width: '110px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600 truncate block max-w-[120px]" title={r.partnerSystem || ''}>{r.partnerSystem || '-'}</span>,
      },
      {
        field: 'thirdParty', header: 'Third Party', sortable: true, style: { width: '90px' },
        body: (r: ErrorMaster) => <span style={{ fontSize: '0.75rem' }} className="text-gray-600">{r.thirdParty || '-'}</span>,
      },
    ];

    // Actions column
    cols.push({
      field: 'actions', header: 'Actions', sortable: false,
      headerStyle: { textAlign: 'center' },
      frozen: true, alignFrozen: 'right',
      headerStyle: { textAlign: 'center', width: '110px' },
      style: { width: '110px', textAlign: 'center' },
      body: (r: ErrorMaster & { id: string }) => {
        const isDeleted = (r as any).isDelete || r.isDeleted;
        return (
          <div className="flex gap-3 justify-center">
            <i className="pi pi-eye" style={{ fontSize: '1rem', color: '#16a34a', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigateToView(r.id); }} title="View" />
            {!isDeleted && canUpdate && (
              <i className="pi pi-pencil" style={{ fontSize: '1rem', color: '#2563eb', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigateToEdit(r.id); }} title="Edit" />
            )}
            {!isDeleted && canDelete && (
              <i className="pi pi-trash" style={{ fontSize: '1rem', color: '#dc2626', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(r.id); }} title="Delete" />
            )}
          </div>
        );
      },
    });

    return cols;
  }, [canUpdate, canDelete]);

  return (
    <PermissionGuard jobName={JOB_NAMES.ERROR_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-ErrorMaster-List">

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div>
            <div className={styles.headerContent}>
              <div className={styles.headerIcon}>
                <i className="pi pi-exclamation-triangle" />
              </div>
              <h1 className={styles.title}>Error Master</h1>
            </div>
            <p className={styles.subtitle}>Manage error definitions, severity levels, and localized messages</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => fetchData(Math.floor(first / pageSize) + 1, pageSize)}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title="Refresh"
              data-testid="ErrorMasterList.Button.Refresh"
            >
              <i className={`pi pi-refresh text-gray-500 dark:text-gray-400 ${loading ? 'pi-spin' : ''}`} style={{ fontSize: '0.875rem' }} />
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to Excel"
              data-testid="ErrorMasterList.Button.Export"
            >
              <i className={`pi ${exporting ? 'pi-spin pi-spinner' : 'pi-download'} text-green-600`} style={{ fontSize: '0.875rem' }} />
            </button>
            {canCreate && (
              <button
                onClick={() => navigateToCreate()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium cursor-pointer border-none hover:bg-indigo-700 transition-colors"
                data-testid="ErrorMasterList.Button.Create"
              >
                <i className="pi pi-plus" style={{ fontSize: '0.75rem' }} />
                Create Error
              </button>
            )}
          </div>
        </div>

        {/* Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0.625rem', marginBottom: '0.75rem' }}>
          <div className={`${styles.overviewCard} ${styles.cardTotal}`}>
            <p className={styles.overviewLabel}>Total Definitions</p>
            <p className={styles.overviewValue}>{totalRecords}</p>
          </div>
          <div className={`${styles.overviewCard} ${styles.cardActive}`}>
            <p className={styles.overviewLabel}>Active</p>
            <p className={styles.overviewValue}>{overviewStats.active}</p>
          </div>
          {/* Severity Distribution */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', marginBottom: '0.625rem' }}>Severity Distribution</p>
            {(() => {
              const items: [string, number, string, string][] = [
                ['LOW', overviewStats.low, '#22c55e', '#16a34a'],
                ['MEDIUM', overviewStats.medium, '#6366f1', '#4f46e5'],
                ['HIGH', overviewStats.high, '#f97316', '#ea580c'],
                ['CRITICAL', overviewStats.critical, '#ef4444', '#dc2626'],
              ];
              const maxCount = Math.max(...items.map(([, c]) => c), 1);
              return items.map(([sev, count, barColor, labelColor]) => {
                const pct = Math.max((count / maxCount) * 100, count > 0 ? 3 : 0);
                return (
                  <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, width: '60px', flexShrink: 0, color: labelColor }}>{sev}</span>
                    <div style={{ flex: 1, height: '10px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '999px', width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4338ca', width: '50px', textAlign: 'right', flexShrink: 0 }}>{count.toLocaleString()}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Main Card */}
        <div className={styles.card}>
          <div className={styles.cardContent}>

            {/* Filter Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterBarContent}>
                <div className={styles.filterGroup} style={{ flexWrap: 'wrap', gap: '0.375rem' }}>
                  <Input
                    name="search"
                    placeholder="Search error code or message..."
                    value={searchFilter}
                    onChange={(e: any) => setSearchFilter(e?.target?.value ?? e)}
                    testId="ErrorMasterList.Search"
                    style={{ minWidth: '200px', width: '200px' }}
                    clearable
                  />
                  <Dropdown value={errorSeverityFilter} options={severityOptions} onChange={(e: { value: string }) => setErrorSeverityFilter(e.value || '')} placeholder="Severity" style={{ width: '130px' }} resetFilterOnHide={true} />
                  <Dropdown value={errorTypeFilter} options={errorTypeOptions} onChange={(e: { value: string }) => setErrorTypeFilter(e.value || '')} placeholder="Error Type" style={{ width: '130px' }} resetFilterOnHide={true} />
                  <Dropdown value={sourceTypeFilter} options={sourceTypeOptions} onChange={(e: { value: string }) => setSourceTypeFilter(e.value || '')} placeholder="Source Type" style={{ width: '130px' }} resetFilterOnHide={true} />
                  <Dropdown value={businessAreaFilter} options={[{ label: 'All Business Areas', value: '' }, ...[...new Set(errorMasters.map((em) => em.businessArea).filter(Boolean))].map((v) => ({ label: v as string, value: v as string }))]} onChange={(e: { value: string }) => setBusinessAreaFilter(e.value || '')} placeholder="Business Area" style={{ width: '140px' }} filter filterPlaceholder="Search..." resetFilterOnHide={true} />
                  <Dropdown value={technicalAreaFilter} options={[{ label: 'All Technical Areas', value: '' }, ...[...new Set(errorMasters.map((em) => em.technicalArea).filter(Boolean))].map((v) => ({ label: v as string, value: v as string }))]} onChange={(e: { value: string }) => setTechnicalAreaFilter(e.value || '')} placeholder="Technical Area" style={{ width: '140px' }} filter filterPlaceholder="Search..." resetFilterOnHide={true} />
                  <Dropdown value={partnerSystemFilter} options={[{ label: 'All Partner Systems', value: '' }, ...[...new Set(errorMasters.map((em) => em.partnerSystem).filter(Boolean))].map((v) => ({ label: v as string, value: v as string }))]} onChange={(e: { value: string }) => setPartnerSystemFilter(e.value || '')} placeholder="Partner System" style={{ width: '140px' }} filter filterPlaceholder="Search..." resetFilterOnHide={true} />
                  <Dropdown value={thirdPartyFilter} options={[{ label: 'All Third Parties', value: '' }, ...[...new Set(errorMasters.map((em) => em.thirdParty).filter(Boolean))].map((v) => ({ label: v as string, value: v as string }))]} onChange={(e: { value: string }) => setThirdPartyFilter(e.value || '')} placeholder="Third Party" style={{ width: '130px' }} filter filterPlaceholder="Search..." resetFilterOnHide={true} />
                  <Dropdown value={statusFilter} options={[{ label: 'All Status', value: '' }, { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} onChange={(e: { value: string }) => setStatusFilter(e.value || '')} placeholder="Status" style={{ width: '120px' }} resetFilterOnHide={true} />
                  {(searchFilter || errorSeverityFilter || sourceTypeFilter || errorTypeFilter || businessAreaFilter || technicalAreaFilter || partnerSystemFilter || thirdPartyFilter || statusFilter) && (
                    <button onClick={() => { setSearchFilter(''); setErrorSeverityFilter(''); setSourceTypeFilter(''); setErrorTypeFilter(''); setBusinessAreaFilter(''); setTechnicalAreaFilter(''); setPartnerSystemFilter(''); setThirdPartyFilter(''); setStatusFilter(''); }} className="text-red-500 hover:text-red-700 bg-transparent border-none cursor-pointer p-1" title="Clear filters">
                      <i className="pi pi-times-circle" style={{ fontSize: '1.1rem' }} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={errorMasters}
              columns={columns}
              loading={loading}
              emptyMessage="No error masters found"
              dataKey="id"
              scrollable
              scrollDirection="horizontal"
              onRowClick={(e: any) => { setDetailData(e.data); setDetailOpen(true); }}
              rowClassName={() => 'cursor-pointer'}
            />
          </div>

          {/* Pagination */}
          {totalRecords > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Rows:</span>
                <select value={pageSize} onChange={(e) => { const s = Number(e.target.value); setPageSize(s); setFirst(0); fetchData(1, s); }}
                  style={{ fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', padding: '2px 6px', background: 'transparent', color: '#374151', cursor: 'pointer' }}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  Page {Math.floor(first / pageSize) + 1} of {Math.ceil(totalRecords / pageSize)} ({totalRecords})
                </span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={() => { const p = Math.floor(first / pageSize); setFirst((p - 1) * pageSize); fetchData(p, pageSize); }} disabled={first === 0}
                    style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: '1px solid #d1d5db', background: 'transparent', cursor: first === 0 ? 'not-allowed' : 'pointer', opacity: first === 0 ? 0.3 : 1 }}>
                    <i className="pi pi-chevron-left" style={{ fontSize: '0.75rem', color: '#6b7280' }} />
                  </button>
                  <button onClick={() => { const p = Math.floor(first / pageSize) + 2; setFirst((p - 1) * pageSize); fetchData(p, pageSize); }} disabled={Math.floor(first / pageSize) + 1 >= Math.ceil(totalRecords / pageSize)}
                    style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', border: '1px solid #d1d5db', background: 'transparent', cursor: Math.floor(first / pageSize) + 1 >= Math.ceil(totalRecords / pageSize) ? 'not-allowed' : 'pointer', opacity: Math.floor(first / pageSize) + 1 >= Math.ceil(totalRecords / pageSize) ? 0.3 : 1 }}>
                    <i className="pi pi-chevron-right" style={{ fontSize: '0.75rem', color: '#6b7280' }} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <Tooltip target="[data-pr-tooltip]" />
      </div>

      {/* Detail Dialog */}
      <Dialog
        visible={detailOpen}
        onHide={() => { setDetailOpen(false); setDetailData(null); }}
        header={
          <div className="flex items-center gap-2">
            <i className="pi pi-file text-indigo-500" style={{ fontSize: '1.1rem' }} />
            <span style={{ fontSize: '1rem', fontWeight: 600 }}>Error Master Details</span>
            {detailData?.errorCode && <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', background: '#4f46e5', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>{detailData.errorCode}</span>}
          </div>
        }
        style={{ width: '750px', maxHeight: '90vh' }}
        modal dismissableMask draggable={false} resizable={false}
        footer={
          <div className="flex justify-end gap-2">
            {detailData && canUpdate && <Button label="Edit" icon="pi pi-pencil" size="small" severity="info" onClick={() => { setDetailOpen(false); navigateToEdit(detailData.id || (detailData as any)._id); }} />}
            <Button label="View Full" icon="pi pi-eye" size="small" onClick={() => { setDetailOpen(false); if (detailData) navigateToView(detailData.id || (detailData as any)._id); }} />
            <Button label="Close" icon="pi pi-times" size="small" severity="secondary" onClick={() => setDetailOpen(false)} />
          </div>
        }
      >
        {detailData && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {getSeverityTag(detailData.errorSeverity)}
              {(detailData as any).errorType && <Tag value={(detailData as any).errorType} />}
              {(detailData as any).sourceType && <span style={{ fontSize: '0.8rem', color: '#4b5563', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>{(detailData as any).sourceType}</span>}
              <Tag value={detailData.isActive ? 'Active' : 'Inactive'} severity={detailData.isActive ? 'success' : 'secondary'} />
              {detailData.log !== undefined && <Tag value={detailData.log ? 'Log: On' : 'Log: Off'} severity={detailData.log ? 'success' : 'secondary'} />}
            </div>

            {detailData.messages && detailData.messages.length > 0 && (
              <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '0.5rem', padding: '0.75rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4f46e5', marginBottom: '0.5rem' }}>Localized Messages</p>
                {detailData.messages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginRight: '0.5rem', background: '#fff', padding: '1px 6px', borderRadius: '3px' }}>{msg.language}</span>
                    <span style={{ fontSize: '0.875rem', color: '#374151' }}>{msg.template}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1rem' }}>
              {([
                ['Error Code', detailData.errorCode], ['Error Type', (detailData as any).errorType],
                ['Severity', detailData.errorSeverity], ['Source Type', (detailData as any).sourceType],
                ['Source Name', (detailData as any).sourceName], ['App Code', (detailData as any).appCode],
                ['Module ID', (detailData as any).moduleId], ['Business Area', detailData.businessArea],
                ['Technical Area', detailData.technicalArea], ['Tool', detailData.tool],
                ['Partner System', detailData.partnerSystem], ['Third Party', detailData.thirdParty],
                ['Logging', detailData.log ? 'Enabled' : 'Disabled'], ['Active', detailData.isActive ? 'Yes' : 'No'],
                ['Created By', detailData.createdBy], ['Created At', detailData.createdAt ? new Date(detailData.createdAt).toLocaleString() : null],
                ['Updated By', detailData.updatedBy], ['Updated At', detailData.updatedAt ? new Date(detailData.updatedAt).toLocaleString() : null],
              ] as [string, any][]).map(([label, val]) => (
                <div key={label} style={{ padding: '0.25rem 0', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>{label}</p>
                  <p style={{ fontSize: '0.875rem', color: '#1f2937', wordBreak: 'break-all' }}>{val || '-'}</p>
                </div>
              ))}
            </div>

            {(detailData.devMessage || detailData.helpLink || detailData.videoLink) && (
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.5rem' }}>Developer Information</p>
                {detailData.devMessage && <div style={{ marginBottom: '0.375rem' }}><p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Dev Message</p><p style={{ fontSize: '0.875rem', color: '#374151', wordBreak: 'break-all' }}>{detailData.devMessage}</p></div>}
                {detailData.helpLink && <div style={{ marginBottom: '0.375rem' }}><p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Help Link</p><a href={detailData.helpLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', color: '#2563eb', wordBreak: 'break-all' }}>{detailData.helpLink}</a></div>}
                {detailData.videoLink && <div><p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Video Link</p><a href={detailData.videoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', color: '#2563eb', wordBreak: 'break-all' }}>{detailData.videoLink}</a></div>}
              </div>
            )}
          </div>
        )}
      </Dialog>

      <DeleteConfirmDialog visible={deleteDialogOpen} onCancel={() => { setDeleteDialogOpen(false); setSelectedErrorId(null); }} onDelete={handleDeleteConfirm} message="Are you sure you want to delete this error master?" testId="ErrorMasterList.Dialog.Delete" loading={deleteLoading} />
    </PermissionGuard>
  );
};

export default ErrorMasterList;
