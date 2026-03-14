/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useFieldArray, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputSwitch } from 'primereact/inputswitch';
import { MultiSelect } from 'primereact/multiselect';
import { Button } from 'mainFe/Button';
import { Dropdown } from 'mainFe/Dropdown';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { approvalFlowMasterService } from '../../services/approval-flow-master.service';
import { getModulesForDropdown } from '../../services/feedback-master.service';
import { masterService } from '../../services/master.service';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const extractApiError = (error: any): string | null => {
  const detail = error?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    return detail.message || detail.error?.errorCode || null;
  }
  const msg =
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    error?.message;
  return msg ? String(msg) : null;
};

// -----------------------------------------------------------------------------
// Zod Schema
// -----------------------------------------------------------------------------

const furtherProcessSchema = z.object({
  requestType: z.array(z.string()).min(1, 'At least one request type is required'),
  targetRole: z.string().min(1, 'Target role is required'),
  targetUserId: z.string().min(1, 'Target user is required'),
});

const approvalFlowMasterSchema = z.object({
  moduleId: z.string().min(1, 'Module is required'),
  flowName: z.string().min(1, 'Flow name is required').max(255, 'Must be <= 255 characters').trim(),
  description: z.string().max(1000, 'Must be <= 1000 characters').optional().or(z.literal('')),
  finalApprovalUnitId: z.string().min(1, 'Final approval unit is required'),
  finalApprovalPostCode: z.string().min(1, 'Final approval postcode is required'),
  districtId: z.string().optional().or(z.literal('')),
  furtherProcess: z.array(furtherProcessSchema).optional(),
  isActive: z.boolean(),
  ifRejected: z.string().min(1, 'If rejected action is required'),
});

export type ApprovalFlowMasterFormData = z.infer<typeof approvalFlowMasterSchema>;

// If Rejected Options
const ifRejectedOptions = [
  { label: 'False (No Action)', value: 'false' },
  { label: 'Send to Creator', value: 'Creator' },
  { label: 'Send to Previous Approver', value: 'Previous' },
];

