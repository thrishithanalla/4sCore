/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
// InputNumber removed - using custom stepper UI for Display Order
import { Checkbox } from 'primereact/checkbox';
import { MultiSelect } from 'primereact/multiselect';
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { modulesService } from '../../services/modules.service';
import { valueSetsService } from '../../services/value-sets.service';
import type { Module, EmbeddedJob, EmbeddedJobCreate, EmbeddedJobUpdate } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

// Job form initial state
const initialJobForm: EmbeddedJobCreate = {
  name: '',
  shortCode: '',
  description: '',
  displayName: '',
  route: '',
  menuEligibility: true,
  displayOrder: 1,
  allowedPermissions: [],
};

const ModuleView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'modules',
    basePath: '/modules',
  });
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const canUpdate = useCanUpdate(JOB_NAMES.MODULES);
  const canDelete = useCanDelete(JOB_NAMES.MODULES);

  const [data, setData] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Job dialog state
  const [jobDialogVisible, setJobDialogVisible] = useState(false);
  const [editingJob, setEditingJob] = useState<EmbeddedJob | null>(null);
  const [jobForm, setJobForm] = useState<EmbeddedJobCreate>(initialJobForm);
  const [jobFormErrors, setJobFormErrors] = useState<Record<string, string>>({});

  // Jobs search filter state
  const [jobSearchFilter, setJobSearchFilter] = useState('');

  // Set breadcrumb title to show module name instead of UUID
  useBreadcrumbTitle(data?.name);

  // Fetch permissions from value-sets API
  const { data: permissionsData } = useQuery({
    queryKey: ['value-sets', 'PERMISSIONS'],
    queryFn: () => valueSetsService.getByKey('PERMISSIONS'),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Transform permissions: use code for both label and value (e.g., "CREATE")
  // This ensures stored allowedPermissions (uppercase) match option values
  const permissionOptions = useMemo(() =>
    (permissionsData?.items || []).map((item) => ({
      label: item.code, // Display the code (e.g., "CREATE")
      value: item.code, // Use code as value to match stored permissions
    })),
    [permissionsData]
  );

  // Filter jobs based on search term
  const filteredJobs = useMemo(() => {
    if (!data?.jobs || !jobSearchFilter.trim()) return data?.jobs || [];
    const searchLower = jobSearchFilter.toLowerCase();
    return data.jobs.filter((job) =>
      job.name.toLowerCase().includes(searchLower) ||
      job.shortCode.toLowerCase().includes(searchLower) ||
      job.displayName.toLowerCase().includes(searchLower) ||
      job.route.toLowerCase().includes(searchLower)
    );
  }, [data?.jobs, jobSearchFilter]);

  // Fetch module data
  const fetchModule = useCallback(async () => {
    if (!isReady || !id) return;
    try {
      setLoading(true);
      const res = await modulesService.getById(id);
      setData(res);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch module'));
    } finally {
      setLoading(false);
    }
  }, [isReady, id]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  // Mutations for job management
  const addJobMutation = useMutation({
    mutationFn: (job: EmbeddedJobCreate) => modulesService.addJob(id!, job),
    onSuccess: (updatedModule) => {
      setData(updatedModule);
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Job added successfully',
        life: 3000,
      });
      closeJobDialog();
    },
    onError: (err: any) => {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to add job'),
        life: 10000,
      });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ jobName, updates }: { jobName: string; updates: EmbeddedJobUpdate }) =>
      modulesService.updateJob(id!, jobName, updates),
    onSuccess: (updatedModule) => {
      setData(updatedModule);
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Job updated successfully',
        life: 3000,
      });
      closeJobDialog();
    },
    onError: (err: any) => {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to update job'),
        life: 10000,
      });
    },
  });

  const removeJobMutation = useMutation({
    mutationFn: (jobName: string) => modulesService.removeJob(id!, jobName),
    onSuccess: (updatedModule) => {
      setData(updatedModule);
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Job removed successfully',
        life: 3000,
      });
    },
    onError: (err: any) => {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to remove job'),
        life: 10000,
      });
    },
  });

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await modulesService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete module'));
    }
  };

  // Job dialog handlers
  const openAddJobDialog = () => {
    setEditingJob(null);
    setJobForm({
      ...initialJobForm,
      displayOrder: (data?.jobs?.length || 0) + 1,
    });
    setJobFormErrors({});
    setJobDialogVisible(true);
  };

  const openEditJobDialog = (job: EmbeddedJob) => {
    setEditingJob(job);
    setJobForm({
      name: job.name,
      shortCode: job.shortCode,
      description: job.description || '',
      displayName: job.displayName,
      route: job.route,
      menuEligibility: job.menuEligibility,
      displayOrder: job.displayOrder,
      allowedPermissions: job.allowedPermissions || [],
    });
    setJobFormErrors({});
    setJobDialogVisible(true);
  };

  const closeJobDialog = () => {
    setJobDialogVisible(false);
    setEditingJob(null);
    setJobForm(initialJobForm);
    setJobFormErrors({});
  };

  const validateJobForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!jobForm.name?.trim()) errors.name = 'Job name is required';
    if (!jobForm.shortCode?.trim()) errors.shortCode = 'Short code is required';
    if (!jobForm.displayName?.trim()) errors.displayName = 'Display name is required';
    if (!jobForm.route?.trim()) errors.route = 'Route is required';

    setJobFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveJob = () => {
    if (!validateJobForm()) return;

    if (editingJob) {
      // Update existing job
      const updates: EmbeddedJobUpdate = {
        name: jobForm.name,
        shortCode: jobForm.shortCode,
        description: jobForm.description || undefined,
        displayName: jobForm.displayName,
        menuEligibility: jobForm.menuEligibility,
        displayOrder: jobForm.displayOrder,
        allowedPermissions: jobForm.allowedPermissions,
      };
      updateJobMutation.mutate({ jobName: editingJob.name, updates });
    } else {
      // Add new job
      addJobMutation.mutate(jobForm);
    }
  };

  const handleRemoveJob = (job: EmbeddedJob) => {
    confirmDialog({
      message: `Are you sure you want to remove the job "${job.name}"? This action cannot be undone.`,
      header: 'Remove Job',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () => {
        removeJobMutation.mutate(job.name);
      },
    });
  };

  // Table column renderers
  const permissionsBodyTemplate = (rowData: EmbeddedJob) => {
    const permissions = rowData.allowedPermissions || [];
    if (permissions.length === 0) {
      return <span className="text-gray-400">No permissions</span>;
    }
    return (
      <div className="flex flex-wrap gap-1 justify-start items-start">
        {permissions.map((perm) => (
          <Tag
            key={perm}
            value={perm}
            severity={
              perm === 'CREATE' ? 'success' :
              perm === 'READ' ? 'info' :
              perm === 'UPDATE' ? 'warning' :
              perm === 'DELETE' ? 'danger' : undefined
            }
            className="text-xs"
          />
        ))}
      </div>
    );
  };

  const menuEligibilityBodyTemplate = (rowData: EmbeddedJob) => (
    <Tag
      value={rowData.menuEligibility ? 'Yes' : 'No'}
      severity={rowData.menuEligibility ? 'success' : 'secondary'}
    />
  );

  const actionsBodyTemplate = (rowData: EmbeddedJob) => (
    <div className="flex gap-1 justify-center">
      <button
        className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        onClick={() => openEditJobDialog(rowData)}
        title="Edit Job"
      >
        <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1rem' }} />
      </button>
      <button
        className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        onClick={() => handleRemoveJob(rowData)}
        title="Remove Job"
      >
        <i className="pi pi-trash text-red-600" style={{ fontSize: '1rem' }} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Module not found'} className="mb-4 w-full" />
        <Button
          label="Back to Modules"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  const isSavingJob = addJobMutation.isPending || updateJobMutation.isPending;

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <ConfirmDialog />

      <div className="p-3" data-testid="SCR-Module-View">
        {/* Header Section */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Button
              icon="pi pi-arrow-left"
              severity="secondary"
              text
              rounded
              onClick={() => navigateToList()}
              className="p-0"
              style={{ width: '28px', height: '28px' }}
            />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Module Details</h1>
          </div>
        </div>

        {/* Module Profile Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className="w-12 h-12 rounded bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-box text-violet-600 dark:text-violet-400" style={{ fontSize: '1.25rem' }} />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h2>
                {data.isDelete ? (
                  <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
                ) : data.isActive === false ? (
                  <Tag value="Inactive" severity="warning" className="text-xs px-1.5 py-0.5" />
                ) : (
                  <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data.shortCode || 'No short code'} • {data.jobs?.length || 0} jobs
              </p>
            </div>
          </div>

          {/* Edit/Delete buttons aligned with profile */}
          {!data.isDelete && (
            <div className="flex gap-1.5 sm:self-center">
              {canUpdate && (
                <Button
                  label="Edit"
                  icon="pi pi-pencil"
                  onClick={handleEdit}
                  size="small"
                />
              )}
              {canDelete && (
                <Button
                  label="Delete"
                  icon="pi pi-trash"
                  severity="danger"
                  onClick={handleDeleteClick}
                  size="small"
                />
              )}
            </div>
          )}
        </div>

        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Short Code</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.shortCode || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Display Order</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.displayOrder || 1}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Description</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.description || 'No description provided'}</p>
            </div>
          </div>
        </div>

        {/* Jobs Section */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3 mt-2">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Jobs</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Manage jobs and their permissions within this module
              </p>
            </div>
            {!data.isDelete && (
              <Button
                label="Add Job"
                icon="pi pi-plus"
                size="small"
                onClick={openAddJobDialog}
              />
            )}
          </div>

          {(!data.jobs || data.jobs.length === 0) ? (
            <div className="text-center py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded">
              <i className="pi pi-briefcase text-3xl text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No jobs defined for this module</p>
              {!data.isDelete && (
                <Button
                  label="Add Your First Job"
                  icon="pi pi-plus"
                  size="small"
                  onClick={openAddJobDialog}
                />
              )}
            </div>
          ) : (
            <>
              {/* Jobs Search Filter */}
              <div className="mb-2 flex items-center flex-wrap gap-2">
                <div className="relative w-full sm:w-64">
                  <i className="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none" />
                  <InputText
                    value={jobSearchFilter}
                    onChange={(e) => setJobSearchFilter(e.target.value)}
                    placeholder="Search jobs..."
                    className="w-full p-inputtext-left-icon"
                  />
                </div>
                {jobSearchFilter && (
                  <span className="text-xs text-gray-500">
                    Showing {filteredJobs.length} of {data.jobs.length} jobs
                  </span>
                )}
              </div>

              <DataTable
                value={filteredJobs}
                dataKey="name"
                stripedRows
                size="small"
                scrollable
                scrollHeight="350px"
                emptyMessage={jobSearchFilter ? "No jobs match your search" : "No jobs found"}
                className="text-sm"
              >
                <Column
                  field="name"
                  header="Name"
                  sortable
                  style={{ minWidth: '150px' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                <Column
                  field="shortCode"
                  header="Code"
                  sortable
                  style={{ width: '100px' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                <Column
                  field="displayName"
                  header="Display Name"
                  sortable
                  style={{ minWidth: '150px' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                <Column
                  field="route"
                  header="Route"
                  sortable
                  style={{ minWidth: '120px' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                <Column
                  field="allowedPermissions"
                  header="Permissions"
                  body={permissionsBodyTemplate}
                  style={{ minWidth: '200px', verticalAlign: 'top' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                <Column
                  field="menuEligibility"
                  header="Menu"
                  body={menuEligibilityBodyTemplate}
                  style={{ width: '80px' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                <Column
                  field="displayOrder"
                  header="Order"
                  sortable
                  style={{ width: '80px' }}
                  headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                  bodyClassName="py-2 px-3"
                />
                {!data.isDelete && (
                  <Column
                    header="Actions"
                    body={actionsBodyTemplate}
                    style={{ width: '100px' }}
                    frozen
                    alignFrozen="right"
                    headerClassName="py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700"
                    bodyClassName="py-2 px-3"
                  />
                )}
              </DataTable>
            </>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={() => setDeleteDialogOpen(false)}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this module? This action cannot be undone."
          testId="ModuleView.Dialog.Delete"
        />

        {/* Add/Edit Job Dialog */}
        <Dialog
          visible={jobDialogVisible}
          onHide={closeJobDialog}
          header={editingJob ? 'Edit Job' : 'Add Job'}
          style={{ width: '600px' }}
          modal
          draggable={false}
          footer={
            <div className="flex gap-2 justify-end">
              <Button
                label="Cancel"
                severity="secondary"
                outlined
                onClick={closeJobDialog}
                disabled={isSavingJob}
              />
              <Button
                label={isSavingJob ? 'Saving...' : editingJob ? 'Update' : 'Add'}
                icon={isSavingJob ? 'pi pi-spin pi-spinner' : undefined}
                onClick={handleSaveJob}
                disabled={isSavingJob}
              />
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            {/* Job Name */}
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Job Name <span className="text-red-500">*</span>
              </label>
              <InputText
                value={jobForm.name}
                onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                placeholder="e.g., USERS"
                className={`w-full ${jobFormErrors.name ? 'p-invalid' : ''}`}
              />
              {jobFormErrors.name && (
                <small className="text-red-500">{jobFormErrors.name}</small>
              )}
            </div>

            {/* Short Code */}
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Short Code <span className="text-red-500">*</span>
              </label>
              <InputText
                value={jobForm.shortCode}
                onChange={(e) => setJobForm({ ...jobForm, shortCode: e.target.value })}
                placeholder="e.g., USR"
                className={`w-full ${jobFormErrors.shortCode ? 'p-invalid' : ''}`}
              />
              {jobFormErrors.shortCode && (
                <small className="text-red-500">{jobFormErrors.shortCode}</small>
              )}
            </div>

            {/* Display Name */}
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <InputText
                value={jobForm.displayName}
                onChange={(e) => setJobForm({ ...jobForm, displayName: e.target.value })}
                placeholder="e.g., User Management"
                className={`w-full ${jobFormErrors.displayName ? 'p-invalid' : ''}`}
              />
              {jobFormErrors.displayName && (
                <small className="text-red-500">{jobFormErrors.displayName}</small>
              )}
            </div>

            {/* Route */}
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Route <span className="text-red-500">*</span>
                {editingJob && (
                  <span className="text-gray-400 font-normal ml-1">(cannot be changed)</span>
                )}
              </label>
              <InputText
                value={jobForm.route}
                onChange={(e) => setJobForm({ ...jobForm, route: e.target.value })}
                placeholder="e.g., /users"
                className={`w-full ${jobFormErrors.route ? 'p-invalid' : ''}`}
                disabled={!!editingJob}
              />
              {jobFormErrors.route && (
                <small className="text-red-500">{jobFormErrors.route}</small>
              )}
            </div>

            {/* Display Order */}
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Order
              </label>
              <div className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setJobForm({ ...jobForm, displayOrder: Math.max(1, (jobForm.displayOrder || 1) - 1) })}
                  className="flex items-center justify-center w-10 h-10 rounded-l-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={(jobForm.displayOrder || 1) <= 1}
                >
                  <i className="pi pi-minus text-sm" />
                </button>
                <div className="flex items-center justify-center w-16 h-10 border-t border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium">
                  {jobForm.displayOrder || 1}
                </div>
                <button
                  type="button"
                  onClick={() => setJobForm({ ...jobForm, displayOrder: (jobForm.displayOrder || 1) + 1 })}
                  className="flex items-center justify-center w-10 h-10 rounded-r-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                >
                  <i className="pi pi-plus text-sm" />
                </button>
              </div>
            </div>

            {/* Menu Eligibility */}
            <div className="col-span-1 flex items-end pb-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  inputId="menuEligibility"
                  checked={jobForm.menuEligibility ?? true}
                  onChange={(e) => setJobForm({ ...jobForm, menuEligibility: e.checked ?? true })}
                />
                <label htmlFor="menuEligibility" className="text-sm text-gray-700 dark:text-gray-300">
                  Menu Eligible
                </label>
              </div>
            </div>

            {/* Description */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <InputTextarea
                value={jobForm.description || ''}
                onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                rows={2}
                placeholder="Enter job description (optional)"
                className="w-full"
              />
            </div>

            {/* Allowed Permissions */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Allowed Permissions
              </label>
              <MultiSelect
                value={jobForm.allowedPermissions}
                options={permissionOptions}
                onChange={(e) => setJobForm({ ...jobForm, allowedPermissions: e.value })}
                placeholder="Select permissions"
                filter
                filterPlaceholder="Search permissions..."
                display="chip"
                className="w-full"
              />
              <small className="text-gray-500">
                Select which actions are allowed for this job
              </small>
            </div>
          </div>
        </Dialog>
      </div>
    </>
  );
};

export default ModuleView;
