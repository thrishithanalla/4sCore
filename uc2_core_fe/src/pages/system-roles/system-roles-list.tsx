import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { InputSwitch } from 'primereact/inputswitch';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { systemRolesService, type SystemRoleQueryParams } from '../../services/system-roles.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { SystemRole } from '../../types/system-role.types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import RestoreConfirmDialog from '../../components/dialogs/restore-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './system-roles-list.module.css';

const SystemRolesList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'system-roles',
    basePath: '/system-roles',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.SYSTEM_ROLES);
  const canUpdate = useCanUpdate(JOB_NAMES.SYSTEM_ROLES);
  const canDelete = useCanDelete(JOB_NAMES.SYSTEM_ROLES);

  const [systemRoles, setSystemRoles] = useState<SystemRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states for server-side sorting
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<1 | -1 | 0 | undefined>(undefined);

  // Debounce search text (500ms delay)
  const debouncedSearchText = useDebounce(searchText, 500);

  const fetchSystemRoles = useCallback(
    async (
      page: number = 1,
      size: number = pageSize,
      field?: string,
      order?: 1 | -1 | 0
    ) => {
      try {
        setLoading(true);

        // Build query parameters for server-side pagination
        const params: SystemRoleQueryParams = {
          page,
          page_size: size,
        };

        // Only add include_deleted if it's true
        if (includeDeleted) {
          params.include_deleted = true;
        }

        // Add search parameter for server-side search
        if (debouncedSearchText?.trim()) {
          params.search = debouncedSearchText.trim();
        }

        // Add sorting parameters (order 0 means unsorted/removed)
        if (field && order && order !== 0) {
          params.sort_by = field;
          params.sort_order = order === 1 ? 'asc' : 'desc';
        }

        const response = await systemRolesService.getAll(params);

        // Map _id to id for DataGrid compatibility
        const mappedData = (response.data || []).map((role) => ({
          ...role,
          id: role._id,
        }));

        setSystemRoles(mappedData);
        // Handle both totalItems and total for backward compatibility
        const total =
          response.pagination?.totalItems ??
          (response.pagination as any)?.total ??
          0;
        setTotalRecords(total);
      } catch (error: any) {
        console.error('Failed to fetch system roles:', error);
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: extractErrorMessage(
            error,
            'Failed to load system roles. Please try again.'
          ),
          life: 10000,
        });
      } finally {
        setLoading(false);
      }
    },
    [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder]
  );

  // Handle DataTable pagination changes
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchSystemRoles(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort change from DataTable
  const handleSort = (event: any) => {
    const newField = event.sortField;
    const newOrder = event.sortOrder;
    setSortField(newField);
    setSortOrder(newOrder);
    setFirst(0); // Reset to first page on sort
    fetchSystemRoles(1, pageSize, newField, newOrder);
  };

  // Reset to first page and fetch when filters change
  useEffect(() => {
    setFirst(0);
    fetchSystemRoles(1, pageSize, sortField, sortOrder);
  }, [includeDeleted, debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRestoreClick = (id: string | number) => {
    setSelectedId(id as string);
    setRestoreDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;

    try {
      setDeleteLoading(true);
      await systemRolesService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'System role deleted successfully',
        life: 3000,
      });
      fetchSystemRoles(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (error: any) {
      console.error('Failed to delete system role:', error);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to delete system role'),
        life: 10000,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!selectedId) return;

    try {
      await systemRolesService.restore(selectedId);
      setRestoreDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'System role restored successfully',
        life: 3000,
      });
      fetchSystemRoles(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (error: any) {
      console.error('Failed to restore system role:', error);
      setRestoreDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to restore system role'),
        life: 10000,
      });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleRestoreCancel = () => {
    setRestoreDialogOpen(false);
    setSelectedId(null);
  };

  const handleIncludeDeletedToggle = (e: any) => {
    setIncludeDeleted(e.value);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => systemRolesService.export(), []);

  // Memoize columns for DataTable
  const columns: DataTableColumn<SystemRole>[] = useMemo(
    () => [
      {
        field: 'roleName',
        header: 'Role Name',
        sortable: true,
      },
      {
        field: 'roleShortCode',
        header: 'Short Code',
        sortable: true,
        body: (rowData: SystemRole) => (
          <Tag value={rowData.roleShortCode} severity="info" />
        ),
      },
      {
        field: 'description',
        header: 'Description',
        sortable: false,
        body: (rowData: SystemRole) => {
          if (!rowData.description) {
            return <span className="text-gray-400 dark:text-gray-500 text-xs italic">No description</span>;
          }
          return (
            <span className="truncate max-w-xs" title={rowData.description}>
              {rowData.description}
            </span>
          );
        },
      },
      {
        field: 'roleBinding',
        header: 'Permissions',
        sortable: false,
        body: (rowData: SystemRole) => (
          <span className="text-sm font-medium text-blue-600">
            {rowData.roleBinding?.length || 0} module
            {(rowData.roleBinding?.length || 0) !== 1 ? 's' : ''}
          </span>
        ),
      },
      {
        field: 'isActive',
        header: 'Status',
        sortable: false,
        body: (rowData: SystemRole) =>
          rowData.isDelete ? (
            <Tag value="Deleted" severity="danger" />
          ) : (
            <Tag value="Active" severity="success" />
          ),
      },
      {
        field: 'createdAt',
        header: 'Created At',
        sortable: true,
        body: (rowData: SystemRole) =>
          rowData.createdAt
            ? new Date(rowData.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '-',
      },
      {
        field: 'actions',
        header: 'Actions',
      headerStyle: { textAlign: 'center' },
        sortable: false,
        body: (rowData: SystemRole) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="SystemRolesList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>

            {!rowData.isDelete && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="SystemRolesList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="SystemRolesList.Action.Delete"
                    data-pr-tooltip="Delete"
                  >
                    <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}
              </>
            )}

            {rowData.isDelete && canDelete && (
              <button
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleRestoreClick(rowData._id)}
                data-testid="SystemRolesList.Action.Restore"
                data-pr-tooltip="Restore"
              >
                <i className="pi pi-refresh text-blue-600" style={{ fontSize: '1.125rem' }} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName={JOB_NAMES.SYSTEM_ROLES}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-SystemRoles-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-shield" />
            </div>
            <h1 className={styles.title}>System Roles Management</h1>
          </div>
          <p className={styles.subtitle}>
            Manage system roles and module permissions
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
                    placeholder="Search roles..."
                    value={searchText}
                    onChange={(value: any) => setSearchText(value)}
                    testId="SystemRolesList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  {canDelete && (
                    <div className={styles.toggleGroup}>
                      <InputSwitch
                        checked={includeDeleted}
                        onChange={handleIncludeDeletedToggle}
                        data-testid="SystemRolesList.Toggle.IncludeDeleted"
                      />
                      <label className={styles.toggleLabel}>Show Deleted</label>
                    </div>
                  )}
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="system-roles-export.xlsx"
                    testId="SystemRolesList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchSystemRoles(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="SystemRolesList.Button.Refresh"
                  />

                  {canCreate && (
                    <Button
                      label="Create Role"
                      icon="pi pi-plus"
                      onClick={() => navigate('/system-roles/create')}
                      testId="SystemRolesList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={systemRoles}
              columns={columns}
              loading={loading}
              emptyMessage="No system roles found"
              dataKey="_id"
              paginator
              lazy
              first={first}
              rows={pageSize}
              totalRecords={totalRecords}
              onPage={handlePageChange}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sortMode="single"
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
            <Tooltip target="[data-pr-tooltip]" />
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this system role? This action will mark the role as deleted."
          testId="SystemRolesList.Dialog.Delete"
          loading={deleteLoading}
        />

        {/* Restore Confirmation Dialog */}
        <RestoreConfirmDialog
          visible={restoreDialogOpen}
          onCancel={handleRestoreCancel}
          onRestore={handleRestoreConfirm}
          message="Are you sure you want to restore this system role? This will make the role active again."
          testId="SystemRolesList.Dialog.Restore"
        />
      </div>
    </PermissionGuard>
  );
};

export default SystemRolesList;
