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
import { permissionsService, type PermissionQueryParams } from '../../services/permissions.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import type { Permission } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const PermissionsList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'permissions',
    basePath: '/permissions',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.PERMISSIONS);
  const canUpdate = useCanUpdate(JOB_NAMES.PERMISSIONS);
  const canDelete = useCanDelete(JOB_NAMES.PERMISSIONS);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const fetchPermissions = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: PermissionQueryParams = {
        page,
        page_size: size,
        include_deleted: false,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      const response = await permissionsService.getAll(params);
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      setPermissions(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch permissions:', err);
      showError(extractErrorMessage(err, 'Failed to load permissions. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, pageSize, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchPermissions(newPage, event.rows);
  };

  // Handle sort event
  const handleSort = (event: any) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  // Apply client-side sorting to current page data
  const sortedPermissions = useMemo(() => {
    if (!sortField || !sortOrder) return permissions;
    return [...permissions].sort((a: any, b: any) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      if (aValue == null) return sortOrder;
      if (bValue == null) return -sortOrder;
      if (typeof aValue === 'string') {
        return sortOrder * aValue.localeCompare(bValue);
      }
      return sortOrder * (aValue - bValue);
    });
  }, [permissions, sortField, sortOrder]);

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchPermissions(1, pageSize);
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
      await permissionsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchPermissions();
    } catch (err: any) {
      console.error('Failed to delete permission:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete permission'));
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
    { field: 'description', header: 'Description' },
    { field: 'createdAt', header: 'Created At' },
  ], []);

  // Fetch all data for export (called by ExportButton)
  const fetchExportData = useCallback(async (): Promise<Permission[]> => {
    const params: Omit<PermissionQueryParams, 'page' | 'page_size'> = {
      include_deleted: false,
    };
    if (debouncedSearchText?.trim()) {
      params.search = debouncedSearchText.trim();
    }
    return permissionsService.getAllForExport(params);
  }, [debouncedSearchText]);

  const columns: DataTableColumn<Permission>[] = useMemo(() => [
    {
      field: 'name',
      header: 'Name',
      sortable: true,
    },
    {
      field: 'shortCode',
      header: 'Short Code',
      sortable: true,
    },
    {
      field: 'description',
      header: 'Description',
      sortable: true,
    },
    {
      field: 'createdAt',
      header: 'Created At',
      sortable: true,
      body: (rowData: Permission) =>
        rowData.createdAt ? new Date(rowData.createdAt).toLocaleDateString() : '-',
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: Permission) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="PermissionsList.Action.View"
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
                  data-testid="PermissionsList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="PermissionsList.Action.Delete"
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
    <PermissionGuard jobName={JOB_NAMES.PERMISSIONS}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Permissions-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center">
              <i className="pi pi-lock text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Permissions
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage system permissions with names, short codes, and descriptions
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
                  testId="PermissionsList.Search"
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
                  filename="permissions"
                  testId="PermissionsList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchPermissions(Math.floor(first / pageSize) + 1, pageSize)}
                  loading={loading}
                />

                {canCreate && (
                  <Button
                    label="Create Permission"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="PermissionsList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable from Core */}
          <DataTable
            data={sortedPermissions}
            columns={columns}
            loading={loading}
            emptyMessage="No permissions found"
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
          message="Are you sure you want to delete this permission? This will mark it as deleted."
          testId="PermissionsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default PermissionsList;
