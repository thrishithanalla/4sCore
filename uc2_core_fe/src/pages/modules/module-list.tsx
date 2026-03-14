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
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { modulesService, type ModuleQueryParams } from '../../services/modules.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import type { Module } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const ModulesList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'modules',
    basePath: '/modules',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.MODULES);
  const canUpdate = useCanUpdate(JOB_NAMES.MODULES);
  const canDelete = useCanDelete(JOB_NAMES.MODULES);
  const [modules, setModules] = useState<Module[]>([]);
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

  const fetchModules = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);
      const params: ModuleQueryParams = {
        page,
        page_size: size,
        include_deleted: false,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await modulesService.getAll(params);
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      setModules(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch modules:', err);
      showError(extractErrorMessage(err, 'Failed to load modules. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchModules(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchModules(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchModules(1, pageSize);
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
      await modulesService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchModules(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete module:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete module'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => modulesService.export(), []);

  const columns: DataTableColumn<Module>[] = useMemo(() => [
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
      field: 'displayOrder',
      header: 'Order',
      sortable: true,
      body: (rowData: Module) => rowData.displayOrder ?? 1,
    },
    {
      field: 'jobCount',
      header: 'Jobs',
      sortable: true,
      body: (rowData: Module) => {
        const count = rowData.jobCount ?? rowData.jobs?.length ?? 0;
        return (
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${count > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {count}
          </span>
        );
      },
    },
    {
      field: 'description',
      header: 'Description',
      sortable: true,
      body: (rowData: Module) => (
        <span className="truncate max-w-[200px] block" title={rowData.description || ''}>
          {rowData.description || '-'}
        </span>
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: Module) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="ModulesList.Action.View"
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
                  data-testid="ModulesList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="ModulesList.Action.Delete"
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
    <PermissionGuard jobName={JOB_NAMES.MODULES}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Modules-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-violet-600 flex items-center justify-center">
              <i className="pi pi-box text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Modules
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage system modules with names, short codes, and descriptions
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
                testId="ModulesList.Search"
                style={{ minWidth: '180px', width: '180px' }}
                clearable
              />
            </div>

            {/* Right side - Record count, Export & Refresh */}
            <div className="flex gap-2 items-center flex-shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
              </span>
              <ExportDataButton
                fetchBlob={fetchExportBlob}
                filename="modules-export.xlsx"
                testId="ModulesList.Button.Export"
              />
              <RefreshButton
                onClick={() => fetchModules(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                loading={loading}
              />

              {canCreate && (
                <Button
                  label="Create Module"
                  icon="pi pi-plus"
                  onClick={() => navigateToCreate()}
                  testId="ModulesList.Button.Create"
                  size="small"
                />
              )}
            </div>
          </div>
        </div>

        {/* DataTable from Core */}
        <DataTable
          data={modules}
          columns={columns}
          loading={loading}
          emptyMessage="No modules found"
          dataKey="_id"
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

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this module? This will mark it as deleted."
          testId="ModulesList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default ModulesList;
