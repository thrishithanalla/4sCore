/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import { assignmentService, type Assignment, type PopulatedRoleInfo } from '../../services/assignment.service';
import { extractErrorMessage } from '../../utils/error-handler';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './assignments-list.module.css';

// Extended assignment type with populated fields for display
interface AssignmentWithDetails extends Assignment {
  id: string;
  userName?: string;
  unitName?: string;
  postName?: string;
  user?: { _id: string; name?: string; userId?: string };
  unit?: { _id: string; name?: string };
  post?: {
    postCode: string;
    postName?: string;
    isUnitHead?: boolean;
    assignedRoles?: PopulatedRoleInfo[];
  };
  // Computed status
  statusType?: 'active' | 'inactive' | 'ended';
}

const AssignmentsList = () => {
  const navigate = useAppNavigate();
  const toast = useRef<Toast>(null);

  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'assignments',
    basePath: '/assignments',
  });
  const canCreate = useCanCreate(JOB_NAMES.ASSIGNMENTS);
  const canUpdate = useCanUpdate(JOB_NAMES.ASSIGNMENTS);
  const canDelete = useCanDelete(JOB_NAMES.ASSIGNMENTS);

  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [first, setFirst] = useState(0);

  // Sorting state
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<1 | -1>(-1);

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  const loadAssignments = useCallback(async (currentPage: number, currentPageSize: number, sortBy?: string, order?: 1 | -1) => {
    try {
      setLoading(true);
      const response = await assignmentService.list({
        isDelete: false,
        page: currentPage,
        pageSize: currentPageSize,
        sort_by: sortBy || 'createdAt',
        sort_order: (order ?? sortOrder) === 1 ? 'asc' : 'desc',
      });

      // Update pagination state from response
      setTotalRecords(response.total);
      setPage(response.page);
      setPageSize(response.pageSize);

      // Add id field, flatten nested fields, and compute status type
      const mappedData = response.data.map((assignment: any) => {
        // Compute status type based on isActive and endDate
        let statusType: 'active' | 'inactive' | 'ended' = 'active';
        if (!assignment.isActive) {
          statusType = 'inactive';
        } else if (assignment.endDate && new Date(assignment.endDate) < new Date()) {
          statusType = 'ended';
        }

        return {
          ...assignment,
          id: assignment._id,
          userName: assignment.user?.name || assignment.user?.userId || '-',
          unitName: assignment.unit?.name || '-',
          postName: assignment.post?.postName || assignment.postCode || '-',
          statusType,
        };
      });

      setAssignments(mappedData);
      setTotalRecords(response.total || 0);
    } catch (err: any) {
      console.error('Failed to load assignments:', err);
      showError(extractErrorMessage(err, 'Failed to load assignments'));
    } finally {
      setLoading(false);
    }
  }, [showError, sortField, sortOrder]);

  useEffect(() => {
    loadAssignments(page, pageSize);
  }, []);

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedId(String(id));
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;
    try {
      setDeleteLoading(true);
      await assignmentService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Assignment deleted successfully',
        life: 3000,
      });
      loadAssignments(page, pageSize);
    } catch (err: any) {
      console.error('Failed to delete assignment:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete assignment'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleRefresh = () => {
    loadAssignments(page, pageSize);
  };

  // Handle pagination change from DataTable
  const onPage = (event: { first: number; rows: number; page?: number }) => {
    const newPage = (event.page ?? Math.floor(event.first / event.rows)) + 1;
    const newPageSize = event.rows;
    setFirst(event.first);
    setPage(newPage);
    setPageSize(newPageSize);
    loadAssignments(newPage, newPageSize);
  };

  // Map client-side field names to API sort field names
  const sortFieldMap: Record<string, string> = {
    userName: 'user.name',
    unitName: 'unit.name',
    postName: 'post.postName',
    statusType: 'isActive',
    isPrimary: 'isPrimary',
    startDate: 'startDate',
    endDate: 'endDate',
    createdAt: 'createdAt',
  };

  // Handle sort event from DataTable
  const handleSort = (event: any) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
    const apiSortField = sortFieldMap[event.sortField] || event.sortField;
    loadAssignments(page, pageSize, apiSortField, event.sortOrder);
  };

  // Filter rows based on search text (client-side filter for current page)
  const filteredRows = useMemo(() => {
    if (!searchText) return assignments;

    const lowerSearch = searchText.toLowerCase();
    return assignments.filter((row) => {
      return (
        (row.userName || '').toLowerCase().includes(lowerSearch) ||
        (row.unitName || '').toLowerCase().includes(lowerSearch) ||
        (row.postName || '').toLowerCase().includes(lowerSearch) ||
        (row.postCode || '').toLowerCase().includes(lowerSearch)
      );
    });
  }, [assignments, searchText]);

  // Export columns configuration
  // Fetch export blob from API
  const fetchExportBlob = useCallback(() => assignmentService.export(), []);

  const columns: DataTableColumn<AssignmentWithDetails>[] = useMemo(
    () => [
      {
        field: 'userName',
        header: 'Personnel',
        sortable: true,
        body: (rowData: AssignmentWithDetails) => (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-user text-purple-600 dark:text-purple-400" style={{ fontSize: '0.75rem' }} />
            </div>
            <div className="leading-tight">
              <div className="font-medium text-sm text-gray-900 dark:text-white">{rowData.userName || '-'}</div>
              {rowData.user?.userId && (
                <div className="text-xs text-gray-500">{rowData.user.userId}</div>
              )}
            </div>
          </div>
        ),
      },
      {
        field: 'unitName',
        header: 'Unit & Post',
        sortable: true,
        body: (rowData: AssignmentWithDetails) => (
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <i className="pi pi-building text-gray-400" style={{ fontSize: '0.7rem' }} />
              <span className="font-medium text-sm">{rowData.unitName || '-'}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <i className="pi pi-id-card text-gray-400" style={{ fontSize: '0.7rem' }} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {rowData.postName || '-'}
                {rowData.post?.isUnitHead && (
                  <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">(Head)</span>
                )}
              </span>
            </div>
            <div className="text-xs text-gray-400">{rowData.postCode}</div>
          </div>
        ),
      },
      {
        field: 'statusType',
        header: 'Status',
        sortable: true,
        body: (rowData: AssignmentWithDetails) => {
          // Enhanced status display
          const getStatusConfig = () => {
            if (rowData.statusType === 'ended') {
              return { label: 'Ended', severity: 'danger' as const, icon: 'pi-times-circle' };
            }
            if (rowData.statusType === 'inactive') {
              return { label: 'Inactive', severity: 'warning' as const, icon: 'pi-pause-circle' };
            }
            return { label: 'Active', severity: 'success' as const, icon: 'pi-check-circle' };
          };
          const status = getStatusConfig();
          return (
            <div className="flex flex-col gap-0.5 items-start">
              <Tag value={status.label} severity={status.severity} style={{ minWidth: '70px', textAlign: 'center' }} />
              {rowData.isPrimary && (
                <Tag value="Primary" severity="info" style={{ minWidth: '70px', textAlign: 'center' }} />
              )}
            </div>
          );
        },
      },
      {
        field: 'startDate',
        header: 'Period',
        sortable: true,
        body: (rowData: AssignmentWithDetails) => (
          <div className="text-xs leading-tight">
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <i className="pi pi-calendar" style={{ fontSize: '0.7rem' }} />
              <span>
                {rowData.startDate
                  ? new Date(rowData.startDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Not set'}
              </span>
            </div>
            {rowData.endDate && (
              <div className="flex items-center gap-1 text-gray-500 mt-0.5">
                <i className="pi pi-arrow-right" style={{ fontSize: '0.5rem' }} />
                <span>
                  {new Date(rowData.endDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>
        ),
      },
      {
        field: 'actions',
        header: 'Actions',
      headerStyle: { textAlign: 'center' },
        sortable: false,
        body: (rowData: AssignmentWithDetails) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="AssignmentsList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>

            {!rowData.isDelete && rowData.statusType === 'active' && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="AssignmentsList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="AssignmentsList.Action.Delete"
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
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName={JOB_NAMES.ASSIGNMENTS}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-Assignments-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-briefcase" />
            </div>
            <h1 className={styles.title}>Personnel Assignments</h1>
          </div>
          <p className={styles.subtitle}>
            Manage personnel assignments to units and posts
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
                    placeholder="Search assignments..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="AssignmentsList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="assignments-export.xlsx"
                    testId="AssignmentsList.Button.Export"
                  />
                  <RefreshButton
                    onClick={handleRefresh}
                    loading={loading}
                    testId="AssignmentsList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Assignment"
                      icon="pi pi-plus"
                      onClick={() => navigate('/assignments/create')}
                      testId="AssignmentsList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={filteredRows}
              columns={columns}
              loading={loading}
              emptyMessage="No assignments found"
              dataKey="_id"
              lazy
              paginator
              first={first}
              rows={pageSize}
              totalRecords={totalRecords}
              onPage={onPage}
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
          message="Are you sure you want to delete this assignment? This will also clear the user from the post."
          testId="AssignmentsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default AssignmentsList;
