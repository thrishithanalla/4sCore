import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { InputSwitch } from 'primereact/inputswitch';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { departmentsService, type DepartmentQueryParams } from '../../services/departments.service';
import { useDebounce } from '../../hooks/useDebounce';
import type { Department } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const DepartmentsList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'departments',
    basePath: '/departments',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.DEPARTMENTS);
  const canUpdate = useCanUpdate(JOB_NAMES.DEPARTMENTS);
  const canDelete = useCanDelete(JOB_NAMES.DEPARTMENTS);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
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

  const fetchDepartments = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);
      const params: DepartmentQueryParams = {
        page,
        page_size: size,
        include_deleted: includeDeleted,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await departmentsService.getAll(params);
      const mappedData = (response.data || []).map((dept: any) => ({ ...dept, id: dept._id }));
      setDepartments(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch departments:', err);
      showError(extractErrorMessage(err, 'Failed to load departments. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchDepartments(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchDepartments(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchDepartments(1, pageSize);
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
      await departmentsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchDepartments(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete department:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete department'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleIncludeDeletedToggle = (e: any) => {
    setIncludeDeleted(e.value);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => departmentsService.export(), []);

  const columns: DataTableColumn<Department>[] = useMemo(() => {
    const baseColumns: DataTableColumn<Department>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
      },
      {
        field: 'shortCode',
        header: 'Short Code',
        sortable: true,
        body: (rowData: Department) => rowData.shortCode || '-',
      },
      {
        field: 'cctnsDepartmentCd',
        header: 'CCTNS Department Code',
        sortable: true,
        body: (rowData: Department) => rowData.cctnsDepartmentCd || '-',
      },
      {
        field: 'createdAt',
        header: 'Created At',
        sortable: true,
        body: (rowData: Department) =>
          rowData.createdAt ? new Date(rowData.createdAt).toLocaleDateString() : '-',
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: Department) => (
          (rowData as any).isDelete || rowData.isDeleted ? (
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
      body: (rowData: Department) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors action-view-btn"
              onClick={() => handleView(rowData._id)}
              data-testid="DepartmentsList.Action.View"
              data-pr-tooltip="View"
              data-pr-position="top"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>

            {!isDeleted && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors action-edit-btn"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="DepartmentsList.Action.Edit"
                    data-pr-tooltip="Edit"
                    data-pr-position="top"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors action-delete-btn"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="DepartmentsList.Action.Delete"
                    data-pr-tooltip="Delete"
                    data-pr-position="top"
                  >
                    <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}
              </>
            )}
          </div>
        );
      },
    });

    return baseColumns;
  }, [canUpdate, canDelete, includeDeleted]);

  return (
    <PermissionGuard jobName={JOB_NAMES.DEPARTMENTS}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Departments-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center">
              <i className="pi pi-building text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Departments
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage departments and their CCTNS codes
          </p>
        </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Filter / Control Bar - Sticky */}
        <div className="px-3 py-2 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left side - All filters grouped together */}
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                name="search"
                placeholder="Search..."
                value={searchText}
                onChange={(value: string) => setSearchText(value)}
                testId="DepartmentsList.Search"
                style={{ minWidth: '180px', width: '180px' }}
                clearable
              />

              {canDelete && (
                <div className="flex items-center gap-2">
                  <InputSwitch
                    checked={includeDeleted}
                    onChange={handleIncludeDeletedToggle}
                    data-testid="DepartmentsList.Toggle.IncludeDeleted"
                  />
                  <label className="text-xs text-gray-700 dark:text-gray-300">Show Deleted</label>
                </div>
              )}
            </div>

            {/* Right side - Record count, Export & Refresh */}
            <div className="flex gap-2 items-center flex-shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
              </span>
              <ExportDataButton
                fetchBlob={fetchExportBlob}
                filename="departments-export.xlsx"
                testId="DepartmentsList.Button.Export"
              />
              <RefreshButton
                onClick={() => fetchDepartments(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                loading={loading}
              />
              {canCreate && (
                <Button
                  label="Create Department"
                  icon="pi pi-plus"
                  onClick={() => navigateToCreate()}
                  testId="DepartmentsList.Button.Create"
                  size="small"
                />
              )}
            </div>
          </div>
        </div>

        {/* DataTable from Core */}
        <DataTable
          data={departments}
          columns={columns}
          loading={loading}
          emptyMessage="No departments found"
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
          message="Are you sure you want to delete this department? This will mark it as deleted."
          testId="DepartmentsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default DepartmentsList;
