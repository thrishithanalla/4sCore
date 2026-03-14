import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { promptsService } from '../../services/prompts.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { PromptWithId, PromptListParams } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './prompt-list.module.css';

const PromptList = () => {
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'prompt',
    basePath: '/prompt-table',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.PROMPT_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.PROMPT_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.PROMPT_MASTER);
  const [prompts, setPrompts] = useState<PromptWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
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

  const fetchPrompts = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    sortBy: string | null = sortField,
    order: 1 | -1 | null = sortOrder
  ) => {
    try {
      setLoading(true);

      const params: PromptListParams = {
        page,
        pageSize: size,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Add sorting parameters
      if (sortBy) {
        params.sort_by = sortBy;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await promptsService.list(params);
      const mappedData = (response.data || []).map((prompt) => ({ ...prompt, id: prompt._id }));
      setPrompts(mappedData);

      // Handle both total and totalItems from API response
      const total = (response as any).pagination?.totalItems ?? (response as any).pagination?.total ?? response.total ?? 0;
      setTotalRecords(total);
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
      showError(extractErrorMessage(error, 'Failed to load prompts'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, pageSize, sortField, sortOrder, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchPrompts(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort change from DataTable
  const handleSort = (event: any) => {
    const newSortField = event.sortField;
    const newSortOrder = event.sortOrder as 1 | -1 | null;

    setSortField(newSortField);
    setSortOrder(newSortOrder);

    // Reset to first page when sorting changes
    setFirst(0);
    fetchPrompts(1, pageSize, newSortField, newSortOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchPrompts(1, pageSize, sortField, sortOrder);
  }, [debouncedSearchText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side filtering fallback (in case backend doesn't filter)
  const filteredPrompts = useMemo(() => {
    if (!debouncedSearchText || !debouncedSearchText.trim()) {
      return prompts;
    }

    const searchLower = debouncedSearchText.toLowerCase().trim();
    return prompts.filter((row) => {
      const name = (row.name || '').toLowerCase();
      const type = (row.type || '').toLowerCase();
      const aiRole = (row.aiRole || '').toLowerCase();
      return name.includes(searchLower) || type.includes(searchLower) || aiRole.includes(searchLower);
    });
  }, [prompts, debouncedSearchText]);

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedPromptId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedPromptId) return;

    try {
      setDeleteLoading(true);
      await promptsService.softDelete(selectedPromptId);
      setDeleteDialogOpen(false);
      setSelectedPromptId(null);
      fetchPrompts(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
    } catch (error: any) {
      console.error('Failed to delete prompt:', error);
      setDeleteDialogOpen(false);
      setSelectedPromptId(null);
      showError(extractErrorMessage(error, 'Failed to delete prompt'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedPromptId(null);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => promptsService.export(), []);

  const columns: DataTableColumn<PromptWithId>[] = useMemo(() => [
    {
      field: 'name',
      header: 'Name',
      sortable: true,
    },
    {
      field: 'type',
      header: 'Type',
      sortable: true,
      body: (rowData: PromptWithId) => (
        <Tag value={rowData.type} severity="info" />
      ),
    },
    {
      field: 'aiRole',
      header: 'AI Role',
      sortable: true,
    },
    {
      field: 'llm',
      header: 'LLM',
      sortable: true,
      body: (rowData: PromptWithId) => rowData.llm || '-',
    },
    {
      field: 'tech',
      header: 'Technology',
      sortable: true,
      body: (rowData: PromptWithId) => rowData.tech || '-',
    },
    {
      field: 'createdAt',
      header: 'Created At',
      sortable: true,
      body: (rowData: PromptWithId) => {
        if (!rowData.createdAt) return '-';
        return new Date(rowData.createdAt).toLocaleDateString();
      },
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: PromptWithId) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="PromptList.Action.View"
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
                    data-testid="PromptList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="PromptList.Action.Delete"
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
    },
  ], [canUpdate, canDelete]);

  return (
    <PermissionGuard jobName={JOB_NAMES.PROMPT_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-Prompt-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-comments" />
            </div>
            <h1 className={styles.title}>Prompt Management</h1>
          </div>
          <p className={styles.subtitle}>
            Manage AI prompts, templates, and configurations
          </p>
        </div>

        {/* Main Card */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            {/* Filter / Control Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterBarContent}>
                {/* Left side - Filters */}
                <div className={styles.filterGroup}>
                  <Input
                    name="search"
                    placeholder="Search prompts..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="PromptList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {debouncedSearchText ? filteredPrompts.length : totalRecords} {(debouncedSearchText ? filteredPrompts.length : totalRecords) === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="prompts-export.xlsx"
                    testId="PromptList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchPrompts(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="PromptList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Prompt"
                      icon="pi pi-plus"
                      onClick={() => navigateToCreate()}
                      testId="PromptList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={filteredPrompts}
              columns={columns}
              loading={loading}
              emptyMessage={debouncedSearchText ? "No prompts match your search" : "No prompts found"}
              dataKey="_id"
              paginator
              lazy={!debouncedSearchText}
              first={debouncedSearchText ? 0 : first}
              rows={pageSize}
              totalRecords={debouncedSearchText ? filteredPrompts.length : totalRecords}
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
          message="Are you sure you want to delete this prompt? This will mark it as deleted."
          testId="PromptList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default PromptList;
