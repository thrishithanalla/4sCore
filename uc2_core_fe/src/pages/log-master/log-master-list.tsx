import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import type { LogMaster, LogMasterQueryParams } from '../../types';
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
  const [selectedLayer, setSelectedLayer] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Debounce search text (500ms delay)
  const debouncedSearchText = useDebounce(searchText, 500);

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
        page_size: size,
        layer: selectedLayer || undefined,
        eventCode: debouncedSearchText || undefined,
      });

      const mappedData = (response.items || []).map((item) => ({ ...item, id: item._id }));
      setLogMasters(mappedData);
      setTotalRecords(response.total || 0);
    } catch (err: any) {
      console.error('Failed to fetch log masters:', err);
      showError(extractErrorMessage(err, 'Failed to load log masters. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [selectedLayer, debouncedSearchText, pageSize, showError]);

  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchLogMasters(newPage, event.rows);
  };

  useEffect(() => {
    setFirst(0);
    fetchLogMasters(1, pageSize);
  }, [selectedLayer, debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => navigateToView(String(id));
  const handleEdit = (id: string | number) => navigateToEdit(String(id));
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

  const layerOptions = [
    { label: 'All Layers', value: '' },
    { label: 'API', value: 'API' },
    { label: 'Screen', value: 'screen' },
    { label: 'Server', value: 'Server' },
    { label: 'DB', value: 'db' },
    { label: 'Function', value: 'function' },
  ];

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'eventCode', header: 'Event Code' },
    { field: 'logObject', header: 'Log Object' },
    { field: 'action', header: 'Action' },
    { field: 'description', header: 'Description' },
    { field: 'messageTemplate', header: 'Message Template' },
    { field: 'layer', header: 'Layer' },
    { field: 'logLevel', header: 'Log Level' },
    { field: 'keyFields', header: 'Key Fields' },
  ], []);

  const fetchExportData = useCallback(async (): Promise<LogMaster[]> => {
    const params: Omit<LogMasterQueryParams, 'page' | 'page_size'> = {};
    if (selectedLayer) params.layer = selectedLayer;
    if (debouncedSearchText?.trim()) params.eventCode = debouncedSearchText.trim();
    return logMasterService.getAllForExport(params, pageSize);
  }, [selectedLayer, debouncedSearchText, pageSize]);

  const getLevelSeverity = (level: string): 'info' | 'warning' | 'danger' | 'secondary' => {
    switch (level?.toUpperCase()) {
      case 'INFO': return 'info';
      case 'WARNING': case 'WARN': return 'warning';
      case 'ERROR': return 'danger';
      default: return 'secondary';
    }
  };

  const columns: DataTableColumn<LogMaster & { id: string }>[] = useMemo(() => {
    const baseColumns: DataTableColumn<LogMaster & { id: string }>[] = [
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
        field: 'keyFields',
        header: 'Key Fields',
        style: { width: '120px' },
        body: (rowData: LogMaster) => (
          <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">
            {rowData.keyFields || '-'}
          </span>
        ),
      },
    ];

    baseColumns.push({
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: LogMaster & { id: string }) => {
        const isDeleted = rowData.isDelete;
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
  }, [canUpdate, canDelete]);

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
                <div className={styles.filterGroup}>
                  <Input
                    name="search"
                    placeholder="Search by event code..."
                    value={searchText}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
                    testId="LogMasterList.Search"
                    style={{ minWidth: '200px', width: '200px' }}
                    clearable
                  />
                  <Dropdown
                    value={selectedLayer}
                    options={layerOptions}
                    onChange={(e: { value: string }) => setSelectedLayer(e.value || '')}
                    placeholder="All Layers"
                    style={{ width: '160px' }}
                    data-testid="LogMasterList.Filter.Layer"
                    resetFilterOnHide={true}
                  />
                </div>

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
