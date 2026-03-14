import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { postsService } from '../../services/posts.service';
import { masterService } from '../../services/master.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { PostWithStats, PostQueryParams } from '../../types';
import FormSelect from '../../components/forms/form-select';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import { useQuery } from '@tanstack/react-query';

const PostsList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'posts',
    basePath: '/posts',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.POST);
  const canUpdate = useCanUpdate(JOB_NAMES.POST);
  const canDelete = useCanDelete(JOB_NAMES.POST);

  const [posts, setPosts] = useState<PostWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Pagination states
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Debounce search text
  const debouncedSearchText = useDebounce(searchText, 500);

  // Fetch units for filter dropdown
  const { data: units = [] } = useQuery({
    queryKey: ['units', 'dropdown'],
    queryFn: masterService.getUnitsForDropdown,
  });

  const unitOptions = useMemo(
    () => units.map((u: { _id: string; name: string }) => ({ value: u._id, label: u.name })),
    [units]
  );

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  const fetchPosts = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: PostQueryParams = {
        page,
        page_size: size,
        include_deleted: false,
        is_active: true,
      };

      if (debouncedSearchText?.trim()) {
        params.search = debouncedSearchText.trim();
      }

      if (selectedUnitId) {
        params.unit_id = selectedUnitId;
      }

      const response = await postsService.getAll(params);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      setPosts(mappedData);

      const total = response.pagination?.totalItems ?? (response.pagination as { total?: number })?.total ?? 0;
      setTotalRecords(total);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
      showError(extractErrorMessage(err, 'Failed to load posts. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, selectedUnitId, pageSize, showError]);

  const handlePageChange = (event: { first: number; rows: number }) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchPosts(newPage, event.rows);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchPosts(1, pageSize);
  }, [debouncedSearchText, selectedUnitId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await postsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchPosts();
    } catch (err) {
      console.error('Failed to delete post:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete post'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const columns: DataTableColumn<PostWithStats>[] = useMemo(() => [
    {
      field: 'unitName',
      header: 'Unit',
      sortable: true,
      body: (rowData: PostWithStats) => (
        <span className="text-sm text-gray-900 dark:text-white">{rowData.unitName || '-'}</span>
      ),
      style: { minWidth: '180px' },
    },
    {
      field: 'postName',
      header: 'Post Name',
      sortable: true,
      body: (rowData: PostWithStats) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">{rowData.postName}</span>
          {rowData.isUnitHead && (
            <Tag value="Unit Head" severity="info" className="text-xs whitespace-nowrap" />
          )}
        </div>
      ),
      style: { minWidth: '280px' },
    },
    {
      field: 'postCode',
      header: 'Post Code',
      sortable: true,
      body: (rowData: PostWithStats) => (
        <span className="font-mono font-medium text-gray-900 dark:text-white">
          {rowData.postCode || '-'}
        </span>
      ),
    },
    {
      field: 'sanctioned',
      header: 'Sanctioned',
      sortable: true,
      body: (rowData: PostWithStats) => (
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {rowData.sanctioned ?? 0}
        </span>
      ),
    },
    {
      field: 'filled',
      header: 'Filled',
      sortable: true,
      body: (rowData: PostWithStats) => (
        <span className="text-sm font-medium text-green-600">
          {rowData.filled ?? 0}
        </span>
      ),
    },
    {
      field: 'vacant',
      header: 'Vacant',
      sortable: true,
      body: (rowData: PostWithStats) => (
        <span className={`text-sm font-medium ${(rowData.vacant ?? 0) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
          {rowData.vacant ?? 0}
        </span>
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: PostWithStats) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="PostsList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
          </button>
          <Tooltip target="[data-pr-tooltip]" />

          {!rowData.isDelete && (
            <>
              {canUpdate && (
                <button
                  className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="PostsList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="PostsList.Action.Delete"
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
    <PermissionGuard jobName={JOB_NAMES.POST}>
      <Toast ref={toast} position="top-right" />
      <div className="py-8 px-6" data-testid="SCR-Posts-List">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
            Posts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage posts and positions within organizational units
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          {/* Toolbar */}
          <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between">
              {/* Filters Section */}
              <div className="flex flex-col sm:flex-row gap-4 flex-1 items-end">
                <div style={{ width: '280px' }}>
                  <FormSelect
                    name="unitFilter"
                    label="Filter by Unit"
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    options={unitOptions}
                    placeholder="All Units"
                    showClear={!!selectedUnitId}
                  />
                </div>

                <Input
                  name="search"
                  placeholder="Search by name or code..."
                  value={searchText}
                  onChange={(value: string) => setSearchText(value)}
                  testId="PostsList.Search"
                  style={{ width: '240px' }}
                />
              </div>

              {/* Actions Section */}
              <div className="flex gap-2 items-center">
                <button
                  className="p-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  onClick={() => fetchPosts(Math.floor(first / pageSize) + 1, pageSize)}
                  disabled={loading}
                  data-testid="PostsList.Button.Refresh"
                  data-pr-tooltip="Refresh"
                  title="Refresh"
                >
                  <i className={`pi pi-refresh text-gray-600 dark:text-gray-400 ${loading ? 'pi-spin' : ''}`} style={{ fontSize: '1rem' }} />
                </button>

                {canCreate && (
                  <Button
                    label="Create Post"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="PostsList.Button.Create"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable */}
          <DataTable
            data={posts}
            columns={columns}
            loading={loading}
            emptyMessage="No posts found"
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
          message="Are you sure you want to delete this post? This will mark it as deleted."
          testId="PostsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default PostsList;
