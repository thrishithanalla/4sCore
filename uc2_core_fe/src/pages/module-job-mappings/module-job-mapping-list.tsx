/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { Dropdown } from 'mainFe/Dropdown';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportButton } from 'mainFe/ExportButton';
import { InputSwitch } from 'primereact/inputswitch';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import {
  fetchModuleJobMappings,
  deleteModuleJobMapping,
  type ModuleJobMapping,
  type ModuleJobMappingSearchParams,
} from '../../services/module-job-mapping.service';
import { modulesService } from '../../services/modules.service';
import { jobsService } from '../../services/jobs.service';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

interface FilterOption {
  _id: string;
  name: string;
}

const ModuleJobMappingList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'module-job-mappings',
    basePath: '/module-job-mappings',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.MODULE_JOB_MAPPINGS);
  const canUpdate = useCanUpdate(JOB_NAMES.MODULE_JOB_MAPPINGS);
  const canDelete = useCanDelete(JOB_NAMES.MODULE_JOB_MAPPINGS);
  const [mappings, setMappings] = useState<(ModuleJobMapping & { id: string })[]>([]);
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

  // Filter state
  const [modules, setModules] = useState<FilterOption[]>([]);
  const [jobs, setJobs] = useState<FilterOption[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<string>('');

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  const showSuccess = useCallback((message: string) => {
    toast.current?.show({
      severity: 'success',
      summary: 'Success',
      detail: message,
      life: 3000,
    });
  }, []);

  // Load filter options
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [modulesData, jobsData] = await Promise.all([
          modulesService.getAllForDropdown(),
          jobsService.getAllForDropdown(),
        ]);
        setModules(modulesData.map((m: any) => ({ _id: m._id, name: m.name })));
        setJobs(jobsData.map((j: any) => ({ _id: j._id, name: j.name })));
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    loadFilterOptions();
  }, []);

  const loadMappings = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: ModuleJobMappingSearchParams = {
        page,
        page_size: size,
      };
      if (selectedModule) params.moduleId = selectedModule;
      if (selectedJob) params.jobId = selectedJob;
      if (includeDeleted) params.include_deleted = true;

      const response = await fetchModuleJobMappings(params);
      const mappedData = (response.data || []).map((mapping) => ({ ...mapping, id: mapping._id }));
      setMappings(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to load module-job mappings:', err);
      showError(extractErrorMessage(err, 'Failed to load module-job mappings'));
    } finally {
      setLoading(false);
    }
  }, [selectedModule, selectedJob, includeDeleted, pageSize, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    loadMappings(newPage, event.rows);
  };

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    loadMappings(1, pageSize);
  }, [selectedModule, selectedJob, includeDeleted]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await deleteModuleJobMapping(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showSuccess('Module-job mapping deleted successfully');
      loadMappings(Math.floor(first / pageSize) + 1, pageSize);
    } catch (err: any) {
      console.error('Failed to delete module-job mapping:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete module-job mapping'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleRefresh = () => {
    loadMappings(Math.floor(first / pageSize) + 1, pageSize);
  };

  const handleClearFilters = () => {
    setSelectedModule('');
    setSelectedJob('');
  };

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'moduleName', header: 'Module' },
    { field: 'jobName', header: 'Job' },
    { field: 'isActive', header: 'Status' },
    { field: 'createdAt', header: 'Created At' },
  ], []);

  // Fetch export data (uses current mappings)
  const fetchExportData = useCallback(async () => {
    return mappings;
  }, [mappings]);

  const columns: DataTableColumn<ModuleJobMapping & { id: string }>[] = useMemo(
    () => [
      {
        field: 'moduleName',
        header: 'Module',
        sortable: true,
        body: (rowData: ModuleJobMapping) => (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <i className="pi pi-box text-indigo-600 dark:text-indigo-400" style={{ fontSize: '0.875rem' }} />
            </div>
            <span>{rowData.moduleName || '-'}</span>
          </div>
        ),
      },
      {
        field: 'jobName',
        header: 'Job',
        sortable: true,
        body: (rowData: ModuleJobMapping) => (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <i className="pi pi-briefcase text-amber-600 dark:text-amber-400" style={{ fontSize: '0.875rem' }} />
            </div>
            <span>{rowData.jobName || '-'}</span>
          </div>
        ),
      },
      {
        field: 'isActive',
        header: 'Status',
        sortable: true,
        body: (rowData: ModuleJobMapping) => {
          if ((rowData as any).isDelete || rowData.isDeleted) {
            return <Tag value="Deleted" severity="danger" />;
          }
          return rowData.isActive ? (
            <Tag value="Active" severity="success" />
          ) : (
            <Tag value="Inactive" severity="warning" />
          );
        },
      },
      {
        field: 'createdAt',
        header: 'Created',
        sortable: true,
        body: (rowData: ModuleJobMapping) =>
          rowData.createdAt
            ? new Date(rowData.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '-',
      },
      {
        field: 'actions',
        header: 'Actions',
      headerStyle: { textAlign: 'center' },
        sortable: false,
        body: (rowData: ModuleJobMapping) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="ModuleJobMappingList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target="[data-pr-tooltip]" />

            {!((rowData as any).isDelete || rowData.isDeleted) && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="ModuleJobMappingList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="ModuleJobMappingList.Action.Delete"
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

  // Module options for dropdown
  const moduleOptions = [
    { value: '', label: 'All Modules' },
    ...modules.map((m) => ({ value: m._id, label: m.name })),
  ];

  // Job options for dropdown
  const jobOptions = [
    { value: '', label: 'All Jobs' },
    ...jobs.map((j) => ({ value: j._id, label: j.name })),
  ];

  return (
    <PermissionGuard jobName={JOB_NAMES.MODULE_JOB_MAPPINGS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4" data-testid="SCR-ModuleJobMapping-List">
        <div className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-lg bg-purple-600 flex items-center justify-center">
              <i className="pi pi-sitemap" style={{ fontSize: '1.75rem', color: 'white' }} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Module-Job Mappings
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-15">
            Manage which jobs are available within each module
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          {/* Custom Toolbar */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-3 items-center flex-wrap">
              <Input
                name="search"
                placeholder="Search..."
                value={searchText}
                onChange={(value: string) => setSearchText(value)}
                testId="ModuleJobMappingList.Search"
                style={{ width: '220px' }}
                clearable
              />

              <Dropdown
                value={selectedModule}
                onChange={(e: any) => setSelectedModule(e.value)}
                options={moduleOptions}
                optionLabel="label"
                optionValue="value"
                placeholder="Filter by Module"
                className="w-48"
                data-testid="ModuleJobMappingList.Filter.Module"
              />

              <Dropdown
                value={selectedJob}
                onChange={(e: any) => setSelectedJob(e.value)}
                options={jobOptions}
                optionLabel="label"
                optionValue="value"
                placeholder="Filter by Job"
                className="w-48"
                data-testid="ModuleJobMappingList.Filter.Job"
              />

              {canDelete && (
                <div className="flex items-center gap-2">
                  <InputSwitch
                    checked={includeDeleted}
                    onChange={(e) => setIncludeDeleted(e.value)}
                    data-testid="ModuleJobMappingList.Toggle.IncludeDeleted"
                  />
                  <label className="text-sm text-gray-700 dark:text-gray-300">Show Deleted</label>
                </div>
              )}

              {(selectedModule || selectedJob) && (
                <button
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={handleClearFilters}
                  data-testid="ModuleJobMappingList.Button.ClearFilters"
                  data-pr-tooltip="Clear Filters"
                >
                  <i className="pi pi-filter-slash text-sm text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              <div className="flex gap-2 ml-auto items-center">
                <ExportButton
                  fetchData={fetchExportData}
                  columns={exportColumns}
                  filename="module-job-mappings"
                  testId="ModuleJobMappingList.Button.Export"
                />
                <RefreshButton onClick={handleRefresh} loading={loading} />

                {canCreate && (
                  <Button
                    label="Add Mapping"
                    icon="pi pi-plus"
                    onClick={() => navigate('/module-job-mappings/create')}
                    testId="ModuleJobMappingList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable from Core */}
          <DataTable
            data={mappings}
            columns={columns}
            loading={loading}
            emptyMessage="No module-job mappings found"
            dataKey="_id"
            paginator
            lazy
            first={first}
            rows={pageSize}
            totalRecords={totalRecords}
            onPage={handlePageChange}
            rowsPerPageOptions={[5, 10, 25, 50]}
          />
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this module-job mapping? This action cannot be undone."
          testId="ModuleJobMappingList.Dialog.Delete"
          loading={deleteLoading}
        />

      </div>
    </PermissionGuard>
  );
};

export default ModuleJobMappingList;
