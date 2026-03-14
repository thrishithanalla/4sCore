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
import { useAppNavigate } from '../../hooks/useAppNavigate';
import {
  fetchPermissionMappings,
  deletePermissionMapping,
  getJobsByModule,
  type PermissionMapping,
  type PermissionMappingSearchParams,
} from '../../services/permission-mapping.service';
import { modulesService } from '../../services/modules.service';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

interface FilterOption {
  _id: string;
  name: string;
}

const PermissionMappingList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'permission-mappings',
    basePath: '/permission-mappings',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.PERMISSION_MAPPINGS);
  const canUpdate = useCanUpdate(JOB_NAMES.PERMISSION_MAPPINGS);
  const canDelete = useCanDelete(JOB_NAMES.PERMISSION_MAPPINGS);
  const [mappings, setMappings] = useState<(PermissionMapping & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filter state
  const [modules, setModules] = useState<FilterOption[]>([]);
  const [jobs, setJobs] = useState<FilterOption[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [jobsLoading, setJobsLoading] = useState(false);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Load modules filter options
  useEffect(() => {
    const loadModules = async () => {
      try {
        const modulesData = await modulesService.getAllForDropdown();
        setModules(modulesData.map((m: any) => ({ _id: m._id, name: m.name })));
      } catch (err) {
        console.error('Failed to load modules:', err);
      }
    };
    loadModules();
  }, []);

  // Load jobs when module is selected
  useEffect(() => {
    const loadJobsByModule = async () => {
      if (!selectedModule) {
        setJobs([]);
        return;
      }

      setJobsLoading(true);
      try {
        const jobsData = await getJobsByModule(selectedModule);
        setJobs(jobsData.map((j: any) => ({ _id: j._id, name: j.name })));
      } catch (err) {
        console.error('Failed to load jobs for module:', err);
        setJobs([]);
        showError('Failed to load jobs for selected module');
      } finally {
        setJobsLoading(false);
      }
    };

    loadJobsByModule();
  }, [selectedModule, showError]);

  const loadMappings = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: PermissionMappingSearchParams = {
        page,
        page_size: size,
      };
      if (selectedModule) params.moduleId = selectedModule;
      if (selectedJob) params.jobId = selectedJob;

      const response = await fetchPermissionMappings(params);
      const mappingsData = response.data || [];
      setMappings(mappingsData.map((mapping) => ({ ...mapping, id: mapping._id })));

      // Handle pagination from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to load permission mappings:', err);
      showError(extractErrorMessage(err, 'Failed to load permission mappings'));
    } finally {
      setLoading(false);
    }
  }, [selectedModule, selectedJob, pageSize, showError]);

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
  }, [selectedModule, selectedJob]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await deletePermissionMapping(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      loadMappings(Math.floor(first / pageSize) + 1, pageSize);
    } catch (err: any) {
      console.error('Failed to delete permission mapping:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete permission mapping'));
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
    setJobs([]);
  };

  const handleModuleChange = (value: string) => {
    setSelectedModule(value);
    // Clear job selection when module changes
    setSelectedJob('');
    setJobs([]);
  };

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'moduleName', header: 'Module' },
    { field: 'jobName', header: 'Job' },
    { field: 'permissionName', header: 'Permission' },
    { field: 'createdAt', header: 'Created At' },
  ], []);

  // Filter rows based on search text
  const filteredRows = useMemo(() => {
    if (!searchText) return mappings;
    const lowerSearch = searchText.toLowerCase();
    return mappings.filter((row) => {
      return (
        row.moduleName?.toLowerCase().includes(lowerSearch) ||
        row.jobName?.toLowerCase().includes(lowerSearch) ||
        row.permissionName?.toLowerCase().includes(lowerSearch)
      );
    });
  }, [mappings, searchText]);

  // Fetch export data (uses client-side filtered rows)
  const fetchExportData = useCallback(async () => {
    return filteredRows;
  }, [filteredRows]);

  const columns: DataTableColumn<PermissionMapping & { id: string }>[] = useMemo(
    () => [
      {
        field: 'moduleName',
        header: 'Module',
        sortable: true,
        body: (rowData: PermissionMapping) => rowData.moduleName || '-',
      },
      {
        field: 'jobName',
        header: 'Job',
        sortable: true,
        body: (rowData: PermissionMapping) => rowData.jobName || '-',
      },
      {
        field: 'permissionName',
        header: 'Permission',
        sortable: true,
        body: (rowData: PermissionMapping) => (
          <Tag value={rowData.permissionName || '-'} severity="info" />
        ),
      },
      {
        field: 'createdAt',
        header: 'Created',
        sortable: true,
        body: (rowData: PermissionMapping) =>
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
        body: (rowData: PermissionMapping) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="PermissionMappingList.Action.View"
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
                    data-testid="PermissionMappingList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="PermissionMappingList.Action.Delete"
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

  // Job options for dropdown (only show if module is selected)
  const jobOptions = selectedModule
    ? [
        { value: '', label: 'All Jobs' },
        ...jobs.map((j) => ({ value: j._id, label: j.name })),
      ]
    : [{ value: '', label: 'Select Module first' }];

  return (
    <PermissionGuard jobName={JOB_NAMES.PERMISSION_MAPPINGS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4" data-testid="SCR-PermissionMapping-List">
        <div className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center">
              <i className="pi pi-key" style={{ fontSize: '1rem', color: 'white' }} />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Permission Mappings
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-11">
            Manage module-job-permission mappings
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
              testId="PermissionMappingList.Search"
              style={{ width: '220px' }}
              clearable
            />

            <Dropdown
              value={selectedModule}
              onChange={(e) => handleModuleChange(e.value)}
              options={moduleOptions}
              optionLabel="label"
              optionValue="value"
              placeholder="Filter by Module"
              className="w-48"
              data-testid="PermissionMappingList.Filter.Module"
            />

            <Dropdown
              value={selectedJob}
              onChange={(e) => setSelectedJob(e.value)}
              options={jobOptions}
              optionLabel="label"
              optionValue="value"
              placeholder={!selectedModule ? 'Select Module first' : jobsLoading ? 'Loading jobs...' : 'Filter by Job'}
              disabled={!selectedModule || jobsLoading}
              loading={jobsLoading}
              className="w-48"
              data-testid="PermissionMappingList.Filter.Job"
            />

            {(selectedModule || selectedJob) && (
              <button
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={handleClearFilters}
                data-testid="PermissionMappingList.Button.ClearFilters"
                data-pr-tooltip="Clear Filters"
              >
                <i className="pi pi-filter-slash text-sm text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
              </button>
            )}

            <div className="flex gap-2 ml-auto items-center">
              <ExportButton
                fetchData={fetchExportData}
                columns={exportColumns}
                filename="permission-mappings"
                testId="PermissionMappingList.Button.Export"
              />
              <RefreshButton onClick={handleRefresh} loading={loading} />

              {canCreate && (
                <Button
                  label="Add Permission Mapping"
                  icon="pi pi-plus"
                  onClick={() => navigate('/permission-mappings/create')}
                  testId="PermissionMappingList.Button.Create"
                  size="small"
                />
              )}
            </div>
          </div>
        </div>

        {/* DataTable from Core */}
        <DataTable
          data={filteredRows}
          columns={columns}
          loading={loading}
          emptyMessage="No permission mappings found"
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
          message="Are you sure you want to delete this permission mapping? This action cannot be undone."
          testId="PermissionMappingList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default PermissionMappingList;
