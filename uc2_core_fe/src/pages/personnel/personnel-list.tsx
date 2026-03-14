import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog } from 'mainFe/Dialog';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { InputSwitch } from 'mainFe/InputSwitch';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { RefreshButton } from 'mainFe/RefreshButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { personnelService, type PersonnelQueryParams } from '../../services/personnel.service';
import { ranksService } from '../../services/ranks.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { Personnel } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const PersonnelList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'personnel',
    basePath: '/personnel',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.PERSONNEL);
  const canUpdate = useCanUpdate(JOB_NAMES.PERSONNEL);
  const canDelete = useCanDelete(JOB_NAMES.PERSONNEL);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [allRanks, setAllRanks] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string | null>(null);
  const [selectedPersonnelName, setSelectedPersonnelName] = useState<string | null>(null);

  // Filter states
  const [searchText, setSearchText] = useState<string>('');
  const [rankFilter, setRankFilter] = useState<string>('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [updatingActiveStatus, setUpdatingActiveStatus] = useState<string | null>(null);

  // Active status confirmation dialog state
  const [activeStatusDialogOpen, setActiveStatusDialogOpen] = useState(false);
  const [pendingActiveStatusChange, setPendingActiveStatusChange] = useState<{
    personnelId: string;
    personnelName: string;
    newStatus: boolean;
  } | null>(null);

  // Track which personnel's active status is being updated - DISABLED FOR NOW
  // const [activeStatusLoading, setActiveStatusLoading] = useState<Set<string>>(new Set());

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

  // Fetch all ranks for filter dropdown on mount
  useEffect(() => {
    const fetchAllRanks = async () => {
      try {
        const ranks = await ranksService.getAllForDropdown();
        setAllRanks(ranks);
      } catch (err) {
        console.error('Failed to fetch ranks:', err);
      }
    };
    fetchAllRanks();
  }, []);

  const fetchPersonnel = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      // Build query parameters for server-side pagination
      const params: PersonnelQueryParams = {
        page,
        page_size: size,
        include_deleted: includeDeleted,
        // isActive: true = show active, isActive: false = show inactive
        isActive: !showInactiveOnly,
      };

      // Add search parameter for server-side search (using debounced value)
      if (debouncedSearchText?.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await personnelService.getAll(params);

      // Map _id to id for DataGrid compatibility
      const mappedData = (response.data || []).map(p => ({ ...p, id: p._id }));

      setPersonnel(mappedData);
      // Handle both totalItems and total for backward compatibility
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch personnel:', err);
      showError(extractErrorMessage(err, 'Failed to load personnel. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, showInactiveOnly, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle DataTable pagination changes
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchPersonnel(newPage, event.rows, sortField, sortOrder);
  };

  // Reset to first page and fetch when filters change
  useEffect(() => {
    setFirst(0);
    fetchPersonnel(1, pageSize);
  }, [includeDeleted, showInactiveOnly, debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchPersonnel(1, pageSize, newSortField, newSortOrder);
  };

  // Server-side search, sorting, and isActive filtering is handled in fetchPersonnel
  // Filter by rank client-side
  const filteredPersonnel = useMemo(() => {
    if (!rankFilter) return personnel;
    return personnel.filter(p => p.rank?._id === rankFilter);
  }, [personnel, rankFilter]);

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number, name: string) => {
    setSelectedPersonnelId(id as string);
    setSelectedPersonnelName(name);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPersonnelId) return;

    const personnelName = selectedPersonnelName || 'personnel';

    try {
      setDeleteLoading(true);
      await personnelService.delete(selectedPersonnelId);
      setDeleteDialogOpen(false);
      setSelectedPersonnelId(null);
      setSelectedPersonnelName(null);
      fetchPersonnel(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete personnel:', err);
      setDeleteDialogOpen(false);
      setSelectedPersonnelId(null);
      setSelectedPersonnelName(null);
      // Extract error message and replace the ID with personnel name
      let errorMsg = extractErrorMessage(err, `Failed to delete personnel ${personnelName}`);
      if (selectedPersonnelId && errorMsg.includes(selectedPersonnelId)) {
        errorMsg = errorMsg.replace(selectedPersonnelId, personnelName);
      }
      showError(errorMsg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedPersonnelId(null);
    setSelectedPersonnelName(null);
  };

  // Handle active status toggle - show confirmation dialog first
  const handleActiveStatusToggleClick = (personnelId: string, personnelName: string, newStatus: boolean) => {
    setPendingActiveStatusChange({ personnelId, personnelName, newStatus });
    setActiveStatusDialogOpen(true);
  };

  // Confirm active status change
  const handleActiveStatusConfirm = async () => {
    if (!pendingActiveStatusChange) return;

    const { personnelId, newStatus } = pendingActiveStatusChange;

    try {
      setUpdatingActiveStatus(personnelId);
      setActiveStatusDialogOpen(false);

      await personnelService.updateActiveStatus(personnelId, newStatus);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Personnel ${newStatus ? 'activated' : 'deactivated'} successfully`,
        life: 3000,
      });

      // Refresh data from server to reflect the change (record will appear/disappear based on filter)
      const currentPage = Math.floor(first / pageSize) + 1;
      fetchPersonnel(currentPage, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to update active status:', err);
      showError(extractErrorMessage(err, 'Failed to update active status'));
    } finally {
      setUpdatingActiveStatus(null);
      setPendingActiveStatusChange(null);
    }
  };

  // Cancel active status change
  const handleActiveStatusCancel = () => {
    setActiveStatusDialogOpen(false);
    setPendingActiveStatusChange(null);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => personnelService.export(), []);

  // Get all ranks for filter (fetched from master list)
  const rankOptions = useMemo(() => {
    const options = allRanks
      .map(rank => ({ label: rank.name, value: rank._id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ label: 'All Ranks', value: null }, ...options];
  }, [allRanks]);


  const columns: DataTableColumn<Personnel>[] = useMemo(() => {
    const baseColumns: DataTableColumn<Personnel>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
      },
      {
        field: 'department',
        header: 'Department',
        sortable: false,
        body: (rowData: Personnel) => rowData.department?.name || '-',
      },
      {
        field: 'rank',
        header: 'Rank',
        sortable: false,
        body: (rowData: Personnel) => rowData.rank?.name || '-',
      },
      {
        field: 'assignment',
        header: 'Post',
        sortable: false,
        body: (rowData: Personnel) => {
          const postName = (rowData as any).postName;
          const unitName = (rowData as any).unitName;
          if (postName && unitName) {
            return `${postName}-${unitName}`;
          }
          if (postName) return postName;
          if (unitName) return unitName;
          return '-';
        },
      },
      // Active/Inactive toggle column
      {
        field: 'isActive',
        header: 'Active',
        headerStyle: { textAlign: 'center', width: '100px' },
        sortable: false,
        body: (rowData: Personnel) => {
          const isDeleted = (rowData as any).isDelete;
          const isActive = (rowData as any).isActive !== false; // Default to true if undefined
          const isUpdating = updatingActiveStatus === rowData._id;

          // Don't show switch for deleted records
          if (isDeleted) {
            return <span className="text-gray-400 text-xs">-</span>;
          }

          return (
            <div className="flex justify-center">
              <InputSwitch
                checked={isActive}
                onChange={(e: any) => handleActiveStatusToggleClick(rowData._id, rowData.name || 'this personnel', e.value)}
                disabled={isUpdating || !canUpdate}
                testId={`PersonnelList.Toggle.Active.${rowData._id}`}
              />
              {isUpdating && (
                <i className="pi pi-spin pi-spinner ml-2 text-blue-500" />
              )}
            </div>
          );
        },
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: Personnel) => (
          (rowData as any).isDelete ? (
            <Tag value="Deleted" severity="danger" />
          ) : (
            <Tag value="Active" severity="success" />
          )
        ),
      });
    }

    // Enable User column with toggle - DISABLED FOR NOW
    // if (canUpdate) {
    //   baseColumns.push({
    //     field: 'isActive',
    //     header: 'Enable User',
    //     headerStyle: { textAlign: 'center' },
    //     sortable: false,
    //     body: (rowData: Personnel) => {
    //       const isDeleted = (rowData as any).isDelete;
    //       const isLoading = activeStatusLoading.has(rowData._id);
    //       const isActive = (rowData as any).isActive !== false; // Default to true if undefined

    //       // Don't show toggle for deleted records
    //       if (isDeleted) {
    //         return <span className="text-gray-400">-</span>;
    //       }

    //       return (
    //         <div className="flex justify-center">
    //           {isLoading ? (
    //             <i className="pi pi-spin pi-spinner text-blue-500" style={{ fontSize: '1rem' }} />
    //           ) : (
    //             <InputSwitch
    //               checked={isActive}
    //               onChange={() => handleActiveStatusToggle(rowData._id, isActive)}
    //               data-testid={`PersonnelList.Toggle.EnableUser.${rowData._id}`}
    //               className="input-switch-green"
    //             />
    //           )}
    //         </div>
    //       );
    //     },
    //   });
    // }

    // Always add actions column at the end
    baseColumns.push({
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: Personnel) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 cursor-pointer"
            style={{ background: 'none', border: 'none', outline: 'none' }}
            onClick={() => handleView(rowData._id)}
            data-testid="PersonnelList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200" style={{ fontSize: '1.125rem' }} />
          </button>
          <Tooltip target="[data-pr-tooltip]" />

          {!(rowData as any).isDelete && (
            <>
              {canUpdate && (
                <button
                  className="p-2 cursor-pointer"
                  style={{ background: 'none', border: 'none', outline: 'none' }}
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="PersonnelList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600 hover:text-blue-800" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 cursor-pointer"
                  style={{ background: 'none', border: 'none', outline: 'none' }}
                  onClick={() => handleDeleteClick(rowData._id, rowData.name)}
                  data-testid="PersonnelList.Action.Delete"
                  data-pr-tooltip="Delete"
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
  }, [canUpdate, canDelete, includeDeleted, updatingActiveStatus]);

  return (
    <PermissionGuard jobName={JOB_NAMES.PERSONNEL}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Personnel-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-green-600 flex items-center justify-center">
              <i className="pi pi-users text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Personnel
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage police personnel records, ranks, and assignments
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
                  placeholder="Search by name, User ID"
                  value={searchText}
                  onChange={(value: string) => setSearchText(value)}
                  testId="PersonnelList.Search"
                  style={{ minWidth: '220px', width: '220px' }}
                  clearable
                  info="Search by: Name and User ID"
                />

                <Dropdown
                  value={rankFilter || null}
                  options={rankOptions}
                  onChange={(e: any) => {
                    const selectedValue = e.value?.value !== undefined ? e.value.value : e.value;
                    const newValue = selectedValue === null || selectedValue === undefined ? '' : selectedValue;
                    setRankFilter(newValue);
                  }}
                  placeholder="Rank"
                  style={{ minWidth: '200px', width: '200px' }}
                  data-testid="PersonnelList.Filter.Rank"
                  resetFilterOnHide={true}
                />

              <InputSwitch
                checked={showInactiveOnly}
                onChange={(e: any) => setShowInactiveOnly(e.value)}
                label="Show Inactive Only"
                testId="PersonnelList.Toggle.ShowInactiveOnly"
              />

              {canDelete && (
                <InputSwitch
                  checked={includeDeleted}
                  onChange={(e: any) => setIncludeDeleted(e.value)}
                  label="Show Deleted"
                  testId="PersonnelList.Toggle.IncludeDeleted"
                />
              )}
            </div>

            {/* Right: Record count, Export, Refresh and Create */}
            <div className="flex gap-2 items-center flex-shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
              </span>
              <ExportDataButton
                fetchBlob={fetchExportBlob}
                filename="personnel-export.xlsx"
                testId="PersonnelList.Button.Export"
              />
              <RefreshButton
                onClick={() => fetchPersonnel(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                loading={loading}
                testId="PersonnelList.Button.Refresh"
              />

              {canCreate && (
                <Button
                  label="Create Personnel"
                  icon="pi pi-user-plus"
                  onClick={() => navigate('/user-onboarding')}
                  testId="PersonnelList.Button.Onboarding"
                  size="small"
                />
              )}
            </div>
          </div>
        </div>

          {/* DataTable from Core */}
          <DataTable
            data={filteredPersonnel}
            columns={columns}
            loading={loading}
            emptyMessage="No personnel found"
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
          message="Are you sure you want to delete this personnel record? This action cannot be undone."
          testId="PersonnelList.Dialog.Delete"
          loading={deleteLoading}
        />

        {/* Active Status Confirmation Dialog */}
        <Dialog
          visible={activeStatusDialogOpen}
          onHide={handleActiveStatusCancel}
          header={pendingActiveStatusChange?.newStatus ? 'Activate Personnel' : 'Deactivate Personnel'}
          style={{ width: '400px' }}
          modal
          footer={
            <div className="flex justify-end gap-2">
              <Button
                label="Cancel"
                icon="pi pi-times"
                onClick={handleActiveStatusCancel}
                className="p-button-text"
                testId="PersonnelList.Dialog.ActiveStatus.Cancel"
              />
              <Button
                label="Confirm"
                icon="pi pi-check"
                onClick={handleActiveStatusConfirm}
                severity={pendingActiveStatusChange?.newStatus ? 'success' : 'warning'}
                testId="PersonnelList.Dialog.ActiveStatus.Confirm"
              />
            </div>
          }
        >
          <div className="flex items-center gap-3">
            <i className={`pi ${pendingActiveStatusChange?.newStatus ? 'pi-check-circle text-green-500' : 'pi-exclamation-triangle text-yellow-500'}`} style={{ fontSize: '2rem' }} />
            <p className="text-gray-700 dark:text-gray-300">
              Are you sure you want to {pendingActiveStatusChange?.newStatus ? 'activate' : 'deactivate'}{' '} the account of
              &nbsp;<strong>{pendingActiveStatusChange?.personnelName}</strong>?
            </p>
          </div>
        </Dialog>
      </div>
    </PermissionGuard>
  );
};

export default PersonnelList;
