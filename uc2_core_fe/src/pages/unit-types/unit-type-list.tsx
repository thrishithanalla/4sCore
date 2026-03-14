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
import { unitTypesService, type UnitTypeQueryParams } from '../../services/unit-types.service';
import { masterService } from '../../services/master.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { UnitType, Department } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const UnitTypesList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'unit-types',
    basePath: '/unit-types',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.UNIT_TYPE);
  const canUpdate = useCanUpdate(JOB_NAMES.UNIT_TYPE);
  const canDelete = useCanDelete(JOB_NAMES.UNIT_TYPE);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
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

  // Departments map for displaying department names
  const [departmentMap, setDepartmentMap] = useState<Map<string, string>>(new Map());

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Load departments once on mount
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const departments = await masterService.getDepartments();
        setDepartmentMap(new Map(departments.map((d: Department) => [d._id, d.name])));
      } catch (e) {
        console.warn('Failed to load departments', e);
      }
    };
    loadDepartments();
  }, []);

  const fetchUnitTypes = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);
      const params: UnitTypeQueryParams = {
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

      const response = await unitTypesService.getAll(params);
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      setUnitTypes(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch unit types:', err);
      showError(extractErrorMessage(err, 'Failed to load unit types. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchUnitTypes(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchUnitTypes(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchUnitTypes(1, pageSize);
  }, [debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const getDepartmentName = (departmentId?: string) => {
    if (!departmentId) return '-';
    return departmentMap.get(departmentId) ?? departmentId;
  };

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
      await unitTypesService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchUnitTypes(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete unit type:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete unit type'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => unitTypesService.export(), []);

  const columns: DataTableColumn<UnitType>[] = useMemo(() => [
    {
      field: 'name',
      header: 'Name',
      sortable: true,
    },
    {
      field: 'shortCode',
      header: 'Short Code',
      sortable: true,
      body: (rowData: UnitType) => rowData.shortCode || '-',
    },
    {
      field: 'scope',
      header: 'Scope',
      sortable: true,
      body: (rowData: UnitType) => rowData.scope || '-',
    },
    {
      field: 'departmentId',
      header: 'Department',
      sortable: true,
      body: (rowData: UnitType) => getDepartmentName(rowData.departmentId),
    },
    {
      field: 'level',
      header: 'Level',
      sortable: true,
    },
    {
      field: 'createdAt',
      header: 'Created At',
      sortable: true,
      body: (rowData: UnitType) =>
        rowData.createdAt ? new Date(rowData.createdAt).toLocaleDateString() : '-',
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: UnitType) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="UnitTypesList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
          </button>
          <Tooltip target="[data-pr-tooltip]" />

          {!rowData.isDeleted && (
            <>
              {canUpdate && (
                <button
                  className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="UnitTypesList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="UnitTypesList.Action.Delete"
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
  ], [departmentMap, canUpdate, canDelete]);

  return (
    <PermissionGuard jobName={JOB_NAMES.UNIT_TYPE}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-UnitTypes-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-cyan-600 flex items-center justify-center">
              <i className="pi pi-sitemap text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Unit Types
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage unit types and their department associations
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
                  testId="UnitTypesList.Search"
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
                  filename="unit-types-export.xlsx"
                  testId="UnitTypesList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchUnitTypes(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                  loading={loading}
                  testId="UnitTypesList.Button.Refresh"
                />

                {canCreate && (
                  <Button
                    label="Create Unit Type"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="UnitTypesList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable */}
          <DataTable
            data={unitTypes}
            columns={columns}
            loading={loading}
            emptyMessage="No unit types found"
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
          message="Are you sure you want to delete this unit type? This will mark it as deleted."
          testId="UnitTypesList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default UnitTypesList;
