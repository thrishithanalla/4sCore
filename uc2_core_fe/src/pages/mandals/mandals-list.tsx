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
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useQuery } from '@tanstack/react-query';
import { mandalsService, type MandalQueryParams } from '../../services/mandals.service';
import { masterService } from '../../services/master.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { Mandal } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const MandalsList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'mandals',
    basePath: '/mandals',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.MANDALS);
  const canUpdate = useCanUpdate(JOB_NAMES.MANDALS);
  const canDelete = useCanDelete(JOB_NAMES.MANDALS);
  const [mandals, setMandals] = useState<Mandal[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMandalId, setSelectedMandalId] = useState<string | null>(null);
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

  // Fetch districts once using react-query with useMemo for options
  const { data: districts = [] } = useQuery({
    queryKey: ['districts', 'dropdown'],
    queryFn: masterService.getDistricts,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Memoize district map for efficient lookup
  const districtMap = useMemo(() => {
    const map = new Map<string, string>();
    districts.forEach(d => map.set(d._id, d.name));
    return map;
  }, [districts]);

  const fetchMandals = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      const params: MandalQueryParams = {
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

      const response = await mandalsService.getAll(params);
      const mappedData = (response.data || []).map(mandal => ({ ...mandal, id: mandal._id }));
      setMandals(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch mandals:', err);
      showError(extractErrorMessage(err, 'Failed to load mandals. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchMandals(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchMandals(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchMandals(1, pageSize);
  }, [includeDeleted, debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedMandalId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedMandalId) return;

    try {
      setDeleteLoading(true);
      await mandalsService.delete(selectedMandalId);
      setDeleteDialogOpen(false);
      setSelectedMandalId(null);
      fetchMandals(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete mandal:', err);
      setDeleteDialogOpen(false);
      setSelectedMandalId(null);
      showError(extractErrorMessage(err, 'Failed to delete mandal'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedMandalId(null);
  };

  const handleIncludeDeletedToggle = () => {
    setIncludeDeleted(!includeDeleted);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => mandalsService.export(), []);

  const columns: DataTableColumn<Mandal>[] = useMemo(() => {
    const baseColumns: DataTableColumn<Mandal>[] = [
      {
        field: 'mandalName',
        header: 'Mandal Name',
        sortable: true,
      },
      {
        field: 'mandalCode',
        header: 'Mandal Code',
        sortable: true,
        body: (rowData: Mandal) => (rowData as any).mandalCode || '-',
      },
      {
        field: 'districtId',
        header: 'District',
        sortable: true,
        body: (rowData: Mandal) => {
          // First try to get from populated district object
          if (rowData.district?.name) return rowData.district.name;
          // Fallback to lookup from districtMap
          return districtMap.get(rowData.districtId) || rowData.districtId || '-';
        },
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: Mandal) => (
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
      body: (rowData: Mandal) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="MandalsList.Action.View"
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
                    data-testid="MandalsList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="MandalsList.Action.Delete"
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
  }, [canUpdate, canDelete, districtMap, includeDeleted]);

  return (
    <PermissionGuard jobName={JOB_NAMES.MANDALS}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Mandals-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-lime-600 flex items-center justify-center">
              <i className="pi pi-map text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Mandals Management
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage mandals and administrative divisions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Filter / Control Bar - Compact Inline */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Left side - All filters grouped together */}
              <div className="flex gap-2 items-center flex-wrap">
                <Input
                  name="search"
                  placeholder="Search..."
                  value={searchText}
                  onChange={(value: string) => setSearchText(value)}
                  testId="MandalsList.Search"
                  style={{ minWidth: '180px', width: '180px' }}
                  clearable
                />

                {canDelete && (
                  <div className="flex items-center gap-2">
                    <InputSwitch
                      checked={includeDeleted}
                      onChange={handleIncludeDeletedToggle}
                      data-testid="MandalsList.Toggle.IncludeDeleted"
                    />
                    <label className="text-xs text-gray-700 dark:text-gray-300">Show Deleted</label>
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
                  filename="mandals-export.xlsx"
                  testId="MandalsList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchMandals(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                  loading={loading}
                />
                {canCreate && (
                  <Button
                    label="Create Mandal"
                    icon="pi pi-plus"
                    onClick={() => navigateToCreate()}
                    testId="MandalsList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable from Core */}
          <DataTable
            data={mandals}
            columns={columns}
            loading={loading}
            emptyMessage="No mandals found"
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
          message="Are you sure you want to delete this mandal? This action will mark the mandal as deleted."
          testId="MandalsList.Dialog.Delete"
          loading={deleteLoading}
        />

      </div>
    </PermissionGuard>
  );
};

export default MandalsList;
