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
  getModuleJobMappingById,
  createModuleJobMappings,
  updateModuleJobMapping,
  type BulkCreateResponse,
} from '../../services/module-job-mapping.service';
import { modulesService } from '../../services/modules.service';
import { jobsService } from '../../services/jobs.service';
import { extractErrorMessage } from '../../utils/error-handler';

interface DropdownOption {
  _id: string;
  name: string;
}

const ModuleJobMappingForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'module-job-mappings',
    basePath: '/module-job-mappings',
  });
  const isEditMode = Boolean(id);
  const toast = useRef<Toast>(null);

  // Form state
  const [moduleId, setModuleId] = useState<string>('');
  const [jobIds, setJobIds] = useState<string[]>([]);

  // Dropdown options
  const [modules, setModules] = useState<DropdownOption[]>([]);
  const [jobs, setJobs] = useState<DropdownOption[]>([]);

  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState({
    moduleId: '',
    jobIds: '',
  });

  // Bulk create result
  const [bulkResult, setBulkResult] = useState<BulkCreateResponse | null>(null);

  // Dirty state tracking
  const { isDirty, setInitialValues, checkDirty } = useFormDirtyTracker({ skip: initialLoading });

  // Navigation blocker
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Compute breadcrumb title from module and job names
  const selectedModule = modules.find(m => m._id === moduleId);
  const selectedJob = jobs.find(j => j._id === jobIds[0]);
  const breadcrumbTitle = isEditMode && selectedModule && selectedJob
    ? `${selectedModule.name} - ${selectedJob.name}`
    : null;

  // Set breadcrumb title to show mapping info instead of UUID in edit mode
  useBreadcrumbTitle(breadcrumbTitle);

  // Load dropdown options
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [modulesData, jobsData] = await Promise.all([
          modulesService.getAllForDropdown(),
          jobsService.getAllForDropdown(),
        ]);
        setModules(modulesData.map((m: any) => ({ _id: m._id, name: m.name })));
        setJobs(jobsData.map((j: any) => ({ _id: j._id, name: j.name })));

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

  // Load existing mapping in edit mode - wait for ID decryption
  useEffect(() => {
    const loadMapping = async () => {
      if (!isEditMode || !isReady || !id) return;

      try {
        const mapping = await getModuleJobMappingById(id);
        setModuleId(mapping.moduleId);
        setJobIds([mapping.jobId]);

        // Store initial values for dirty checking
        setInitialValues({
          moduleId: mapping.moduleId,
          jobIds: [mapping.jobId],
        });
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to load module-job mapping'));
      } finally {
        setInitialLoading(false);
      }
    };

    if (modules.length > 0 && jobs.length > 0) {
      loadMapping();
    }
  }, [id, isReady, isEditMode, modules, jobs, setInitialValues]);

  // Set initial values for create mode
  useEffect(() => {
    if (!isEditMode && !initialLoading) {
      setInitialValues({
        moduleId: '',
        jobIds: [],
      });
    }
  }, [isEditMode, initialLoading, setInitialValues]);

  // Track dirty state by comparing current values with initial values
  useEffect(() => {
    if (initialLoading) return;
    checkDirty({ moduleId, jobIds });
  }, [moduleId, jobIds, initialLoading, checkDirty]);

  const handleSubmit = async () => {
    // Clear previous errors
    setFieldErrors({ moduleId: '', jobIds: '' });
    setError('');

    // Validate fields
    const errors = {
      moduleId: !moduleId ? 'Module is required' : '',
      jobIds: jobIds.length === 0 ? 'At least one job is required' : '',
    };

    setFieldErrors(errors);

    // Check if there are any errors
    if (errors.moduleId || errors.jobIds) {
      return;
    }

    setLoading(true);
    setBulkResult(null);

    try {
      if (isEditMode && id) {
        // Update single mapping
        await updateModuleJobMapping(id, {
          moduleId,
          jobId: jobIds[0],
        });
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Module-job mapping updated successfully',
          life: 3000,
        });
        setTimeout(() => navigateToList(), 1000);
      } else {
        // Create - uses smart endpoint selection
        const result = await createModuleJobMappings(moduleId, jobIds);

        if (result.success) {
          if (jobIds.length === 1) {
            toast.current?.show({
              severity: 'success',
              summary: 'Success',
              detail: 'Module-job mapping created successfully',
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
                detail: `Successfully created ${bulkData.successCount} module-job mappings`,
                life: 3000,
              });
            }
          }
        } else {
          // Show error in toast instead of inline message
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: result.error || 'Failed to create module-job mappings',
            life: 5000,
          });
        }
      }
    } catch (err: any) {
      // Show error in toast instead of inline message
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to save module-job mapping'),
        life: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const getModuleName = (id: string) => modules.find((m) => m._id === id)?.name || id;
  const getJobName = (id: string) => jobs.find((j) => j._id === id)?.name || id;

  // Module options for dropdown
  const moduleOptions = modules.map((m) => ({ value: m._id, label: m.name }));

  // Job options for dropdown/multiselect
  const jobOptions = jobs.map((j) => ({ value: j._id, label: j.name }));

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900" data-testid="SCR-ModuleJobMapping-Form">
        {/* Header */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => handleNavigate('/module-job-mappings')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
            data-testid="ModuleJobMappingForm.Button.Back"
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.125rem' }} />
            <span>Back to Module-Job Mappings</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditMode ? 'Edit Module-Job Mapping' : 'Create Module-Job Mapping'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isEditMode
              ? 'Update the module and job mapping'
              : 'Link jobs to a module. You can select multiple jobs at once.'}
          </p>
        </div>

        {/* Only show top-level error for server/API errors, not validation errors */}
        {error && !fieldErrors.moduleId && !fieldErrors.jobIds && (
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
                      <span>{getModuleName(item.moduleId)}</span>
                      <i className="pi pi-arrow-right text-gray-400" style={{ fontSize: '0.75rem' }} />
                      <span>{getJobName(item.jobId)}</span>
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
                      <span>{getModuleName(item.data.moduleId)}</span>
                      <i className="pi pi-arrow-right text-gray-400" style={{ fontSize: '0.75rem' }} />
                      <span>{getJobName(item.data.jobId)}</span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Module Select */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Module <span className="text-red-500">*</span>
                </label>
                <Dropdown
                  value={moduleId}
                  onChange={(e) => {
                    setModuleId(e.value);
                    if (e.value) {
                      setFieldErrors((prev) => ({ ...prev, moduleId: '' }));
                    }
                  }}
                  options={moduleOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Select Module"
                  filter
                  filterPlaceholder="Search modules..."
                  className={`w-full ${fieldErrors.moduleId ? 'p-invalid' : ''}`}
                  data-testid="ModuleJobMappingForm.Dropdown.Module"
                />
                {fieldErrors.moduleId && (
                  <small className="text-red-500 text-sm">{fieldErrors.moduleId}</small>
                )}
              </div>

              {/* Job Select */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isEditMode ? 'Job' : 'Jobs'} <span className="text-red-500">*</span>
                </label>
                {isEditMode ? (
                  <Dropdown
                    value={jobIds[0] || ''}
                    onChange={(e) => {
                      setJobIds([e.value]);
                      if (e.value) {
                        setFieldErrors((prev) => ({ ...prev, jobIds: '' }));
                      }
                    }}
                    options={jobOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select Job"
                    filter
                    filterPlaceholder="Search jobs..."
                    className={`w-full ${fieldErrors.jobIds ? 'p-invalid' : ''}`}
                    data-testid="ModuleJobMappingForm.Dropdown.Job"
                  />
                ) : (
                  <MultiSelect
                    value={jobIds}
                    onChange={(e) => {
                      setJobIds(e.value);
                      if (e.value && e.value.length > 0) {
                        setFieldErrors((prev) => ({ ...prev, jobIds: '' }));
                      }
                    }}
                    options={jobOptions}
                    optionLabel="label"
                    optionValue="value"
                    placeholder="Select Jobs"
                    display="chip"
                    filter
                    filterPlaceholder="Search jobs..."
                    className={`w-full ${fieldErrors.jobIds ? 'p-invalid' : ''}`}
                    data-testid="ModuleJobMappingForm.MultiSelect.Jobs"
                  />
                )}
                {fieldErrors.jobIds && (
                  <small className="text-red-500 text-sm">{fieldErrors.jobIds}</small>
                )}
              </div>
            </div>

            {/* Selected Jobs Summary */}
            {!isEditMode && jobIds.length > 0 && (
              <div className="mt-6">
                <Divider />
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Selected Jobs ({jobIds.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {jobIds.map((jobId) => (
                    <Tag
                      key={jobId}
                      value={getJobName(jobId)}
                      severity="info"
                      className="cursor-pointer"
                      onClick={() => setJobIds(jobIds.filter((id) => id !== jobId))}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Info Banner */}
            {!isEditMode && jobIds.length > 1 && (
              <Message
                severity="info"
                text={`You have selected ${jobIds.length} jobs. They will be created as separate mappings for the selected module.`}
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
                onClick={() => handleNavigate('/module-job-mappings')}
                disabled={loading}
                data-testid="ModuleJobMappingForm.Button.Cancel"
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
                data-testid="ModuleJobMappingForm.Button.Submit"
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
        testId="ModuleJobMappingForm.Dialog.Leave"
      />
    </>
  );
};

export default ModuleJobMappingForm;
