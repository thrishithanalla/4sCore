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
import { InputText } from 'primereact/inputtext';
import { districtsService, type DistrictQueryParams } from '../../services/districts.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { District } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './districts-list.module.css';

interface CellEditCompleteEvent {
  rowData: District;
  newValue: string;
  field: string;
  originalEvent: React.SyntheticEvent;
}

const DistrictsList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'districts',
    basePath: '/districts',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.DISTRICTS);
  const canUpdate = useCanUpdate(JOB_NAMES.DISTRICTS);
  const canDelete = useCanDelete(JOB_NAMES.DISTRICTS);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
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

  const fetchDistricts = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      const params: DistrictQueryParams = {
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

      const response = await districtsService.getAll(params);
      const mappedData = (response.data || []).map(district => ({ ...district, id: district._id }));
      setDistricts(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch districts:', err);
      showError(extractErrorMessage(err, 'Failed to load districts. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchDistricts(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchDistricts(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchDistricts(1, pageSize);
  }, [includeDeleted, debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedDistrictId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedDistrictId) return;

    try {
      setDeleteLoading(true);
      await districtsService.delete(selectedDistrictId);
      setDeleteDialogOpen(false);
      setSelectedDistrictId(null);
      fetchDistricts(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete district:', err);
      setDeleteDialogOpen(false);
      setSelectedDistrictId(null);
      showError(extractErrorMessage(err, 'Failed to delete district'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedDistrictId(null);
  };

  const handleIncludeDeletedToggle = () => {
    setIncludeDeleted(!includeDeleted);
  };

  // Handle inline cell edit completion
  const handleCellEditComplete = useCallback(async (e: CellEditCompleteEvent) => {
    const { rowData, newValue, field } = e;
    const oldValue = rowData[field as keyof District];

    // Skip if value hasn't changed
    if (newValue === oldValue) return;

    // Skip if value is empty for required fields
    if (field === 'name' && (!newValue || !newValue.trim())) {
      showError('Name is required');
      return;
    }

    try {
      await districtsService.update(rowData._id, { [field]: newValue });
      // Update local state to reflect the change
      setDistricts(prev =>
        prev.map(d =>
          d._id === rowData._id ? { ...d, [field]: newValue } : d
        )
      );
      // Show success message
      toast.current?.show({
        severity: 'success',
        summary: 'Updated',
        detail: `${field === 'name' ? 'Name' : field === 'cctnsDistrictCd' ? 'CCTNS Code' : field} updated successfully`,
        life: 3000,
      });
    } catch (err: any) {
      console.error(`Failed to update ${field}:`, err);
      showError(extractErrorMessage(err, `Failed to update ${field}`));
      // Refresh to revert to original value
      fetchDistricts(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    }
  }, [fetchDistricts, showError]);

  // Text editor for inline editing
  const textEditor = useCallback((options: any) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        // Simulate click outside to close the cell editor
        setTimeout(() => {
          document.body.click();
        }, 0);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Cancel edit by restoring original value
        options.editorCallback(options.rowData[options.field]);
        // Simulate click outside to close the cell editor
        setTimeout(() => {
          document.body.click();
        }, 0);
      } else {
        e.stopPropagation();
      }
    };

    return (
      <InputText
        type="text"
        value={options.value || ''}
        onChange={(e) => options.editorCallback(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full p-2 border rounded text-sm"
        autoFocus
      />
    );
  }, []);

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => districtsService.export(), []);

  const columns: DataTableColumn<District>[] = useMemo(() => {
    const baseColumns: DataTableColumn<District>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
        // editor: (options: any) => !options.rowData.isDeleted ? textEditor(options) : null,
        // onCellEditComplete: handleCellEditComplete,
      },
      {
        field: 'shortCode',
        header: 'Short Code',
        sortable: true,
        body: (rowData: District) => (rowData as any).shortCode || '-',
      },
      {
        field: 'cctnsDistrictCd',
        header: 'CCTNS District Code',
        sortable: true,
        body: (rowData: District) => rowData.cctnsDistrictCd || '-',
      },
      {
        field: 'stateName',
        header: 'State Name',
        sortable: true,
        body: (rowData: District) => rowData.stateName || 'Andhra Pradesh',
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: District) => (
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
      body: (rowData: District) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="DistrictsList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>

            {!isDeleted && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="DistrictsList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="DistrictsList.Action.Delete"
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
  }, [canUpdate, canDelete, includeDeleted, handleCellEditComplete, textEditor]);

  return (
    <PermissionGuard jobName={JOB_NAMES.DISTRICTS}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-Districts-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-map-marker" />
            </div>
            <h1 className={styles.title}>Districts</h1>
          </div>
          <p className={styles.subtitle}>
            Manage district configurations for the state
          </p>
        </div>

        {/* Main Card */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            {/* Filter / Control Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterBarContent}>
                {/* Left side - All filters grouped together */}
                <div className={styles.filterGroup}>
                  <Input
                    name="search"
                    placeholder="Search districts..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="DistrictsList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  {canDelete && (
                    <div className={styles.toggleGroup}>
                      <InputSwitch
                        checked={includeDeleted}
                        onChange={handleIncludeDeletedToggle}
                        data-testid="DistrictsList.Toggle.IncludeDeleted"
                      />
                      <label className={styles.toggleLabel}>Show Deleted</label>
                    </div>
                  )}
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="districts-export.xlsx"
                    testId="DistrictsList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchDistricts(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="DistrictsList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create District"
                      icon="pi pi-plus"
                      onClick={() => navigateToCreate()}
                      testId="DistrictsList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={districts}
              columns={columns}
              loading={loading}
              emptyMessage="No districts found"
              dataKey="_id"
              editMode="cell"
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
        </div>
        <Tooltip target="[data-pr-tooltip]" />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this district? This action will mark the district as deleted."
          testId="DistrictsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default DistrictsList;
