import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { InputSwitch } from 'primereact/inputswitch';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { postRoleMappingsService } from '../../services/post-role-mappings.service';
import type { PostRoleMappingQueryParams } from '../../types/post-role-mapping.types';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { PostRoleMapping } from '../../types/post-role-mapping.types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import RestoreConfirmDialog from '../../components/dialogs/restore-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const PostRoleMappingsList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'post-role-mappings',
    basePath: '/post-role-mappings',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.POST_ROLE_MAPPINGS);
  const canUpdate = useCanUpdate(JOB_NAMES.POST_ROLE_MAPPINGS);
  const canDelete = useCanDelete(JOB_NAMES.POST_ROLE_MAPPINGS);

  const [mappings, setMappings] = useState<PostRoleMapping[]>([]);
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

  // Debounce search text (500ms delay)
  const debouncedSearchText = useDebounce(searchText, 500);

  const fetchMappings = useCallback(
    async (page: number = 1, size: number = pageSize) => {
      try {
        setLoading(true);

        const params: PostRoleMappingQueryParams = {
          page,
          page_size: size,
        };

        if (includeDeleted) {
          params.include_deleted = true;
        }

        if (debouncedSearchText?.trim()) {
          params.search = debouncedSearchText.trim();
        }

        const response = await postRoleMappingsService.getAll(params);

        // Debug: Log the API response to see the actual data structure
        console.log('[PostRoleMappingsList] API Response:', response);
        console.log('[PostRoleMappingsList] First mapping:', response.data?.[0]);

        const mappedData = (response.data || []).map((mapping) => ({
          ...mapping,
          id: mapping._id,
        }));

        setMappings(mappedData);
        const total =
          response.pagination?.totalItems ??
          (response.pagination as any)?.total ??
          0;
        setTotalRecords(total);
      } catch (error: any) {
        console.error('Failed to fetch post role mappings:', error);
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: extractErrorMessage(
            error,
            'Failed to load post role mappings. Please try again.'
          ),
          life: 10000,
        });
      } finally {
        setLoading(false);
      }
    },
    [includeDeleted, debouncedSearchText, pageSize]
  );

  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchMappings(newPage, event.rows);
  };

  useEffect(() => {
    setFirst(0);
    fetchMappings(1, pageSize);
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
      await postRoleMappingsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Post role mapping deleted successfully',
        life: 3000,
      });
      fetchMappings();
    } catch (error: any) {
      console.error('Failed to delete post role mapping:', error);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to delete post role mapping'),
        life: 10000,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!selectedId) return;

    try {
      await postRoleMappingsService.restore(selectedId);
      setRestoreDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Post role mapping restored successfully',
        life: 3000,
      });
      fetchMappings();
    } catch (error: any) {
      console.error('Failed to restore post role mapping:', error);
      setRestoreDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to restore post role mapping'),
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

  const columns: DataTableColumn<PostRoleMapping>[] = useMemo(
    () => [
      {
        field: 'postName',
        header: 'Post Name',
        sortable: true,
        body: (rowData: PostRoleMapping) => (
          <span className="font-medium text-gray-900 dark:text-white">
            {rowData.postName || '-'}
          </span>
        ),
      },
      {
        field: 'systemRoleName',
        header: 'System Role',
        sortable: true,
        body: (rowData: PostRoleMapping) => (
          <div className="flex flex-col">
            <span className="text-sm text-gray-900 dark:text-white">
              {rowData.systemRoleName || '-'}
            </span>
            {rowData.systemRoleShortCode && (
              <Tag
                value={rowData.systemRoleShortCode}
                severity="info"
                className="mt-1 w-fit"
              />
            )}
          </div>
        ),
      },
      {
        field: 'additionalPermissions',
        header: 'Additional',
        sortable: false,
        body: (rowData: PostRoleMapping) => {
          const count = rowData.additionalPermissions?.length || 0;
          return (
            <Tag
              value={`${count} module${count !== 1 ? 's' : ''}`}
              severity={count > 0 ? 'success' : 'secondary'}
            />
          );
        },
      },
      {
        field: 'exclusionPermissions',
        header: 'Exclusions',
        sortable: false,
        body: (rowData: PostRoleMapping) => {
          const count = rowData.exclusionPermissions?.length || 0;
          return (
            <Tag
              value={`${count} module${count !== 1 ? 's' : ''}`}
              severity={count > 0 ? 'warning' : 'secondary'}
            />
          );
        },
      },
      {
        field: 'isDelete',
        header: 'Status',
        sortable: false,
        body: (rowData: PostRoleMapping) =>
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
        body: (rowData: PostRoleMapping) =>
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
        body: (rowData: PostRoleMapping) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 cursor-pointer"
              style={{ background: 'none', border: 'none', outline: 'none' }}
              onClick={() => handleView(rowData._id)}
              data-testid="PostRoleMappingsList.Action.View"
              data-pr-tooltip="View"
            >
              <i
                className="pi pi-eye text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                style={{ fontSize: '1.125rem' }}
              />
            </button>
            <Tooltip target="[data-pr-tooltip]" />

            {!rowData.isDelete && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 cursor-pointer"
                    style={{ background: 'none', border: 'none', outline: 'none' }}
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="PostRoleMappingsList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i
                      className="pi pi-pencil text-blue-600 hover:text-blue-800"
                      style={{ fontSize: '1.125rem' }}
                    />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 cursor-pointer"
                    style={{ background: 'none', border: 'none', outline: 'none' }}
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="PostRoleMappingsList.Action.Delete"
                    data-pr-tooltip="Delete"
                  >
                    <i
                      className="pi pi-trash text-red-600 hover:text-red-800"
                      style={{ fontSize: '1.125rem' }}
                    />
                  </button>
                )}
              </>
            )}

            {rowData.isDelete && canDelete && (
              <button
                className="p-2 cursor-pointer"
                style={{ background: 'none', border: 'none', outline: 'none' }}
                onClick={() => handleRestoreClick(rowData._id)}
                data-testid="PostRoleMappingsList.Action.Restore"
                data-pr-tooltip="Restore"
              >
                <i
                  className="pi pi-refresh text-green-600 hover:text-green-800"
                  style={{ fontSize: '1.125rem' }}
                />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName={JOB_NAMES.POST_ROLE_MAPPINGS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-8 px-6" data-testid="SCR-PostRoleMappings-List">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
            Post Role Mappings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage post to system role mappings with customizable permissions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          {/* Custom Toolbar */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-3 items-center flex-wrap">
              <Input
                name="search"
                placeholder="Search by post or role name..."
                value={searchText}
                onChange={(value: any) => setSearchText(value)}
                testId="PostRoleMappingsList.Search"
                style={{ width: '280px' }}
              />

              {canDelete && (
                <div className="flex items-center gap-2">
                  <InputSwitch
                    checked={includeDeleted}
                    onChange={handleIncludeDeletedToggle}
                    data-testid="PostRoleMappingsList.Toggle.IncludeDeleted"
                  />
                  <label className="text-sm text-gray-700 dark:text-gray-300">
                    Show Deleted
                  </label>
                </div>
              )}

              <div className="flex gap-2 ml-auto items-center">
                <button
                  className="p-2 cursor-pointer disabled:opacity-50"
                  style={{ background: 'none', border: 'none', outline: 'none' }}
                  onClick={() => fetchMappings()}
                  disabled={loading}
                  data-testid="PostRoleMappingsList.Button.Refresh"
                  data-pr-tooltip="Refresh"
                >
                  <i
                    className={`pi pi-refresh text-blue-600 hover:text-blue-800 ${
                      loading ? 'pi-spin' : ''
                    }`}
                    style={{ fontSize: '1.125rem' }}
                  />
                </button>

                {canCreate && (
                  <Button
                    label="Create Mapping"
                    icon="pi pi-plus"
                    onClick={() => navigate('/post-role-mappings/create')}
                    testId="PostRoleMappingsList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable */}
          <DataTable
            data={mappings}
            columns={columns}
            loading={loading}
            emptyMessage="No post role mappings found"
            dataKey="_id"
            paginator
            lazy
            first={first}
            rows={pageSize}
            totalRecords={totalRecords}
            onPage={handlePageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
          />
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this post role mapping? The linked system role will NOT be deleted."
          testId="PostRoleMappingsList.Dialog.Delete"
          loading={deleteLoading}
        />

        {/* Restore Confirmation Dialog */}
        <RestoreConfirmDialog
          visible={restoreDialogOpen}
          onCancel={handleRestoreCancel}
          onRestore={handleRestoreConfirm}
          message="Are you sure you want to restore this post role mapping?"
          testId="PostRoleMappingsList.Dialog.Restore"
        />
      </div>
    </PermissionGuard>
  );
};

export default PostRoleMappingsList;
