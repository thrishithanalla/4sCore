/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
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
import { useAppNavigate } from '../../hooks/useAppNavigate';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import {
  fetchUserRoleMappings,
  deleteUserRoleMapping,
  type UserRoleMapping,
} from '../../services/user-role-mapping.service';
import { extractErrorMessage } from '../../utils/error-handler';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const UserRoleMappingList = () => {
  const navigate = useAppNavigate();
  const location = useLocation();
  const toast = useRef<Toast>(null);

  // Determine base path based on current URL
  const basePath = location.pathname.includes('user-role-permissions')
    ? '/user-role-permissions'
    : '/user-role-mappings';
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'user-role-mappings',
    basePath: basePath,
  });
  const canCreate = useCanCreate(JOB_NAMES.USER_ROLE_PERMISSIONS);
  const canUpdate = useCanUpdate(JOB_NAMES.USER_ROLE_PERMISSIONS);
  const canDelete = useCanDelete(JOB_NAMES.USER_ROLE_PERMISSIONS);
  const [mappings, setMappings] = useState<(UserRoleMapping & { id: string; userName: string; roleName: string; unitName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Helper to get user display name
  const getUserName = (user: any): string => {
    if (user?.name) return user.name;
    if (user?.firstName && user?.lastName) return `${user.firstName} ${user.lastName}`;
    if (user?.firstName) return user.firstName;
    if (user?.lastName) return user.lastName;
    return '';
  };

  const loadMappings = async () => {
    try {
      setLoading(true);
      const data = await fetchUserRoleMappings();
      // Add id field and flatten nested fields for sorting
      setMappings(data.map((mapping) => ({
        ...mapping,
        id: mapping._id,
        // Flatten nested fields for proper sorting
        userName: getUserName(mapping.user),
        roleName: mapping.role?.name || '',
        unitName: mapping.unit?.name || '',
      })));
    } catch (err: any) {
      console.error('Failed to load user role mappings:', err);
      showError(extractErrorMessage(err, 'Failed to load user role mappings'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, []);

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedId(String(id));
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;
    try {
      setDeleteLoading(true);
      await deleteUserRoleMapping(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      loadMappings();
    } catch (err: any) {
      console.error('Failed to delete user role mapping:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete user role mapping'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleRefresh = () => {
    loadMappings();
  };

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'userName', header: 'Personnel' },
    { field: 'roleName', header: 'Role' },
    { field: 'unitName', header: 'Unit' },
    { field: 'createdAt', header: 'Created At' },
  ], []);

  // Filter rows based on search text
  const filteredRows = useMemo(() => {
    if (!searchText) return mappings;
    const lowerSearch = searchText.toLowerCase();
    return mappings.filter((row) => {
      return (
        (row.userName || '').toLowerCase().includes(lowerSearch) ||
        (row.roleName || '').toLowerCase().includes(lowerSearch) ||
        (row.unitName || '').toLowerCase().includes(lowerSearch)
      );
    });
  }, [mappings, searchText]);

  // Fetch export data (uses client-side filtered rows)
  const fetchExportData = useCallback(async () => {
    return filteredRows;
  }, [filteredRows]);

  // Helper to count permissions
  const countPermissions = (permissions: any[]): number => {
    if (!permissions) return 0;
    return permissions.reduce(
      (acc: number, module: any) =>
        acc + (module.jobs?.reduce((jAcc: number, job: any) => jAcc + (job.permissions?.length || 0), 0) || 0),
      0
    );
  };

  const columns: DataTableColumn<UserRoleMapping & { id: string; userName: string; roleName: string; unitName: string }>[] = useMemo(
    () => [
      {
        field: 'userName',
        header: 'Personnel',
        sortable: true,
        body: (rowData: any) => rowData.userName || '-',
      },
      {
        field: 'roleName',
        header: 'Role',
        sortable: true,
        body: (rowData: any) => rowData.roleName || '-',
      },
      {
        field: 'unitName',
        header: 'Unit',
        sortable: true,
        body: (rowData: any) => rowData.unitName || '-',
      },
      {
        field: 'additionalPermissions',
        header: 'Additional Permissions',
        sortable: false,
        body: (rowData: any) => {
          const count = countPermissions(rowData.additionalPermissions);
          return count > 0 ? (
            <Tag value={`${count} permissions`} severity="success" />
          ) : (
            <span className="text-gray-500 dark:text-gray-400">None</span>
          );
        },
      },
      {
        field: 'exclusionPermissions',
        header: 'Excluded Permissions',
        sortable: false,
        body: (rowData: any) => {
          const count = countPermissions(rowData.exclusionPermissions);
          return count > 0 ? (
            <Tag value={`${count} excluded`} severity="warning" />
          ) : (
            <span className="text-gray-500 dark:text-gray-400">None</span>
          );
        },
      },
      {
        field: 'createdAt',
        header: 'Created',
        sortable: true,
        body: (rowData: any) =>
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
        body: (rowData: any) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="UserRoleMappingList.Action.View"
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
                    data-testid="UserRoleMappingList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="UserRoleMappingList.Action.Delete"
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
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName={JOB_NAMES.USER_ROLE_PERMISSIONS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4" data-testid="SCR-UserRoleMapping-List">
        <div className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <i className="pi pi-users" style={{ fontSize: '1rem', color: 'white' }} />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              User Role Mappings
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-11">
            Manage user role assignments with additional and excluded permissions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        {/* Custom Toolbar */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-3 items-center flex-wrap">
            <Input
              name="search"
              placeholder="Search..."
              value={searchText}
              onChange={(value: string) => setSearchText(value)}
              testId="UserRoleMappingList.Search"
              style={{ width: '220px' }}
              clearable
            />

            <div className="flex gap-2 ml-auto items-center">
              <button
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                onClick={handleRefresh}
                disabled={loading}
                data-testid="UserRoleMappingList.Button.Refresh"
                data-pr-tooltip="Refresh"
              >
                <i className={`pi pi-refresh text-blue-600 ${loading ? 'pi-spin' : ''}`} style={{ fontSize: '1.125rem' }} />
              </button>

              {canCreate && (
                <Button
                  label="Assign Role to User"
                  icon="pi pi-plus"
                  onClick={() => navigate(`${basePath}/create`)}
                  testId="UserRoleMappingList.Button.Create"
                  size="small"
                />
              )}
            </div>
          </div>
        </div>

        {/* DataTable from Core */}
        <DataTable
          data={filteredRows}
          columns={columns}
          loading={loading}
          emptyMessage="No user role mappings found"
          dataKey="_id"
        />
      </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this user role mapping? This action cannot be undone."
          testId="UserRoleMappingList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default UserRoleMappingList;
