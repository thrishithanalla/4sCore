import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportButton } from 'mainFe/ExportButton';
import { jobsService, type JobQueryParams } from '../../services/jobs.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import type { Job } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const JobsList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'jobs',
    basePath: '/jobs',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.JOBS);
  const canUpdate = useCanUpdate(JOB_NAMES.JOBS);
  const canDelete = useCanDelete(JOB_NAMES.JOBS);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Inline editing state
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null);
  const [savingRow, setSavingRow] = useState(false);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

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

  const fetchJobs = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: JobQueryParams = {
        page,
        page_size: size,
        include_deleted: false,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      const response = await jobsService.getAll(params);
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      setJobs(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch jobs:', err);
      showError(extractErrorMessage(err, 'Failed to load jobs. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, pageSize, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchJobs(newPage, event.rows);
  };

  // Handle sort event
  const handleSort = (event: any) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  // Apply client-side sorting to current page data
  const sortedJobs = useMemo(() => {
    if (!sortField || !sortOrder) return jobs;
    return [...jobs].sort((a: any, b: any) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      if (aValue == null) return sortOrder;
      if (bValue == null) return -sortOrder;
      if (typeof aValue === 'string') {
        return sortOrder * aValue.localeCompare(bValue);
      }
      return sortOrder * (aValue - bValue);
    });
  }, [jobs, sortField, sortOrder]);

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchJobs(1, pageSize);
  }, [debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await jobsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchJobs();
    } catch (err: any) {
      console.error('Failed to delete job:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete job'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'name', header: 'Name' },
    { field: 'shortCode', header: 'Short Code' },
    { field: 'displayName', header: 'Display Name' },
    { field: 'route', header: 'Route' },
    { field: 'isMenu', header: 'Show in Menu' },
    { field: 'displayOrder', header: 'Display Order' },
  ], []);

  // Fetch all data for export (called by ExportButton)
  const fetchExportData = useCallback(async (): Promise<Job[]> => {
    const params: Omit<JobQueryParams, 'page' | 'page_size'> = {
      include_deleted: false,
    };
    if (debouncedSearchText?.trim()) {
      params.search = debouncedSearchText.trim();
    }
    return jobsService.getAllForExport(params);
  }, [debouncedSearchText]);

  const columns: DataTableColumn<Job>[] = useMemo(() => [
    {
      field: 'name',
      header: 'Name',
      sortable: true,
      body: (rowData: Job) => {
        const isEditing = editingRow?.id === rowData._id;
        if (isEditing) {
          return (
            <InputText
              value={editingRow.name}
              onChange={(e) => updateEditingField('name', e.target.value)}
              className="p-inputtext-sm w-full"
              disabled={savingRow}
            />
          );
        }
        return rowData.name;
      },
    },
    {
      field: 'shortCode',
      header: 'Short Code',
      sortable: true,
      body: (rowData: Job) => {
        const isEditing = editingRow?.id === rowData._id;
        if (isEditing) {
          return (
            <InputText
              value={editingRow.shortCode}
              onChange={(e) => updateEditingField('shortCode', e.target.value)}
              className="p-inputtext-sm w-full"
              disabled={savingRow}
            />
          );
        }
        return rowData.shortCode || '-';
      },
    },
    {
      field: 'displayName',
      header: 'Display Name',
      sortable: true,
      body: (rowData: Job) => {
        const isEditing = editingRow?.id === rowData._id;
        if (isEditing) {
          return (
            <InputText
              value={editingRow.displayName}
              onChange={(e) => updateEditingField('displayName', e.target.value)}
              className="p-inputtext-sm w-full"
              disabled={savingRow}
            />
          );
        }
        return rowData.displayName || '-';
      },
    },
    {
      field: 'route',
      header: 'Route',
      sortable: true,
      body: (rowData: Job) => {
        const isEditing = editingRow?.id === rowData._id;
        if (isEditing) {
          return (
            <InputText
              value={editingRow.route}
              onChange={(e) => updateEditingField('route', e.target.value)}
              className="p-inputtext-sm w-full"
              disabled={savingRow}
            />
          );
        }
        return rowData.route || '-';
      },
    },
    {
      field: 'menuEligible',
      header: 'Menu Eligible',
      sortable: true,
      body: (rowData: Job) => (
        rowData.menuEligible !== false ? (
          <Tag value="Yes" severity="success" />
        ) : (
          <Tag value="No" severity="secondary" />
        )
      ),
    },
    {
      field: 'displayOrder',
      header: 'Display Order',
      sortable: true,
      body: (rowData: Job) => {
        const isEditing = editingRow?.id === rowData._id;
        if (isEditing) {
          return (
            <InputNumber
              value={editingRow.displayOrder}
              onValueChange={(e) => updateEditingField('displayOrder', e.value ?? 1)}
              min={1}
              className="p-inputtext-sm w-20"
              disabled={savingRow}
            />
          );
        }
        return rowData.displayOrder ?? '-';
      },
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: Job) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="JobsList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
          </button>
          <Tooltip target="[data-pr-tooltip]" />

          {!((rowData as any).isDelete || rowData.isDeleted) && (
            <>
              {canUpdate && (
                <button
                  className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="JobsList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="JobsList.Action.Delete"
                  data-pr-tooltip="Delete"
                >
                  <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ], [canUpdate, canDelete]);

  return (
    <PermissionGuard jobName={JOB_NAMES.JOBS}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Jobs-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-600 flex items-center justify-center">
              <i className="pi pi-briefcase text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Jobs
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage system jobs with names, short codes, and descriptions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Filter / Control Bar - Compact Inline */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Left side - Search */}
              <div className="flex gap-2 items-center flex-wrap">
                <Input
                  name="search"
                  placeholder="Search..."
                  value={searchText}
                  onChange={(value: string) => setSearchText(value)}
                  testId="JobsList.Search"
                  style={{ minWidth: '180px', width: '180px' }}
                  clearable
                />
              </div>

              {/* Right side - Record count, Export & Refresh */}
              <div className="flex gap-2 items-center flex-shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                </span>
                <ExportButton
                  fetchData={fetchExportData}
                  columns={exportColumns}
                  filename="jobs"
                  testId="JobsList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchJobs(Math.floor(first / pageSize) + 1, pageSize)}
                  loading={loading}
                />
                {canCreate && (
                  <Button
                    label="Create Job"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="JobsList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable from Core */}
          <DataTable
            data={sortedJobs}
            columns={columns}
            loading={loading}
            emptyMessage="No jobs found"
            dataKey="_id"
            paginator
            lazy
            first={first}
            rows={pageSize}
            totalRecords={totalRecords}
            onPage={handlePageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this job? This will mark it as deleted."
          testId="JobsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default JobsList;
