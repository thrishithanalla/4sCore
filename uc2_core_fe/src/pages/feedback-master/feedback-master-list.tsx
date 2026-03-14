import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { InputSwitch } from 'mainFe/InputSwitch';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { RefreshButton } from 'mainFe/RefreshButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { feedbackMasterService, type FeedbackMaster, type FeedbackMasterQueryParams } from '../../services/feedback-master.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const FeedbackMasterList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'feedback-master',
    basePath: '/feedback-master',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.FEEDBACK_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.FEEDBACK_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.FEEDBACK_MASTER);
  const [feedbackMasters, setFeedbackMasters] = useState<FeedbackMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
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

  const fetchFeedbackMasters = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      const params: FeedbackMasterQueryParams = {
        page,
        page_size: size,
      };

      if (includeDeleted) {
        params.include_deleted = true;
      }

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await feedbackMasterService.getAll(params);
      const mappedData = (response.data || []).map(item => ({ ...item, id: item._id }));
      setFeedbackMasters(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: unknown) {
      console.error('Failed to fetch feedback masters:', err);
      showError(extractErrorMessage(err, 'Failed to load feedback masters. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchFeedbackMasters(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchFeedbackMasters(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchFeedbackMasters(1, pageSize);
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

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;

    try {
      setDeleteLoading(true);
      await feedbackMasterService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchFeedbackMasters(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: unknown) {
      console.error('Failed to delete feedback master:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete feedback master'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => feedbackMasterService.export(), []);

  const getComponentTypeTag = (type: string) => {
    const typeConfig: Record<string, { severity: 'info' | 'success' | 'warning' | 'secondary' }> = {
      prompt: { severity: 'info' },
      api: { severity: 'success' },
      function: { severity: 'warning' },
      screen: { severity: 'secondary' },
      component: { severity: 'info' },
    };
    const config = typeConfig[type] || { severity: 'info' };
    const displayLabel = type.charAt(0).toUpperCase() + type.slice(1);
    return <Tag value={displayLabel} severity={config.severity} />;
  };

  const columns: DataTableColumn<FeedbackMaster>[] = useMemo(() => {
    const baseColumns: DataTableColumn<FeedbackMaster>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
      },
      {
        field: 'componentType',
        header: 'Component Type',
        sortable: true,
        body: (rowData: FeedbackMaster) => getComponentTypeTag(rowData.componentType),
      },
      {
        field: 'module.name',
        header: 'Module',
        sortable: true,
        body: (rowData: FeedbackMaster) => rowData.module?.name || '-',
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: FeedbackMaster) => (
          rowData.isDelete ? (
            <Tag value="Deleted" severity="danger" />
          ) : (
            <Tag value="Active" severity="success" />
          )
        ),
      });
    }

    // Always add actions column at the end
    baseColumns.push({
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: FeedbackMaster) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 cursor-pointer"
            style={{ background: 'none', border: 'none', outline: 'none' }}
            onClick={() => handleView(rowData._id)}
            data-testid="FeedbackMasterList.Action.View"
            title="View"
          >
            <i className="pi pi-eye text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200" style={{ fontSize: '1.125rem' }} />
          </button>

          {!rowData.isDelete && (
            <>
              {canUpdate && (
                <button
                  className="p-2 cursor-pointer"
                  style={{ background: 'none', border: 'none', outline: 'none' }}
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="FeedbackMasterList.Action.Edit"
                  title="Edit"
                >
                  <i className="pi pi-pencil text-blue-600 hover:text-blue-800" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 cursor-pointer"
                  style={{ background: 'none', border: 'none', outline: 'none' }}
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="FeedbackMasterList.Action.Delete"
                  title="Delete"
                >
                  <i className="pi pi-trash text-red-600 hover:text-red-800" style={{ fontSize: '1.125rem' }} />
                </button>
              )}
            </>
          )}
        </div>
      ),
    });

    return baseColumns;
  }, [canUpdate, canDelete, includeDeleted]);

  return (
    <PermissionGuard jobName={JOB_NAMES.FEEDBACK_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-FeedbackMaster-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center">
              <i className="pi pi-comments text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Feedback Master
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage feedback configurations for prompts, APIs, and functions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Filter / Control Bar */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Left side - All filters grouped together */}
              <div className="flex gap-2 items-center flex-wrap">
                <Input
                  name="search"
                  placeholder="Search..."
                  value={searchText}
                  onChange={(value: string) => setSearchText(value)}
                  testId="FeedbackMasterList.Search"
                  style={{ minWidth: '180px', width: '180px' }}
                  clearable
                />

                {canDelete && (
                  <InputSwitch
                    checked={includeDeleted}
                    onChange={(e: any) => setIncludeDeleted(e.value)}
                    label="Show Deleted"
                    testId="FeedbackMasterList.Toggle.IncludeDeleted"
                  />
                )}
              </div>

              {/* Right side - Record count, Export & Refresh */}
              <div className="flex gap-2 items-center flex-shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                </span>
                <ExportDataButton
                  fetchBlob={fetchExportBlob}
                  filename="feedback-masters-export.xlsx"
                  testId="FeedbackMasterList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchFeedbackMasters(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                  loading={loading}
                  testId="FeedbackMasterList.Button.Refresh"
                />

                {canCreate && (
                  <Button
                    label="Create Feedback"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="FeedbackMasterList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable */}
          <DataTable
            data={feedbackMasters}
            columns={columns}
            loading={loading}
            emptyMessage="No feedback masters found"
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
          message="Are you sure you want to delete this feedback master? This action will mark it as deleted."
          testId="FeedbackMasterList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default FeedbackMasterList;
