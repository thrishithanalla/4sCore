import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { levelsService, type LevelQueryParams } from '../../services/levels.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { Level } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const LevelsList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'levels',
    basePath: '/levels',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.LEVEL);
  const canUpdate = useCanUpdate(JOB_NAMES.LEVEL);
  const canDelete = useCanDelete(JOB_NAMES.LEVEL);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const fetchLevels = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: LevelQueryParams = {
        page,
        page_size: size,
        include_deleted: false,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      const response = await levelsService.getAll(params);
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      // Sort by levelNumber ascending
      mappedData.sort((a: Level, b: Level) => (a.levelNumber ?? 0) - (b.levelNumber ?? 0));
      setLevels(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch levels:', err);
      showError(extractErrorMessage(err, 'Failed to load levels. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, pageSize, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchLevels(newPage, event.rows);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchLevels(1, pageSize);
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
      await levelsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchLevels();
    } catch (err: any) {
      console.error('Failed to delete level:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete level'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };


  const columns: DataTableColumn<Level>[] = useMemo(() => [
    {
      field: 'levelNumber',
      header: 'Level',
      sortable: true,
      body: (rowData: Level) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {rowData.levelNumber ?? '-'}
        </span>
      ),
    },
    {
      field: 'levelName',
      header: 'Name',
      sortable: true,
      body: (rowData: Level) => (
        <div className="flex items-center gap-2">
          {rowData.levelIcon && (
            <div className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-image text-xs text-gray-500" />
            </div>
          )}
          <span className="font-medium text-gray-900 dark:text-white">{rowData.levelName}</span>
        </div>
      ),
    },
    {
      field: 'levelCode',
      header: 'Code',
      sortable: true,
      body: (rowData: Level) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{rowData.levelCode || '-'}</span>
      ),
    },
    {
      field: 'unitCount',
      header: 'Units',
      sortable: false,
      body: (rowData: Level) => (
        <span className="text-sm text-gray-900 dark:text-white">{rowData.unitCount ?? '-'}</span>
      ),
    },
    {
      field: 'canHaveChildren',
      header: 'Children',
      sortable: false,
      body: (rowData: Level) => (
        rowData.canHaveChildren ? (
          <span className="text-green-600 font-bold">✓</span>
        ) : (
          <span className="text-gray-400">✗</span>
        )
      ),
    },
    {
      field: 'isActive',
      header: 'Status',
      sortable: false,
      body: (rowData: Level) => (
        rowData.isDelete ? (
          <Tag value="Deleted" severity="danger" />
        ) : rowData.isActive === false ? (
          <Tag value="Inactive" severity="warning" />
        ) : (
          <Tag value="Active" severity="success" />
        )
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: Level) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="LevelsList.Action.View"
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
                  data-testid="LevelsList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="LevelsList.Action.Delete"
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
    <PermissionGuard jobName={JOB_NAMES.LEVEL}>
      <Toast ref={toast} position="top-right" />
      <div className="py-8 px-6" data-testid="SCR-Levels-List">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
            Hierarchy Levels
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage hierarchy levels for organizational structure
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          {/* Custom Toolbar */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-3 items-center flex-wrap">
              <Input
                name="search"
                placeholder="Search..."
                value={searchText}
                onChange={(value: string) => setSearchText(value)}
                testId="LevelsList.Search"
                style={{ width: '220px' }}
              />

              <div className="flex gap-2 ml-auto items-center">
                <button
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  onClick={() => fetchLevels(Math.floor(first / pageSize) + 1, pageSize)}
                  disabled={loading}
                  data-testid="LevelsList.Button.Refresh"
                  data-pr-tooltip="Refresh"
                >
                  <i className={`pi pi-refresh text-blue-600 ${loading ? 'pi-spin' : ''}`} style={{ fontSize: '1.125rem' }} />
                </button>

                {canCreate && (
                  <Button
                    label="Create Level"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="LevelsList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable from Core */}
          <DataTable
            data={levels}
            columns={columns}
            loading={loading}
            emptyMessage="No levels found"
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
          message="Are you sure you want to delete this level? This will mark it as deleted."
          testId="LevelsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default LevelsList;