// Request Type Options
const requestTypeOptions = [
  { label: 'Createor', value: 'Createor' },
  { label: 'Pervious', value: 'Pervious' }

];

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const ApprovalFlowMasterForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'approval-flow-master',
    basePath: '/approval-flow-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.APPROVAL_FLOW_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.APPROVAL_FLOW_MASTER);
  const hasPermission = isEditMode ? canUpdate : canCreate;

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: getModulesForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units', 'dropdown'],
    queryFn: masterService.getUnitsForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  const { data: districts = [] } = useQuery({
    queryKey: ['districts', 'dropdown'],
    queryFn: masterService.getDistricts,
    staleTime: 5 * 60 * 1000,
  });

  const { data: personnel = [], isLoading: personnelLoading } = useQuery({
    queryKey: ['personnel', 'dropdown'],
    queryFn: masterService.getUsersForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  const moduleOptions = modules.map((m) => ({
    label: m.name,
    value: m._id,
  }));

  const unitOptions = units.map((u: any) => ({
    label: u.name,
    value: u._id,
  }));

  const districtOptions = districts.map((d: any) => ({
    label: d.name,
    value: d._id,
  }));

  const personnelOptions = personnel.map((p: any) => {
    const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name;
    return {
      label: name ? `${name} (${p.userId})` : p.userId || p._id,
      value: p._id,
    };
  });

  const { data: existing, isLoading: fetchLoading } = useQuery({
    queryKey: ['approval-flow-master', id],
    queryFn: () => approvalFlowMasterService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show approval flow name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.flowName : null);

  // ---------------------------------------------------------------------------
  // Form Setup
  // ---------------------------------------------------------------------------

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ApprovalFlowMasterFormData>({
    resolver: zodResolver(approvalFlowMasterSchema) as Resolver<ApprovalFlowMasterFormData>,
    defaultValues: {
      moduleId: '',
      flowName: '',
      description: '',
      finalApprovalUnitId: '',
      finalApprovalPostCode: '',
      districtId: '',
      furtherProcess: [],
      isActive: true,
      ifRejected: 'false',
    },
    mode: 'onChange',
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'furtherProcess',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({
    when: isDirty,
  });

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Populate form in edit mode
  useEffect(() => {
    if (existing && isEditMode) {
      reset({
        moduleId: existing.moduleId || '',
        flowName: existing.flowName || '',
        description: existing.description || '',
        finalApprovalUnitId: existing.finalApprovalUnitId || '',
        finalApprovalPostCode: existing.finalApprovalPostCode || '',
        districtId: existing.districtId || '',
        furtherProcess: existing.furtherProcess || [],
        isActive: existing.isActive ?? true,
        ifRejected: existing.ifRejected || 'false',
      });
    }
  }, [existing, isEditMode, reset]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const createMut = useMutation({
    mutationFn: (payload: any) => approvalFlowMasterService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-flow-master'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Approval Flow created successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to create approval flow',
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => approvalFlowMasterService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-flow-master'] });
      queryClient.invalidateQueries({ queryKey: ['approval-flow-master', id] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Approval Flow updated successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const apiMsg = extractApiError(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: apiMsg ? `Save failed: ${apiMsg}` : 'Failed to update approval flow',
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const onSubmit = (data: ApprovalFlowMasterFormData) => {
    const payload: any = {
      moduleId: data.moduleId,
      flowName: data.flowName,
      description: data.description || undefined,
      finalApprovalUnitId: data.finalApprovalUnitId,
      finalApprovalPostCode: data.finalApprovalPostCode,
      districtId: data.districtId || undefined,
      furtherProcess: data.furtherProcess && data.furtherProcess.length > 0 ? data.furtherProcess : undefined,
      isActive: data.isActive,
      ifRejected: data.ifRejected,
    };

    if (isEditMode) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  const handleAddFurtherProcess = () => {
    append({
      requestType: [],
      targetRole: '',
      targetUserId: '',
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (fetchLoading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.APPROVAL_FLOW_MASTER}>
      <Toast ref={toast} position="top-right" />

      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid="SCR-ApprovalFlowMaster-Form">
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleNavigate('/approval-flow-master')}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Approval Flow' : 'Create Approval Flow'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode
                  ? 'Update approval flow configuration'
                  : 'Create a new approval flow for a module'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Basic Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Module Dropdown */}
              <Controller
                name="moduleId"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Module <span className="text-red-500">*</span>
                    </label>
                    <Dropdown
                      value={field.value}
                      options={moduleOptions}
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Select module..."
                      filter
                      filterPlaceholder="Search modules..."
                      className={`w-full ${errors.moduleId ? 'p-invalid' : ''}`}
                      showClear
                    />
                    {errors.moduleId && (
                      <small className="text-red-500">{errors.moduleId.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Flow Name */}
              <Controller
                name="flowName"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Flow Name <span className="text-red-500">*</span>
                    </label>
                    <InputText
                      id="flowName"
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="Enter flow name"
                      className={`w-full ${errors.flowName ? 'p-invalid' : ''}`}
                    />
                    {errors.flowName && (
                      <small className="text-red-500">{errors.flowName.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Description */}
              <div className="md:col-span-2">
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Description
                      </label>
                      <InputTextarea
                        id="description"
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        placeholder="Enter description"
                        rows={3}
                        className={`w-full ${errors.description ? 'p-invalid' : ''}`}
                      />
                      {errors.description && (
                        <small className="text-red-500">{errors.description.message}</small>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* District (Optional) */}
              <Controller
                name="districtId"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      District (Optional)
                    </label>
                    <Dropdown
                      value={field.value}
                      options={districtOptions}
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Select district..."
                      filter
                      filterPlaceholder="Search districts..."
                      className="w-full"
                      showClear
                    />
                  </div>
                )}
              />

              {/* Is Active */}
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Active Status
                    </label>
                    <div className="flex items-center gap-2 h-[42px]">
                      <InputSwitch
                        checked={field.value}
                        onChange={(e) => field.onChange(e.value)}
                      />
                      <span className="text-gray-700 dark:text-gray-300">
                        {field.value ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                )}
              />
            </div>
          </div>

          {/* Final Approval Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Final Approval Configuration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Final Approval Unit */}
              <Controller
                name="finalApprovalUnitId"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Final Approval Unit <span className="text-red-500">*</span>
                    </label>
                    <Dropdown
                      value={field.value}
                      options={unitOptions}
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Select unit..."
                      filter
                      filterPlaceholder="Search units..."
                      className={`w-full ${errors.finalApprovalUnitId ? 'p-invalid' : ''}`}
                      showClear
                    />
                    {errors.finalApprovalUnitId && (
                      <small className="text-red-500">{errors.finalApprovalUnitId.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Final Approval Postcode */}
              <Controller
                name="finalApprovalPostCode"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Final Approval Postcode <span className="text-red-500">*</span>
                    </label>
                    <InputText
                      id="finalApprovalPostCode"
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="Enter final approval postcode"
                      className={`w-full ${errors.finalApprovalPostCode ? 'p-invalid' : ''}`}
                    />
                    {errors.finalApprovalPostCode && (
                      <small className="text-red-500">{errors.finalApprovalPostCode.message}</small>
                    )}
                  </div>
                )}
              />

              {/* If Rejected */}
              <Controller
                name="ifRejected"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      If Rejected <span className="text-red-500">*</span>
                    </label>
                    <Dropdown
                      value={field.value}
                      options={ifRejectedOptions}
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Select action..."
                      className={`w-full ${errors.ifRejected ? 'p-invalid' : ''}`}
                    />
                    {errors.ifRejected && (
                      <small className="text-red-500">{errors.ifRejected.message}</small>
                    )}
                  </div>
                )}
              />
            </div>
          </div>

          {/* Further Process Steps */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-3">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Further Process Steps (Optional)
              </h2>
              <Button
                type="button"
                label="Add Step"
                icon="pi pi-plus"
                severity="secondary"
                outlined
                size="small"
                onClick={handleAddFurtherProcess}
              />
            </div>

            {fields.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-3 text-sm">
                No further process steps configured. Click "Add Step" to add one.
              </p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium px-2 py-0.5 rounded">
                        Step {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <i className="pi pi-trash text-red-600" style={{ fontSize: '1rem' }} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Request Type */}
                      <Controller
                        name={`furtherProcess.${index}.requestType`}
                        control={control}
                        render={({ field: selectField }) => (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Request Types <span className="text-red-500">*</span>
                            </label>
                            <MultiSelect
                              value={selectField.value}
                              options={requestTypeOptions}
                              onChange={(e) => selectField.onChange(e.value || [])}
                              placeholder="Select request types"
                              display="chip"
                              filter
                              filterPlaceholder="Search..."
                              className={`w-full ${errors.furtherProcess?.[index]?.requestType ? 'p-invalid' : ''}`}
                            />
                            {errors.furtherProcess?.[index]?.requestType && (
                              <small className="text-red-500">
                                {errors.furtherProcess[index]?.requestType?.message}
                              </small>
                            )}
                          </div>
                        )}
                      />

                      {/* Target Role */}
                      <Controller
                        name={`furtherProcess.${index}.targetRole`}
                        control={control}
                        render={({ field: roleField }) => (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Target Role <span className="text-red-500">*</span>
                            </label>
                            <InputText
                              value={roleField.value}
                              onChange={(e) => roleField.onChange(e.target.value)}
                              placeholder="Enter target role"
                              className={`w-full ${errors.furtherProcess?.[index]?.targetRole ? 'p-invalid' : ''}`}
                            />
                            {errors.furtherProcess?.[index]?.targetRole && (
                              <small className="text-red-500">
                                {errors.furtherProcess[index]?.targetRole?.message}
                              </small>
                            )}
                          </div>
                        )}
                      />

                      {/* Target User */}
                      <Controller
                        name={`furtherProcess.${index}.targetUserId`}
                        control={control}
                        render={({ field: userField }) => (
                          <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Target User <span className="text-red-500">*</span>
                            </label>
                            <Dropdown
                              value={userField.value}
                              options={personnelOptions}
                              onChange={(e) => userField.onChange(e.value)}
                              placeholder="Select user..."
                              filter
                              filterPlaceholder="Search users..."
                              className={`w-full ${errors.furtherProcess?.[index]?.targetUserId ? 'p-invalid' : ''}`}
                              showClear
                              virtualScrollerOptions={{ itemSize: 38 }}
                              loading={personnelLoading}
                            />
                            {errors.furtherProcess?.[index]?.targetUserId && (
                              <small className="text-red-500">
                                {errors.furtherProcess[index]?.targetUserId?.message}
                              </small>
                            )}
                          </div>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/approval-flow-master')}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
              icon={isSaving ? 'pi pi-spin pi-spinner' : undefined}
              disabled={isSaving}
            />
          </div>
        </form>
      </div>

      {/* Leave confirmation */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="ApprovalFlowMasterForm.Dialog.Leave"
      />
    </PermissionGuard>
  );
};

export default ApprovalFlowMasterForm;
