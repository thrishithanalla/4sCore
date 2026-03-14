import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { InputSwitch } from 'primereact/inputswitch';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useQuery } from '@tanstack/react-query';
import { unitVillagesService, type UnitVillageQueryParams } from '../../services/unit-villages.service';
import { masterService } from '../../services/master.service';
import { api } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { UnitVillage } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const UnitVillagesList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'unit-villages',
    basePath: '/unit-villages',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.UNIT_VILLAGES);
  const canUpdate = useCanUpdate(JOB_NAMES.UNIT_VILLAGES);
  const canDelete = useCanDelete(JOB_NAMES.UNIT_VILLAGES);
  const [unitVillages, setUnitVillages] = useState<UnitVillage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [unitIdFilter, setUnitIdFilter] = useState<string>('');
  const [mandalIdFilter, setMandalIdFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Debounce search text with 500ms (changed from 3000ms)
  const debouncedSearchText = useDebounce(searchText, 500);

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Fetch dropdown data
  const { data: units = [] } = useQuery({
    queryKey: ['units', 'dropdown'],
    queryFn: masterService.getUnitsForDropdown,
  });

  // Fetch mandals for dropdown
  const { data: mandals = [] } = useQuery({
    queryKey: ['mandals', 'dropdown'],
    queryFn: async () => {
      const response = await api.get<{ data: any[] }>('/api/v1/mandals/list?include_deleted=false');
      return response.data.data || [];
    },
  });

  // Fetch unit villages with filters
  const fetchUnitVillages = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      // Build query parameters
      const params: UnitVillageQueryParams = {
        page,
        page_size: size,
      };

      if (includeDeleted) {
        params.include_deleted = true;
      }

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      if (unitIdFilter && unitIdFilter.trim()) {
        params.unitId = unitIdFilter.trim();
      }

      if (mandalIdFilter && mandalIdFilter.trim()) {
        params.mandalId = mandalIdFilter.trim();
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await unitVillagesService.getAll(params);
      // Map _id to id for DataGrid compatibility
      const mappedData = (response.data || []).map(uv => ({ ...uv, id: uv._id }));
      setUnitVillages(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch unit villages:', err);
      showError(extractErrorMessage(err, 'Failed to load unit villages. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, unitIdFilter, mandalIdFilter, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchUnitVillages(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchUnitVillages(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchUnitVillages(1, pageSize);
  }, [includeDeleted, debouncedSearchText, unitIdFilter, mandalIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedMappingId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedMappingId) return;

    try {
      setDeleteLoading(true);
      await unitVillagesService.delete(selectedMappingId);
      setDeleteDialogOpen(false);
      setSelectedMappingId(null);
      fetchUnitVillages(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete unit village mapping:', err);
      setDeleteDialogOpen(false);
      setSelectedMappingId(null);
      showError(extractErrorMessage(err, 'Failed to delete mapping'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedMappingId(null);
  };

  const handleIncludeDeletedToggle = () => {
    setIncludeDeleted(!includeDeleted);
  };

  const handleClearFilters = () => {
    setSearchText('');
    setUnitIdFilter('');
    setMandalIdFilter('');
    setIncludeDeleted(false);
  };

  // Prepare dropdown options - show names but use IDs
  const unitOptions = [
    { label: 'All Units', value: '' },
    ...units.map(unit => ({
      value: unit._id,
      label: unit.name || unit.policeReferenceId || unit._id,
    })),
  ];

  const mandalOptions = [
    { label: 'All Mandals', value: '' },
    ...mandals.map(mandal => ({
      value: mandal._id,
      label: mandal.mandalName || mandal._id,
    })),
  ];

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => unitVillagesService.export(), []);

  const columns: DataTableColumn<UnitVillage>[] = useMemo(() => {
    const baseColumns: DataTableColumn<UnitVillage>[] = [
      {
        field: 'villageName',
        header: 'Village Name',
        sortable: true,
        body: (rowData: UnitVillage) => rowData.villageName || rowData.village || '-',
      },
      {
        field: 'villageCode',
        header: 'Village Code',
        sortable: true,
        body: (rowData: UnitVillage) => rowData.villageCode || '-',
      },
      {
        field: 'unit',
        header: 'Unit',
        sortable: false,
        body: (rowData: UnitVillage) => rowData.unit?.name || '-',
      },
      {
        field: 'mandal',
        header: 'Mandal',
        sortable: false,
        body: (rowData: UnitVillage) => rowData.mandal?.mandalName || rowData.mandal || '-',
      },
      {
        field: 'createdAt',
        header: 'Created At',
        sortable: true,
        body: (rowData: UnitVillage) =>
          rowData.createdAt ? new Date(rowData.createdAt).toLocaleDateString() : '-',
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: UnitVillage) => (
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
      body: (rowData: UnitVillage) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="UnitVillagesList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target="[data-pr-tooltip]" />

            {!isDeleted && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="UnitVillagesList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="UnitVillagesList.Action.Delete"
                    data-pr-tooltip="Delete"
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
    <PermissionGuard jobName={JOB_NAMES.UNIT_VILLAGES}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-UnitVillages-List">
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-teal-600 flex items-center justify-center">
              <i className="pi pi-home text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Unit Villages Management
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage village-to-unit mappings and jurisdictions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Toolbar: Filters and Actions */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Left side - All filters grouped together */}
              <div className="flex gap-2 items-center flex-wrap">
                <Input
                  name="search"
                  placeholder="Search by village name..."
                  value={searchText}
                  onChange={(value) => setSearchText(value)}
                  testId="UnitVillagesList.Search"
                  style={{ width: '180px' }}
                  clearable
                />

                <Dropdown
                  value={unitIdFilter}
                  options={unitOptions}
                  onChange={(e) => setUnitIdFilter(String(e.value || ''))}
                  placeholder="Unit"
                  style={{ width: '150px' }}
                  data-testid="UnitVillagesList.Filter.Unit"
                  resetFilterOnHide={true}
                />

                <Dropdown
                  value={mandalIdFilter}
                  options={mandalOptions}
                  onChange={(e) => setMandalIdFilter(String(e.value || ''))}
                  placeholder="Mandal"
                  style={{ width: '150px' }}
                  data-testid="UnitVillagesList.Filter.Mandal"
                  resetFilterOnHide={true}
                />

                {canDelete && (
                  <div className="flex items-center gap-2">
                    <InputSwitch
                      checked={includeDeleted}
                      onChange={handleIncludeDeletedToggle}
                      data-testid="UnitVillagesList.Toggle.IncludeDeleted"
                    />
                    <label className="text-sm text-gray-700 dark:text-gray-300">Show Deleted</label>
                  </div>
                )}
              </div>

              {/* Right side - Record count, Export, Refresh & Create */}
              <div className="flex gap-2 items-center flex-shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                </span>
                <ExportDataButton
                  fetchBlob={fetchExportBlob}
                  filename="unit-villages-export.xlsx"
                  testId="UnitVillagesList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchUnitVillages(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                  loading={loading}
                  testId="UnitVillagesList.Button.Refresh"
                />

                {canCreate && (
                  <Button
                    label="Create Mapping"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="UnitVillagesList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable from Core */}
          <DataTable
            data={unitVillages}
            columns={columns}
            loading={loading}
            emptyMessage="No unit villages found"
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
          message="Are you sure you want to delete this unit-village mapping? This action will mark the mapping as deleted."
          testId="UnitVillagesList.Dialog.Delete"
          loading={deleteLoading}
        />

      </div>
    </PermissionGuard>
  );
};

export default UnitVillagesList;
