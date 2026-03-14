/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { MultiSelect } from 'primereact/multiselect';
import { Toast } from 'mainFe/Toast';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Skeleton } from 'primereact/skeleton';
import { Divider } from 'primereact/divider';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useFormDirtyTracker } from '../../hooks/useFormDirtyTracker';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import {
  getPermissionMappingById,
  createPermissionMappings,
  updatePermissionMapping,
  getJobsByModule,
  type BulkCreateResponse,
} from '../../services/permission-mapping.service';
import { modulesService } from '../../services/modules.service';
import { permissionsService } from '../../services/permissions.service';
import { extractErrorMessage } from '../../utils/error-handler';

interface DropdownOption {
  _id: string;
  name: string;
}

const PermissionMappingForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'permission-mappings',
    basePath: '/permission-mappings',
  });
  const isEditMode = Boolean(id);
  const toast = useRef<Toast>(null);

  // Form state
  const [moduleId, setModuleId] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');
  const [permissionIds, setPermissionIds] = useState<string[]>([]);

  // Dropdown options
  const [modules, setModules] = useState<DropdownOption[]>([]);
  const [jobs, setJobs] = useState<DropdownOption[]>([]);
  const [permissions, setPermissions] = useState<DropdownOption[]>([]);

  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [error, setError] = useState('');

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState({
    moduleId: '',
    jobId: '',
    permissionIds: '',
  });

  // Bulk create result
  const [bulkResult, setBulkResult] = useState<BulkCreateResponse | null>(null);

  // Dirty state tracking
  const { isDirty, setInitialValues, checkDirty } = useFormDirtyTracker({ skip: initialLoading });

  // Navigation blocker
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Compute breadcrumb title from module and job names
  const selectedModule = modules.find(m => m._id === moduleId);
  const selectedJob = jobs.find(j => j._id === jobId);
  const breadcrumbTitle = isEditMode && selectedModule && selectedJob
    ? `${selectedModule.name} - ${selectedJob.name}`
    : null;

  // Set breadcrumb title to show mapping info instead of UUID in edit mode
  useBreadcrumbTitle(breadcrumbTitle);

  // Load dropdown options (modules and permissions only - jobs loaded when module is selected)
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [modulesData, permissionsData] = await Promise.all([
          modulesService.getAllForDropdown(),
          permissionsService.getAllForDropdown(),
        ]);
        setModules(modulesData.map((m: any) => ({ _id: m._id, name: m.name })));
        setPermissions(permissionsData.map((p: any) => ({ _id: p._id, name: p.name })));

        if (!isEditMode) {
          setInitialLoading(false);
        }
      } catch (err) {
        console.error('Failed to load dropdown options:', err);
        setError('Failed to load form data');
        setInitialLoading(false);
      }
    };
    loadOptions();
  }, [isEditMode]);

  // Load jobs when module is selected
  useEffect(() => {
    const loadJobsByModule = async () => {
      if (!moduleId) {
        setJobs([]);
        setJobId('');
        return;
      }

      setJobsLoading(true);
      try {
        const jobsData = await getJobsByModule(moduleId);
        setJobs(jobsData.map((j: any) => ({ _id: j._id, name: j.name })));
      } catch (err) {
        console.error('Failed to load jobs for module:', err);
        setJobs([]);
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load jobs for selected module',
          life: 3000,
        });
      } finally {
        setJobsLoading(false);
      }
    };

    // Don't fetch jobs during initial edit mode load (will be handled by loadMapping)
    if (!initialLoading || !isEditMode) {
      loadJobsByModule();
    }
  }, [moduleId, initialLoading, isEditMode]);

  // Load existing mapping in edit mode - wait for ID decryption
  useEffect(() => {
    const loadMapping = async () => {
      if (!isEditMode || !isReady || !id) return;

      try {
        const mapping = await getPermissionMappingById(id);

        // First set the module and load jobs for that module
        setModuleId(mapping.moduleId);

        // Load jobs for the module
        const jobsData = await getJobsByModule(mapping.moduleId);
        setJobs(jobsData.map((j: any) => ({ _id: j._id, name: j.name })));

        // Then set the job and permission
        setJobId(mapping.jobId);
        setPermissionIds([mapping.permissionId]);

        // Store initial values for dirty checking
        setInitialValues({
          moduleId: mapping.moduleId,
          jobId: mapping.jobId,
          permissionIds: [mapping.permissionId],
        });
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to load permission mapping'));
      } finally {
        setInitialLoading(false);
      }
    };

    if (modules.length > 0 && permissions.length > 0) {
      loadMapping();
    }
  }, [id, isReady, isEditMode, modules, permissions, setInitialValues]);

  // Set initial values for create mode
  useEffect(() => {
    if (!isEditMode && !initialLoading) {
      setInitialValues({
        moduleId: '',
        jobId: '',
        permissionIds: [],
      });
    }
  }, [isEditMode, initialLoading, setInitialValues]);

  // Track dirty state by comparing current values with initial values
  useEffect(() => {
    if (initialLoading) return;
    checkDirty({ moduleId, jobId, permissionIds });
  }, [moduleId, jobId, permissionIds, initialLoading, checkDirty]);

  const handleSubmit = async () => {
    // Clear previous errors
    setFieldErrors({ moduleId: '', jobId: '', permissionIds: '' });
    setError('');

    // Validate fields
    const errors = {
      moduleId: !moduleId ? 'Module is required' : '',
      jobId: !jobId ? 'Job is required' : '',
      permissionIds: permissionIds.length === 0 ? 'At least one permission is required' : '',
    };

    setFieldErrors(errors);

    // Check if there are any errors
    if (errors.moduleId || errors.jobId || errors.permissionIds) {
      return;
    }

    setLoading(true);
    setBulkResult(null);

    try {
      if (isEditMode && id) {
        // Update single mapping
        await updatePermissionMapping(id, {
          moduleId,
          jobId,
          permissionId: permissionIds[0],
        });
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Permission mapping updated successfully',
          life: 3000,
        });
        setTimeout(() => navigateToList(), 1000);
      } else {
        // Create - uses smart endpoint selection
        const result = await createPermissionMappings(moduleId, jobId, permissionIds);

        if (result.success) {
          if (permissionIds.length === 1) {
            toast.current?.show({
              severity: 'success',
              summary: 'Success',
              detail: 'Permission mapping created successfully',
              life: 3000,
            });
            setTimeout(() => navigateToList(), 1000);
          } else {
            // Show bulk result
            const bulkData = result.data as BulkCreateResponse;
            setBulkResult(bulkData);
            if (bulkData.failedCount === 0) {
              toast.current?.show({
                severity: 'success',
                summary: 'Success',
                detail: `Successfully created ${bulkData.successCount} permission mappings`,
                life: 3000,
              });
            }
          }
        } else {
          setError(result.error || 'Failed to create permission mappings');
        }
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to save permission mapping'));
    } finally {
      setLoading(false);
    }
  };

  const getModuleName = (id: string) => modules.find((m) => m._id === id)?.name || id;
  const getJobName = (id: string) => jobs.find((j) => j._id === id)?.name || id;
  const getPermissionName = (id: string) => permissions.find((p) => p._id === id)?.name || id;

  // Module options for dropdown
  const moduleOptions = modules.map((m) => ({ value: m._id, label: m.name }));

  // Job options for dropdown
  const jobOptions = jobs.map((j) => ({ value: j._id, label: j.name }));

  // Permission options for dropdown/multiselect
  const permissionOptions = permissions.map((p) => ({ value: p._id, label: p.name }));

  // Loading skeleton
  if (initialLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="mb-3">
          <Skeleton width="180px" height="36px" className="mb-2" />
          <Skeleton width="250px" height="40px" />
          <Skeleton width="350px" height="24px" />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Skeleton height="56px" />
            <Skeleton height="56px" />
            <Skeleton height="56px" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900" data-testid="SCR-PermissionMapping-Form">
        {/* Header */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => handleNavigate('/permission-mappings')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
            data-testid="PermissionMappingForm.Button.Back"
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.125rem' }} />
            <span>Back to Permission Mappings</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditMode ? 'Edit Permission Mapping' : 'Create Permission Mapping'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isEditMode
              ? 'Update the module, job, and permission mapping'
              : 'Map permissions to a module and job. You can select multiple permissions at once.'}
          </p>
        </div>

        {/* Only show top-level error for server/API errors, not validation errors */}
        {error && !fieldErrors.moduleId && !fieldErrors.jobId && !fieldErrors.permissionIds && (
          <Message severity="error" text={error} className="w-full mb-3" />
        )}

        {/* Bulk Create Result */}
        {bulkResult && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Bulk Create Results
            </h2>
            <div className="flex gap-2 mb-3">
              <Tag value={`Total: ${bulkResult.totalProcessed}`} />
              <Tag value={`Success: ${bulkResult.successCount}`} severity="success" />
              {bulkResult.failedCount > 0 && (
                <Tag value={`Failed: ${bulkResult.failedCount}`} severity="danger" />
              )}
            </div>

            {bulkResult.successful.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-green-600 mb-2">Successfully Created:</p>
                <div className="space-y-2">
                  {bulkResult.successful.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <i className="pi pi-check-circle text-green-600" />
                      <span>{getPermissionName(item.permissionId)}</span>
                      <span className="text-gray-400">
                        ({getModuleName(item.moduleId)} → {getJobName(item.jobId)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkResult.failed.length > 0 && (
              <div className="mb-3">
                <p className="text-sm font-medium text-red-600 mb-2">Failed:</p>
                <div className="space-y-2">
                  {bulkResult.failed.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <i className="pi pi-times-circle text-red-600" />
                      <span>{getPermissionName(item.data.permissionId)}</span>
                      <span className="text-gray-400">- {item.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              label="Back to List"
              icon="pi pi-arrow-left"
              onClick={() => navigateToList()}
            />
          </div>
        )}

        {/* Form */}
        {!bulkResult && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Mapping Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Module Select */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Module <span className="text-red-500">*</span>
                </label>
                <Dropdown
                  value={moduleId}
                  onChange={(e) => {
                    setModuleId(e.value);
                    // Clear job selection when module changes
                    setJobId('');
                    setJobs([]);
                    if (e.value) {
                      setFieldErrors((prev) => ({ ...prev, moduleId: '', jobId: '' }));
                    }
                  }}
                  options={moduleOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Select Module"
                  filter
                  filterPlaceholder="Search modules..."
                  className={`w-full ${fieldErrors.moduleId ? 'p-invalid' : ''}`}
                  data-testid="PermissionMappingForm.Dropdown.Module"
                />
                {fieldErrors.moduleId && (
                  <small className="text-red-500 text-sm">{fieldErrors.moduleId}</small>
                )}
              </div>

              {/* Job Select */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Job <span className="text-red-500">*</span>
                </label>
                <Dropdown
                  value={jobId}
                  onChange={(e) => {
                    setJobId(e.value);
                    if (e.value) {
                      setFieldErrors((prev) => ({ ...prev, jobId: '' }));
                    }
                  }}
                  options={jobOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder={!moduleId ? 'Select Module first' : jobsLoading ? 'Loading jobs...' : 'Select Job'}
                  filter
                  filterPlaceholder="Search jobs..."
                  disabled={!moduleId || jobsLoading}
                  loading={jobsLoading}
                  className={`w-full ${fieldErrors.jobId ? 'p-invalid' : ''}`}
                  data-testid="PermissionMappingForm.Dropdown.Job"
                />
                {fieldErrors.jobId && (
                  <small className="text-red-500 text-sm">{fieldErrors.jobId}</small>
                )}
                {moduleId && jobs.length === 0 && !jobsLoading && (
                  <small className="text-amber-500 text-sm">No jobs found for the selected module</small>
                )}
              </div>

              {/* Permission Select */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isEditMode ? 'Permission' : 'Permissions'} <span className="text-red-500">*</span>
                </label>
                {isEditMode ? (
                  <Dropdown
                    value={permissionIds[0] || ''}
                    onChange={(e) => {
                      setPermissionIds([e.value]);
                      if (e.value) {
                        setFieldErrors((prev) => ({ ...prev, permissionIds: '' }));
                      }
                    }}
                    options={permissionOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select Permission"
                    filter
                    filterPlaceholder="Search permissions..."
                    className={`w-full ${fieldErrors.permissionIds ? 'p-invalid' : ''}`}
                    data-testid="PermissionMappingForm.Dropdown.Permission"
                  />
                ) : (
                  <MultiSelect
                    value={permissionIds}
                    onChange={(e) => {
                      setPermissionIds(e.value);
                      if (e.value && e.value.length > 0) {
                        setFieldErrors((prev) => ({ ...prev, permissionIds: '' }));
                      }
                    }}
                    options={permissionOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select Permissions"
                    display="chip"
                    filter
                    filterPlaceholder="Search permissions..."
                    className={`w-full ${fieldErrors.permissionIds ? 'p-invalid' : ''}`}
                    data-testid="PermissionMappingForm.MultiSelect.Permissions"
                  />
                )}
                {fieldErrors.permissionIds && (
                  <small className="text-red-500 text-sm">{fieldErrors.permissionIds}</small>
                )}
              </div>
            </div>

            {/* Selected Permissions Summary */}
            {!isEditMode && permissionIds.length > 0 && (
              <div className="mt-6">
                <Divider />
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Selected Permissions ({permissionIds.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {permissionIds.map((permId) => (
                    <Tag
                      key={permId}
                      value={getPermissionName(permId)}
                      severity="info"
                      className="cursor-pointer"
                      onClick={() => setPermissionIds(permissionIds.filter((id) => id !== permId))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Info Banner */}
            {!isEditMode && permissionIds.length > 1 && (
              <Message
                severity="info"
                text={`You have selected ${permissionIds.length} permissions. They will be created as separate mappings.`}
                className="w-full mt-4"
              />
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end mt-6">
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                onClick={() => handleNavigate('/permission-mappings')}
                disabled={loading}
                data-testid="PermissionMappingForm.Button.Cancel"
              />
              <Button
                type="button"
                label={
                  loading
                    ? 'Saving...'
                    : isEditMode
                    ? 'Update'
                    : 'Create'
                }
                icon={loading ? 'pi pi-spin pi-spinner' : undefined}
                onClick={handleSubmit}
                disabled={loading}
                data-testid="PermissionMappingForm.Button.Submit"
              />
            </div>
          </div>
        )}
      </div>

      {/* Leave confirmation dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="PermissionMappingForm.Dialog.Leave"
      />
    </>
  );
};

export default PermissionMappingForm;
