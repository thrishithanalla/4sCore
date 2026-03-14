import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog } from 'mainFe/Dialog';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { InputSwitch } from 'primereact/inputswitch';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { approvalFlowMasterService, type ApprovalFlowMaster, type ApprovalFlowMasterQueryParams } from '../../services/approval-flow-master.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const ApprovalFlowMasterList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'approval-flow-master',
    basePath: '/approval-flow-master',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.APPROVAL_FLOW_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.APPROVAL_FLOW_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.APPROVAL_FLOW_MASTER);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlowMaster[]>([]);
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

  // Sorting states for server-side sorting
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

  const fetchApprovalFlows = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      const params: ApprovalFlowMasterQueryParams = {
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
        // Map nested field names to API field names
        const fieldMapping: Record<string, string> = {
          'module.name': 'module.name',
          'district.name': 'district.name',
          'finalApprovalUnit.name': 'finalApprovalUnit.name',
        };
        params.sort_by = fieldMapping[sortBy] || sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await approvalFlowMasterService.getAll(params);
      const mappedData = (response.data || []).map(item => ({ ...item, id: item._id }));
      setApprovalFlows(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: unknown) {
      console.error('Failed to fetch approval flows:', err);
      showError(extractErrorMessage(err, 'Failed to load approval flows. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchApprovalFlows(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort change from DataTable
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchApprovalFlows(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchApprovalFlows(1, pageSize, sortField, sortOrder);
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
      await approvalFlowMasterService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      fetchApprovalFlows(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (err: unknown) {
      console.error('Failed to delete approval flow:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete approval flow'));
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

  // Client-side filtering for flow name and district (fallback if backend doesn't filter)
  const filteredApprovalFlows = useMemo(() => {
    if (!debouncedSearchText || !debouncedSearchText.trim()) {
      return approvalFlows;
    }

    const searchLower = debouncedSearchText.toLowerCase().trim();
    return approvalFlows.filter((flow) => {
      const flowName = (flow.flowName || '').toLowerCase();
      const districtName = (flow.district?.name || '').toLowerCase();
      return flowName.includes(searchLower) || districtName.includes(searchLower);
    });
  }, [approvalFlows, debouncedSearchText]);

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => approvalFlowMasterService.export(), []);

  const columns: DataTableColumn<ApprovalFlowMaster>[] = useMemo(() => {
    const baseColumns: DataTableColumn<ApprovalFlowMaster>[] = [
      {
        field: 'flowName',
        header: 'Flow Name',
        sortable: true,
      },
      {
        field: 'module.name',
        header: 'Module',
        sortable: true,
        body: (rowData: ApprovalFlowMaster) => rowData.module?.name || '-',
      },
      {
        field: 'district.name',
        header: 'District',
        sortable: true,
        body: (rowData: ApprovalFlowMaster) => rowData.district?.name || '-',
      },
      {
        field: 'finalApprovalUnit.name',
        header: 'Final Approval Unit',
        sortable: true,
        body: (rowData: ApprovalFlowMaster) => rowData.finalApprovalUnit?.name || '-',
      },
      {
        field: 'finalApprovalPostCode',
        header: 'Final Approval Postcode',
        sortable: true,
        body: (rowData: ApprovalFlowMaster) => rowData.finalApprovalPostCode || '-',
      },
      {
        field: 'ifRejected',
        header: 'If Rejected',
        sortable: true,
        body: (rowData: ApprovalFlowMaster) => (
          <Tag value={rowData.ifRejected} severity="secondary" />
        ),
      },
      {
        field: 'isActive',
        header: 'Status',
        sortable: true,
        body: (rowData: ApprovalFlowMaster) => (
          rowData.isActive ? (
            <Tag value="Active" severity="success" />
          ) : (
            <Tag value="Inactive" severity="warning" />
          )
        ),
      },
    ];

    // Only show Deleted Status column when includeDeleted is active
    if (includeDeleted) {
      baseColumns.push({
        field: 'isDelete',
        header: 'Deleted',
        sortable: false,
        body: (rowData: ApprovalFlowMaster) => (
          rowData.isDelete ? (
            <Tag value="Yes" severity="danger" />
          ) : (
            <Tag value="No" severity="success" />
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
      body: (rowData: ApprovalFlowMaster) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData._id)}
            data-testid="ApprovalFlowMasterList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
          </button>
          <Tooltip target="[data-pr-tooltip]" />

          {!rowData.isDelete && (
            <>
              {canUpdate && (
                <button
                  className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => handleEdit(rowData._id)}
                  data-testid="ApprovalFlowMasterList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowData._id)}
                  data-testid="ApprovalFlowMasterList.Action.Delete"
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
    <PermissionGuard jobName={JOB_NAMES.APPROVAL_FLOW_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-ApprovalFlowMaster-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
              <i className="pi pi-sitemap text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Approval Flow Master
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Manage approval flow configurations for different modules
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
                  placeholder="Search by flow name or district..."
                  value={searchText}
                  onChange={(value: string) => setSearchText(value)}
                  testId="ApprovalFlowMasterList.Search"
                  style={{ minWidth: '250px', width: '250px' }}
                  clearable
                />

                {canDelete && (
                  <div className="flex items-center gap-2">
                    <InputSwitch
                      checked={includeDeleted}
                      onChange={handleIncludeDeletedToggle}
                      data-testid="ApprovalFlowMasterList.Toggle.IncludeDeleted"
                    />
                    <label className="text-xs text-gray-700 dark:text-gray-300">Show Deleted</label>
                  </div>
                )}
              </div>

              {/* Right side - Record count, Export & Refresh */}
              <div className="flex gap-2 items-center flex-shrink-0">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {debouncedSearchText ? filteredApprovalFlows.length : totalRecords} {(debouncedSearchText ? filteredApprovalFlows.length : totalRecords) === 1 ? 'record' : 'records'}
                </span>
                <ExportDataButton
                  fetchBlob={fetchExportBlob}
                  filename="approval-flow-masters-export.xlsx"
                  testId="ApprovalFlowMasterList.Button.Export"
                />
                <RefreshButton
                  onClick={() => fetchApprovalFlows(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                  loading={loading}
                  testId="ApprovalFlowMasterList.Button.Refresh"
                />

                {canCreate && (
                  <Button
                    label="Create Approval Flow"
                    icon="pi pi-plus"
                    onClick={() => navigate('/approval-flow-master/create')}
                    testId="ApprovalFlowMasterList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

        {/* DataTable */}
        <DataTable
          data={filteredApprovalFlows}
          columns={columns}
          loading={loading}
          emptyMessage={debouncedSearchText ? "No approval flows match your search" : "No approval flows found"}
          dataKey="_id"
          paginator
          lazy={!debouncedSearchText}
          first={debouncedSearchText ? 0 : first}
          rows={pageSize}
          totalRecords={debouncedSearchText ? filteredApprovalFlows.length : totalRecords}
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
          message="Are you sure you want to delete this approval flow? This action will mark it as deleted."
          testId="ApprovalFlowMasterList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default ApprovalFlowMasterList;
