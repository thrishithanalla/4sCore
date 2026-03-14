import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { InputSwitch } from 'mainFe/InputSwitch';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { designationMasterService, type DesignationMaster, type DesignationMasterQueryParams } from '../../services/designation-master.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './designation-master-list.module.css';

const DesignationMasterList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'designation-master',
    basePath: '/designation-master',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.DESIGNATION_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.DESIGNATION_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.DESIGNATION_MASTER);
  const [designationMasters, setDesignationMasters] = useState<DesignationMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states for server-side sorting
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<1 | -1 | 0 | undefined>(undefined);

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

  const fetchDesignationMasters = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    field?: string,
    order?: 1 | -1 | 0
  ) => {
    try {
      setLoading(true);

      const params: DesignationMasterQueryParams = {
        page,
        page_size: size,
      };

      if (debouncedSearchText?.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Only add include_deleted if it's true
      if (includeDeleted) {
        params.include_deleted = true;
      }

      // Add sorting parameters (order 0 means unsorted/removed)
      if (field && order && order !== 0) {
        params.sort_by = field;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await designationMasterService.getAll(params);
      const mappedData = (response.data || []).map(item => ({ ...item, id: item._id }));
      setDesignationMasters(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: unknown) {
      console.error('Failed to fetch designation masters:', err);
      showError(extractErrorMessage(err, 'Failed to load designation masters. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, includeDeleted, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchDesignationMasters(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort change from DataTable
  const handleSort = (event: any) => {
    const newField = event.sortField;
    const newOrder = event.sortOrder;
    setSortField(newField);
    setSortOrder(newOrder);
    setFirst(0); // Reset to first page on sort
    fetchDesignationMasters(1, pageSize, newField, newOrder);
  };

  // Fetch data on mount and when filters change
  useEffect(() => {
    setFirst(0);
    fetchDesignationMasters(1, pageSize, sortField, sortOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchText, includeDeleted]);

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
      await designationMasterService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchDesignationMasters(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: unknown) {
      console.error('Failed to delete designation master:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete designation master'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => designationMasterService.export(), []);

  const columns: DataTableColumn<DesignationMaster>[] = useMemo(() => {
    const baseColumns: DataTableColumn<DesignationMaster>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
      },
      {
        field: 'designationCode',
        header: 'Designation Code',
        sortable: true,
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: DesignationMaster) => (
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
      body: (rowData: DesignationMaster) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="DesignationMasterList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
          </button>

          {!rowData.isDelete && (
            <>
              {canUpdate && (
                <button
                  className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="DesignationMasterList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="DesignationMasterList.Action.Delete"
                  data-pr-tooltip="Delete"
                >
                  <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
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
    <PermissionGuard jobName={JOB_NAMES.DESIGNATION_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-DesignationMaster-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-id-card" />
            </div>
            <h1 className={styles.title}>Designation Master</h1>
          </div>
          <p className={styles.subtitle}>
            Manage designation configurations for the organization
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
                    placeholder="Search designations..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="DesignationMasterList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  {canDelete && (
                    <InputSwitch
                      checked={includeDeleted}
                      onChange={(e: any) => setIncludeDeleted(e.value)}
                      label="Show Deleted"
                      testId="DesignationMasterList.Toggle.IncludeDeleted"
                    />
                  )}
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="designation-masters-export.xlsx"
                    testId="DesignationMasterList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchDesignationMasters(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="DesignationMasterList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Designation"
                      icon="pi pi-plus"
                      onClick={() => navigate('/designation-master/create')}
                      testId="DesignationMasterList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={designationMasters}
              columns={columns}
              loading={loading}
              emptyMessage="No designation masters found"
              dataKey="_id"
              paginator
              lazy
              first={first}
              rows={pageSize}
              totalRecords={totalRecords}
              onPage={handlePageChange}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sortMode="single"
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
            <Tooltip target="[data-pr-tooltip]" />
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this designation? This action will mark it as deleted."
          testId="DesignationMasterList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default DesignationMasterList;
