import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportButton } from 'mainFe/ExportButton';
import { logMasterService } from '../../services/log-master.service';
import { modulesService } from '../../services/modules.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import type { LogMaster } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './log-master-list.module.css';

const LogMasterList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'log-master',
    basePath: '/log-master',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.LOG_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.LOG_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.LOG_MASTER);
  const [logMasters, setLogMasters] = useState<(LogMaster & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Debounce search text (500ms delay)
  const debouncedSearchText = useDebounce(searchText, 500);

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Fetch log masters
  const fetchLogMasters = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);

      const response = await logMasterService.getAllPaginated({
        page,
        limit: size,
        moduleId: selectedModuleId || undefined,
        name: debouncedSearchText || undefined,
      });

      // Map _id to id for DataGrid compatibility
      const mappedData = (response.items || []).map((item) => ({ ...item, id: item._id }));
      setLogMasters(mappedData);

      // Handle pagination from API response
      setTotalRecords(response.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch log masters:', err);
      showError(extractErrorMessage(err, 'Failed to load log masters. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [selectedModuleId, debouncedSearchText, pageSize, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchLogMasters(newPage, event.rows);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchLogMasters(1, pageSize);
  }, [selectedModuleId, debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;

    try {
      setDeleteLoading(true);
      await logMasterService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchLogMasters();
    } catch (err: any) {
      console.error('Failed to delete log master:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete log master'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Create module name lookup map
  const moduleNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    modules.forEach((m) => {
      map[m._id] = m.name;
    });
    return map;
  }, [modules]);

  // Module options for dropdown
  const moduleOptions = [
    { label: 'All Modules', value: '' },
    ...modules.map((m) => ({
      label: m.name,
      value: m._id,
    })),
  ];

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'name', header: 'Name' },
    { field: 'module.name', header: 'Module' },
    { field: 'purpose', header: 'Purpose' },
    { field: 'template', header: 'Template' },
    { field: 'retentionPeriod', header: 'Retention (days)' },
  ], []);

  // Fetch all data for export
  const fetchExportData = useCallback(async (): Promise<LogMaster[]> => {
    const params: Omit<LogMasterQueryParams, 'page' | 'limit'> = {};
    if (selectedModuleId) {
      params.moduleId = selectedModuleId;
    }
    if (debouncedSearchText?.trim()) {
      params.name = debouncedSearchText.trim();
    }
    return logMasterService.getAllForExport(params, pageSize);
  }, [selectedModuleId, debouncedSearchText, pageSize]);

  const columns: DataTableColumn<LogMaster & { id: string }>[] = useMemo(() => {
    const baseColumns: DataTableColumn<LogMaster & { id: string }>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
      },
      {
        field: 'moduleId',
        header: 'Module',
        sortable: true,
        body: (rowData: LogMaster) => {
          const moduleName = rowData.module?.name || moduleNameMap[rowData.moduleId];
          if (!moduleName) {
            return <span className="text-gray-400 dark:text-gray-500 text-xs italic">No module</span>;
          }
          return <Tag value={moduleName} severity="info" className="text-xs" />;
        },
      },
      {
        field: 'purpose',
        header: 'Purpose',
        sortable: false,
        body: (rowData: LogMaster) => rowData.purpose || '-',
      },
      {
        field: 'template',
        header: 'Template',
        sortable: false,
        style: { minWidth: '450px', maxWidth: '600px' },
        body: (rowData: LogMaster) => (
          <span className="whitespace-normal break-words">{rowData.template || '-'}</span>
        ),
      },
      {
        field: 'retentionPeriod',
        header: 'Retention (days)',
        sortable: true,
      },
    ];

    // Always add actions column at the end
    baseColumns.push({
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: LogMaster & { id: string }) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData.id)}
              data-testid="LogMasterList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>

            {!isDeleted && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData.id)}
                    data-testid="LogMasterList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData.id)}
                    data-testid="LogMasterList.Action.Delete"
                    data-pr-tooltip="Delete"
                  >
                    <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}
              </>
            )}
          </div>
        );
      },
    });

    return baseColumns;
  }, [canUpdate, canDelete, moduleNameMap]);

  return (
    <PermissionGuard jobName={JOB_NAMES.LOG_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-LogMaster-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-file-edit" />
            </div>
            <h1 className={styles.title}>Log Master</h1>
          </div>
          <p className={styles.subtitle}>
            Manage log configurations and templates
          </p>
        </div>

        {/* Main Card */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            {/* Filter / Control Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterBarContent}>
                {/* Left side - All filters grouped together */}
                <div className={styles.filterGroup}>
                  <Input
                    name="search"
                    placeholder="Search log masters..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="LogMasterList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  <Dropdown
                    value={selectedModuleId}
                    options={moduleOptions}
                    onChange={(e: { value: string }) => setSelectedModuleId(e.value || '')}
                    placeholder="All Modules"
                    style={{ width: '160px' }}
                    data-testid="LogMasterList.Filter.Module"
                    resetFilterOnHide={true}
                  />
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportButton
                    fetchData={fetchExportData}
                    columns={exportColumns}
                    filename="log-masters"
                    testId="LogMasterList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchLogMasters(Math.floor(first / pageSize) + 1, pageSize)}
                    loading={loading}
                    testId="LogMasterList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Log Master"
                      icon="pi pi-plus"
                      onClick={() => navigate('/log-master/create')}
                      testId="LogMasterList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={logMasters}
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
        </div>
        <Tooltip target="[data-pr-tooltip]" />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this log master? This action will mark it as deleted."
          testId="LogMasterList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default LogMasterList;
