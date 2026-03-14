import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { valueSetsService, type ValueSetQueryParams } from '../../services/value-sets.service';
import { modulesService } from '../../services/modules.service';
import { extractErrorMessage } from '../../utils/error-handler';
import type { ValueSet } from '../../types';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './value-sets-list.module.css';

// Extended type for DataGrid compatibility
type ValueSetWithId = ValueSet & { id: string };

const ValueSetsList = () => {
  const navigate = useAppNavigate();
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.VALUE_SETS);
  const canUpdate = useCanUpdate(JOB_NAMES.VALUE_SETS);
  const canDelete = useCanDelete(JOB_NAMES.VALUE_SETS);
  const [valueSets, setValueSets] = useState<ValueSetWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedValueSetId, setSelectedValueSetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states for server-side sorting
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<1 | -1 | 0 | undefined>(undefined);

  // Debounce search text (500ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const debouncedModuleFilter = useDebounce(moduleFilter, 500);

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  const fetchValueSets = useCallback(async (
    page: number = 1,
    size: number = pageSize,
    field?: string,
    order?: 1 | -1 | 0
  ) => {
    try {
      setLoading(true);
      const params: ValueSetQueryParams = {
        page,
        page_size: size,
      };

      if (debouncedSearchQuery) params.search = debouncedSearchQuery;
      if (debouncedModuleFilter) {
        // Find the module name from the selected module ID
        const selectedModule = modules.find(m => m._id === debouncedModuleFilter);
        if (selectedModule) {
          params.module = selectedModule.name;
        }
      }

      // Add sorting parameters (order 0 means unsorted/removed)
      if (field && order && order !== 0) {
        params.sort_by = field;
        params.sort_order = order === 1 ? 'asc' : 'desc';
      }

      const response = await valueSetsService.getAll(params);
      // Map _id to id for DataGrid compatibility
      const mappedData = (response.data || []).map(vs => ({ ...vs, id: vs._id })) as ValueSetWithId[];
      setValueSets(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (error) {
      console.error('Failed to fetch value sets:', error);
      showError(extractErrorMessage(error, 'Failed to load value sets'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, debouncedModuleFilter, pageSize, sortField, sortOrder, showError, modules]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchValueSets(newPage, event.rows, sortField, sortOrder);
  };

  // Handle sort change from DataTable
  const handleSort = (event: any) => {
    const newField = event.sortField;
    const newOrder = event.sortOrder;
    setSortField(newField);
    setSortOrder(newOrder);
    setFirst(0); // Reset to first page on sort
    fetchValueSets(1, pageSize, newField, newOrder);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    fetchValueSets(1, pageSize, sortField, sortOrder);
  }, [debouncedSearchQuery, debouncedModuleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate using plain key (not encrypted) since value-sets API uses key directly
  const handleView = (id: string | number) => {
    const valueSet = valueSets.find(vs => vs.id === id);
    if (valueSet) {
      navigate(`/value-sets/${valueSet.key}`);
    }
  };

  const handleEdit = (id: string | number) => {
    const valueSet = valueSets.find(vs => vs.id === id);
    if (valueSet) {
      navigate(`/value-sets/${valueSet.key}/edit`);
    }
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedValueSetId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedValueSetId) return;

    try {
      setDeleteLoading(true);
      const valueSet = valueSets.find(vs => vs.id === selectedValueSetId);
      if (valueSet) {
        await valueSetsService.delete(valueSet.key);
        setDeleteDialogOpen(false);
        setSelectedValueSetId(null);
        fetchValueSets(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder);
      }
    } catch (error: any) {
      console.error('Failed to delete value set:', error);
      setDeleteDialogOpen(false);
      setSelectedValueSetId(null);
      showError(extractErrorMessage(error, 'Failed to delete value set'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedValueSetId(null);
  };

  const moduleOptions = [
    { label: 'All Modules', value: '' },
    ...modules.map((m) => ({ label: m.name, value: m._id })),
  ];

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => valueSetsService.export(), []);

  const columns: DataTableColumn<ValueSetWithId>[] = useMemo(() => [
    {
      field: 'key',
      header: 'Key',
      sortable: true,
    },
    {
      field: 'module',
      header: 'Module',
      sortable: true,
      body: (rowData: ValueSetWithId) => {
        if (!rowData.module) {
          return <span className="text-gray-400 dark:text-gray-500 text-xs italic">No module</span>;
        }
        return <Tag value={rowData.module} severity="info" className="text-xs" />;
      },
    },
    {
      field: 'description',
      header: 'Description',
      sortable: false,
      style: { minWidth: '250px', maxWidth: '400px' },
      body: (rowData: ValueSetWithId) => (
        <span className="whitespace-normal break-words">{rowData.description || '-'}</span>
      ),
    },
    {
      field: 'items',
      header: 'Items Count',
      sortable: false,
      body: (rowData: ValueSetWithId) => rowData.items?.length || 0,
    },
    {
      field: 'createdAt',
      header: 'Created At',
      sortable: true,
      body: (rowData: ValueSetWithId) =>
        rowData.createdAt ? new Date(rowData.createdAt).toLocaleDateString() : '-',
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: ValueSetWithId) => (
        <div className="flex gap-1 justify-center">
          <button
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => handleView(rowData.id)}
            data-testid="ValueSetsList.Action.View"
            data-pr-tooltip="View"
          >
            <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
          </button>

          {canUpdate && (
            <button
              className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              onClick={() => handleEdit(rowData.id)}
              data-testid="ValueSetsList.Action.Edit"
              data-pr-tooltip="Edit"
            >
              <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
            </button>
          )}

          {canDelete && (
            <button
              className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              onClick={() => handleDeleteClick(rowData.id)}
              data-testid="ValueSetsList.Action.Delete"
              data-pr-tooltip="Delete"
            >
              <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
            </button>
          )}
        </div>
      ),
    },
  ], [valueSets, canUpdate, canDelete]);

  return (
    <PermissionGuard jobName={JOB_NAMES.VALUE_SETS}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-ValueSets-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-database" />
            </div>
            <h1 className={styles.title}>Value Sets Management</h1>
          </div>
          <p className={styles.subtitle}>
            Manage system value sets and configuration data
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
                    placeholder="Search value sets..."
                    value={searchQuery}
                    onChange={(value: string) => setSearchQuery(value)}
                    testId="ValueSetsList.Filter.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  <Dropdown
                    value={moduleFilter}
                    options={moduleOptions}
                    onChange={(e: { value: string }) => setModuleFilter(e.value || '')}
                    placeholder="All Modules"
                    style={{ width: '160px' }}
                    data-testid="ValueSetsList.Filter.Module"
                    resetFilterOnHide={true}
                  />
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="value-sets-export.xlsx"
                    testId="ValueSetsList.Button.Export"
                  />
                  <RefreshButton
                    onClick={() => fetchValueSets(Math.floor(first / pageSize) + 1, pageSize, sortField, sortOrder)}
                    loading={loading}
                    testId="ValueSetsList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Value Set"
                      icon="pi pi-plus"
                      onClick={() => navigate('/value-sets/create')}
                      testId="ValueSetsList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={valueSets}
              columns={columns}
              loading={loading}
              emptyMessage="No value sets found"
              dataKey="id"
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
          message="Are you sure you want to delete this value set? This action cannot be undone and may affect system functionality."
          testId="ValueSetsList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default ValueSetsList;
