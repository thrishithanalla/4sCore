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
import { ranksService, type RankQueryParams } from '../../services/ranks.service';
import { useDebounce } from '../../hooks/useDebounce';
import type { Rank } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './rank-list.module.css';

const RanksList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'rank',
    basePath: '/rank',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.RANK);
  const canUpdate = useCanUpdate(JOB_NAMES.RANK);
  const canDelete = useCanDelete(JOB_NAMES.RANK);
  const [ranks, setRanks] = useState<Rank[]>([]);
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

  const fetchRanks = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);
      const params: RankQueryParams = {
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

      const response = await ranksService.getAll(params);
      const mappedData = (response.data || []).map((item: any) => ({
        ...item,
        id: item._id || item.id,
      }));
      setRanks(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to fetch ranks:', err);
      showError(extractErrorMessage(err, 'Failed to load ranks. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchRanks(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort event - server-side sorting
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchRanks(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchRanks(1, pageSize);
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
      await ranksService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchRanks(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: any) {
      console.error('Failed to delete rank:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete rank'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleIncludeDeletedToggle = () => {
    setIncludeDeleted(!includeDeleted);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => ranksService.export(), []);

  const columns: DataTableColumn<Rank>[] = useMemo(() => {
    const baseColumns: DataTableColumn<Rank>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
      },
      {
        field: 'cctnsRankCd',
        header: 'CCTNS Rank Code',
        sortable: true,
      },
      {
        field: 'shortCode',
        header: 'Short Code',
        sortable: true,
      },
      {
        field: 'level',
        header: 'Level',
        sortable: true,
        body: (rowData: Rank) => rowData.level ?? '-',
      },
      {
        field: 'createdAt',
        header: 'Created At',
        sortable: true,
        body: (rowData: Rank) =>
          rowData.createdAt ? new Date(rowData.createdAt).toLocaleDateString() : '-',
      },
    ];

    // Only show Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: Rank) => (
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
      body: (rowData: Rank) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="RanksList.Action.View"
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
                    data-testid="RanksList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="RanksList.Action.Delete"
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
    <PermissionGuard jobName={JOB_NAMES.RANK}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-Ranks-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-star" />
            </div>
            <h1 className={styles.title}>Ranks</h1>
          </div>
          <p className={styles.subtitle}>
            Manage police ranks and CCTNS codes
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
                    placeholder="Search ranks..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="RanksList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  {canDelete && (
                    <div className={styles.toggleGroup}>
                      <InputSwitch
                        checked={includeDeleted}
                        onChange={handleIncludeDeletedToggle}
                        data-testid="RanksList.Toggle.IncludeDeleted"
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
                    filename="ranks-export.xlsx"
                    testId="RanksList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchRanks(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="RanksList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Rank"
                      icon="pi pi-plus"
                      onClick={() => navigateToCreate()}
                      testId="RanksList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={ranks}
              columns={columns}
              loading={loading}
              emptyMessage="No ranks found"
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
        </div>
        <Tooltip target="[data-pr-tooltip]" />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this rank? This will mark it as deleted."
          testId="RanksList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default RanksList;
