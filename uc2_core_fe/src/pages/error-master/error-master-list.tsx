import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { errorMasterService } from '../../services/error-master.service';
import { valueSetsService } from '../../services/value-sets.service';
import { modulesService } from '../../services/modules.service';
import { extractErrorMessage } from '../../utils/error-handler';
import type { ErrorMaster, ErrorMasterSearchParams } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './error-master-list.module.css';

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

  // Filter states
  const [errorSeverityFilter, setErrorSeverityFilter] = useState<string>('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Debounce search text (500ms delay)
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
    staleTime: 5 * 60 * 1000, // 5 mins
  });

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
    staleTime: 5 * 60 * 1000, // 5 mins
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

      if (debouncedSearchFilter) {
        params.q = debouncedSearchFilter;
      }

      if (moduleFilter) {
        params.moduleId = moduleFilter;
      }

      if (errorSeverityFilter) {
        params.errorSeverity = errorSeverityFilter;
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await errorMasterService.getAll(params);
      // Map _id to id for DataGrid compatibility
      const mappedData = (response.data || []).map((em) => ({ ...em, id: em.id || em._id }));
      setErrorMasters(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? response.total ?? 0;
      setTotalRecords(total);
    } catch (error) {
      console.error('Failed to fetch error masters:', error);
      showError(extractErrorMessage(error, 'Failed to load error masters'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchFilter, moduleFilter, errorSeverityFilter, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchErrorMasters(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchErrorMasters(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchErrorMasters(1, pageSize);
  }, [debouncedSearchFilter, moduleFilter, errorSeverityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

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

  // Get severity color
  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'success' | 'secondary' => {
    switch (severity) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'secondary';
    }
  };

  const severityOptions = [
    { label: 'All Severities', value: '' },
    ...errorSeverityItems.map((item) => ({
      label: item.label,
      value: item.code,
    })),
  ];

  const moduleOptions = [
    { label: 'All Modules', value: '' },
    ...modules.map((m) => ({
      label: m.name,
      value: m._id,
    })),
  ];

  // Helper to get module name by ID
  const getModuleName = useCallback((moduleId: string) => {
    const module = modules.find((m) => m._id === moduleId);
    return module?.name || '-';
  }, [modules]);

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => errorMasterService.export(), []);

  const columns: DataTableColumn<ErrorMaster>[] = useMemo(() => [
    {
      field: 'errorCode',
      header: 'Error Code',
      sortable: true,
    },
    {
      field: 'errorType',
      header: 'Type',
      sortable: true,
    },
    {
      field: 'errorSeverity',
      header: 'Severity',
      sortable: true,
      body: (rowData: ErrorMaster) => (
        <Tag value={rowData.errorSeverity} severity={getSeverityColor(rowData.errorSeverity)} />
      ),
    },
    {
      field: 'moduleId',
      header: 'Module',
      sortable: false,
      body: (rowData: ErrorMaster) => getModuleName((rowData as any).moduleId),
    },
    {
      field: 'businessArea',
      header: 'Business Area',
      sortable: false,
      body: (rowData: ErrorMaster) => rowData.businessArea || '-',
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: ErrorMaster) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData.id || rowData._id)}
              data-testid="ErrorMasterList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>

            {!isDeleted && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData.id || rowData._id)}
                    data-testid="ErrorMasterList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData.id || rowData._id)}
                    data-testid="ErrorMasterList.Action.Delete"
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
    },
  ], [canUpdate, canDelete, getModuleName]);

  return (
    <PermissionGuard jobName={JOB_NAMES.ERROR_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-ErrorMaster-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-exclamation-triangle" />
            </div>
            <h1 className={styles.title}>Error Master Management</h1>
          </div>
          <p className={styles.subtitle}>
            Manage error definitions, severity levels, and localized messages
          </p>
        </div>

        {/* Main Card */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            {/* Filter / Control Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterBarContent}>
                {/* Left side - Filters */}
                <div className={styles.filterGroup}>
                  <Input
                    name="search"
                    placeholder="Search errors..."
                    value={searchFilter}
                    onChange={(value: string) => setSearchFilter(value)}
                    testId="ErrorMasterList.Filter.Search"
                    style={{ minWidth: '160px', width: '160px' }}
                    clearable
                  />

                  <Dropdown
                    value={moduleFilter}
                    options={moduleOptions}
                    onChange={(e: { value: string }) => setModuleFilter(e.value || '')}
                    placeholder="Module"
                    style={{ width: '150px' }}
                    data-testid="ErrorMasterList.Filter.Module"
                    resetFilterOnHide={true}
                  />

                  <Dropdown
                    value={errorSeverityFilter}
                    options={severityOptions}
                    onChange={(e: { value: string }) => setErrorSeverityFilter(e.value || '')}
                    placeholder="Severity"
                    style={{ width: '150px' }}
                    data-testid="ErrorMasterList.Filter.ErrorSeverity"
                    resetFilterOnHide={true}
                  />
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="error-masters-export.xlsx"
                    testId="ErrorMasterList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchErrorMasters(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="ErrorMasterList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Error"
                      icon="pi pi-plus"
                      onClick={() => navigateToCreate()}
                      testId="ErrorMasterList.Button.Create"
                      size="small"
                    />
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
              paginator
              lazy
              first={first}
              rows={pageSize}
              totalRecords={totalRecords}
              onPage={handlePageChange}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sortField={sortField || undefined}
              sortOrder={sortOrder || undefined}
              onSort={handleSort}
              removableSort
            />
          </div>
        </div>
        <Tooltip target="[data-pr-tooltip]" />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this error master? This action cannot be undone if the error is not referenced in any logs."
          testId="ErrorMasterList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default ErrorMasterList;
