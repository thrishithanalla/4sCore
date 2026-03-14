/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useMemo } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { Tag } from 'mainFe/Tag';
import { Calendar } from 'mainFe/Calendar';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import FormSearchableSelect, { type SelectOption, type LazyLoadResult } from '../../components/forms/form-searchable-select';
import { assignmentService, type AssignmentCreateRequest, type AssignmentUpdateRequest, type PopulatedRoleInfo } from '../../services/assignment.service';
import { personnelService } from '../../services/personnel.service';
import { unitsService } from '../../services/units.service';
import { extractErrorMessage } from '../../utils/error-handler';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { JOB_NAMES } from '../../constants/jobNames';

// Extended post option with role info
interface PostOptionWithRoles extends SelectOption {
  isUnitHead?: boolean;
  assignedRoles?: PopulatedRoleInfo[];
  description?: string;
  assignedUser?: string | null;
  isFilled?: boolean;
  disabled?: boolean;
}

// Assignment type options
const ASSIGNMENT_TYPE_OPTIONS = [
  { label: 'Primary Assignment', value: 'Primary Assignment' },
  { label: 'Incharge', value: 'Incharge' },
  { label: 'Deputation', value: 'Deputation' },
];

// Form schema
const END_DATE_REQUIRED_TYPES = ['Incharge', 'Deputation'];

const assignmentSchema = z.object({
  userId: z.string().min(1, 'Personnel is required'),
  unitId: z.string().min(1, 'Unit is required'),
  postCode: z.string().min(1, 'Post is required'),
  assignmentType: z.string().min(1, 'Assignment Type is required'),
  isActive: z.boolean().optional(),
  startDate: z.string().min(1, 'Start Date is required'),
  endDate: z.string().optional().or(z.literal('')),
}).refine(
  (data) => {
    // If endDate is provided, it must be >= startDate
    if (data.endDate && data.startDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End Date must be greater than or equal to Start Date',
    path: ['endDate'],
  }
).refine(
  (data) => {
    // End Date is required for Incharge and Deputation
    if (END_DATE_REQUIRED_TYPES.includes(data.assignmentType)) {
      return !!data.endDate;
    }
    return true;
  },
  {
    message: 'End Date is required for Incharge and Deputation',
    path: ['endDate'],
  }
);

type AssignmentFormData = z.infer<typeof assignmentSchema>;

const AssignmentForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'assignments',
    basePath: '/assignments',
  });
  const isEditMode = Boolean(id);
  const toast = useRef<Toast>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [personnelOptions, setPersonnelOptions] = useState<SelectOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<SelectOption[]>([]);
  const [postOptions, setPostOptions] = useState<PostOptionWithRoles[]>([]);
  const [personnelLoading, setPersonnelLoading] = useState(true);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [existingAssignmentTypes, setExistingAssignmentTypes] = useState<string[]>([]);

  // Store populated names for display in edit mode
  const [editModeDisplayNames, setEditModeDisplayNames] = useState<{
    personnelName: string;
    unitName: string;
    postName: string;
  } | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      userId: '',
      unitId: '',
      postCode: '',
      assignmentType: '',
      isActive: true,
      startDate: '',
      endDate: '',
    },
  });

  const selectedUnitId = watch('unitId');
  const selectedPostCode = watch('postCode');
  const selectedUserId = watch('userId');
  const selectedAssignmentType = watch('assignmentType');
  const isEndDateRequired = END_DATE_REQUIRED_TYPES.includes(selectedAssignmentType);

  // Filter assignment type options based on existing assignments
  const filteredAssignmentTypeOptions = useMemo(() => {
    // If user already has "Primary Assignment", filter it out
    if (existingAssignmentTypes.includes('Primary Assignment')) {
      return ASSIGNMENT_TYPE_OPTIONS.filter(opt => opt.value !== 'Primary Assignment');
    }
    return ASSIGNMENT_TYPE_OPTIONS;
  }, [existingAssignmentTypes]);

  // Load existing assignments when user is selected (only in create mode)
  useEffect(() => {
    const loadUserAssignments = async () => {
      if (!isEditMode && selectedUserId) {
        try {
          const assignments = await assignmentService.getUserAssignments(selectedUserId, true);
          const types = assignments
            .map(a => a.assignmentType)
            .filter((t): t is string => !!t);
          setExistingAssignmentTypes(types);
        } catch (err) {
          console.error('Failed to load user assignments:', err);
          setExistingAssignmentTypes([]);
        }
      } else {
        setExistingAssignmentTypes([]);
      }
    };
    loadUserAssignments();
  }, [selectedUserId, isEditMode]);


  // Set breadcrumb title
  useBreadcrumbTitle(isEditMode ? 'Edit Assignment' : 'Create Assignment');

  // Find the selected post's details for role preview
  const selectedPost = useMemo(() => {
    if (!selectedPostCode) return null;
    return postOptions.find((p) => p.value === selectedPostCode) || null;
  }, [selectedPostCode, postOptions]);

  // Load personnel and units on mount
  useEffect(() => {
    loadPersonnel();
    loadUnits();
  }, []);

  // Load posts when unit changes
  useEffect(() => {
    if (selectedUnitId) {
      loadPostsForUnit(selectedUnitId);
    } else {
      setPostOptions([]);
    }
  }, [selectedUnitId]);

  // Load assignment data in edit mode - only when isReady (decryption complete)
  useEffect(() => {
    if (!isReady) {
      return;
    }
    // For create mode, just set loading to false
    if (!isEditMode) {
      setLoading(false);
      return;
    }
    if (id) {
      loadAssignment();
    }
  }, [isReady, id, isEditMode]);

  const PAGE_SIZE = 10;

  // Load initial personnel (small set for display)
  const loadPersonnel = async () => {
    try {
      setPersonnelLoading(true);
      const response = await personnelService.getAll({ include_deleted: false, page_size: PAGE_SIZE, page: 1 });
      setPersonnelOptions(
        response.data.map((p: any) => ({
          value: p._id,
          label: `${p.name || ''} (${p.userId || p._id})`.trim(),
        }))
      );
    } catch (err) {
      console.error('Failed to load personnel:', err);
    } finally {
      setPersonnelLoading(false);
    }
  };

  // Lazy load personnel with infinite scroll support
  const lazyLoadPersonnel = async (page: number, searchTerm: string): Promise<LazyLoadResult> => {
    try {
      const response = await personnelService.getAll({
        include_deleted: false,
        page_size: PAGE_SIZE,
        page,
        search: searchTerm || undefined,
      });
      const options = response.data.map((p: any) => ({
        value: p._id,
        label: `${p.name || ''} (${p.userId || p._id})`.trim(),
      }));
      const total = response.pagination?.totalItems || 0;
      const hasMore = page * PAGE_SIZE < total;
      return { options, hasMore, total };
    } catch (err) {
      console.error('Failed to load personnel:', err);
      return { options: [], hasMore: false };
    }
  };

  // Load initial units (small set for display)
  const loadUnits = async () => {
    try {
      setUnitsLoading(true);
      const response = await unitsService.getAll({ include_deleted: false, page_size: PAGE_SIZE, page: 1 });
      setUnitOptions(
        response.data.map((u: any) => ({
          value: u._id,
          label: u.name,
        }))
      );
    } catch (err) {
      console.error('Failed to load units:', err);
    } finally {
      setUnitsLoading(false);
    }
  };

  // Lazy load units with infinite scroll support
  const lazyLoadUnits = async (page: number, searchTerm: string): Promise<LazyLoadResult> => {
    try {
      const response = await unitsService.getAll({
        include_deleted: false,
        page_size: PAGE_SIZE,
        page,
        search: searchTerm || undefined,
      });
      const options = response.data.map((u: any) => ({
        value: u._id,
        label: u.name,
      }));
      const total = response.pagination?.totalItems || 0;
      const hasMore = page * PAGE_SIZE < total;
      return { options, hasMore, total };
    } catch (err) {
      console.error('Failed to load units:', err);
      return { options: [], hasMore: false };
    }
  };

  const loadPostsForUnit = async (unitId: string) => {
    try {
      setPostsLoading(true);
      const unit = await unitsService.getById(unitId);
      const posts = (unit.posts || []).filter((p: any) => !p.isDelete);
      setPostOptions(
        posts.map((p: any) => {
          const isFilled = Boolean(p.assignedUser);
          const statusLabel = isFilled ? ' - Filled' : ' - Available';
          return {
            value: p.postCode,
            label: `${p.postName || p.postCode} (${p.postCode})${statusLabel}`,
            isUnitHead: p.isUnitHead || false,
            assignedRoles: p.assignedRoles || [],
            description: p.description,
            assignedUser: p.assignedUser || null,
            isFilled,
            disabled: isFilled,
          };
        })
      );
    } catch (err) {
      console.error('Failed to load posts:', err);
      setPostOptions([]);
    } finally {
      setPostsLoading(false);
    }
  };

  const loadAssignment = async () => {
    try {
      setLoading(true);
      const data = await assignmentService.getById(id!) as any;

      // Extract populated names for display
      const personnelName = data.user?.name
        ? `${data.user.name} (${data.user.userId || data.userId})`
        : data.userId;
      const unitName = data.unit?.name || data.unitId;
      const postName = data.post?.postName
        ? `${data.post.postName} (${data.postCode})`
        : data.postCode;

      setEditModeDisplayNames({
        personnelName,
        unitName,
        postName,
      });

      reset({
        userId: typeof data.userId === 'object' ? data.userId._id : data.userId,
        unitId: typeof data.unitId === 'object' ? data.unitId._id : data.unitId,
        postCode: data.postCode,
        assignmentType: data.assignmentType || '',
        isActive: data.isActive !== false,
        startDate: data.startDate ? data.startDate.split('T')[0] : '',
        endDate: data.endDate ? data.endDate.split('T')[0] : '',
      });
    } catch (err: any) {
      console.error('Failed to load assignment:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to load assignment'),
        life: 10000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to format date to ISO string with timezone offset (e.g., 2026-01-25T00:00:00.000+00:00)
  const formatDateToISO = (dateStr: string): string => {
    // Create date at midnight UTC and format with +00:00 offset
    const isoString = new Date(dateStr + 'T00:00:00.000Z').toISOString();
    // Replace 'Z' with '+00:00' for consistent timezone format
    return isoString.replace('Z', '+00:00');
  };

  const onSubmit = async (data: AssignmentFormData) => {
    try {
      setSubmitting(true);

      if (isEditMode) {
        const updatePayload: AssignmentUpdateRequest = {
          assignmentType: data.assignmentType,
          isActive: data.isActive,
          endDate: data.endDate ? formatDateToISO(data.endDate) : undefined,
        };
        await assignmentService.update(id!, updatePayload);
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Assignment updated successfully',
          life: 3000,
        });
      } else {
        const createPayload: AssignmentCreateRequest = {
          userId: data.userId,
          unitId: data.unitId,
          postCode: data.postCode,
          assignmentType: data.assignmentType,
          isActive: data.isActive,
          startDate: data.startDate ? formatDateToISO(data.startDate) : undefined,
        };
        await assignmentService.create(createPayload);
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Assignment created successfully',
          life: 3000,
        });
      }

      navigateToList();
    } catch (err: any) {
      console.error('Failed to save assignment:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to save assignment'),
        life: 10000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.ASSIGNMENTS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900" data-testid={isEditMode ? 'SCR-Assignment-Edit' : 'SCR-Assignment-Create'}>
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigateToList()}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Assignment' : 'Create New Assignment'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode ? 'Update assignment details' : 'Assign a user to a unit post'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          {isEditMode && editModeDisplayNames ? (
            /* Edit Mode - Redesigned Layout */
            <div className="p-4 space-y-6">
              {/* Assignment Details Section - Read Only */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <i className="pi pi-info-circle text-blue-500" />
                  Assignment Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Unit */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="pi pi-building text-blue-500" style={{ fontSize: '0.875rem' }} />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unit</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{editModeDisplayNames.unitName}</p>
                  </div>

                  {/* Personnel */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="pi pi-user text-green-500" style={{ fontSize: '0.875rem' }} />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Personnel</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{editModeDisplayNames.personnelName}</p>
                  </div>

                  {/* Post */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="pi pi-id-card text-purple-500" style={{ fontSize: '0.875rem' }} />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Post</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{editModeDisplayNames.postName}</p>
                  </div>

                  {/* Start Date */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <i className="pi pi-calendar text-orange-500" style={{ fontSize: '0.875rem' }} />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Start Date</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {watch('startDate')
                        ? new Date(watch('startDate')!).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Update Assignment Section - Editable */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <i className="pi pi-pencil text-amber-500" />
                  Update Assignment
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Assignment Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Assignment Type <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="assignmentType"
                      control={control}
                      render={({ field }) => (
                        <Dropdown
                          {...field}
                          value={field.value || ''}
                          options={filteredAssignmentTypeOptions}
                          onChange={(e) => field.onChange(e.value)}
                          placeholder="Select assignment type"
                          className={`w-full ${errors.assignmentType ? 'p-invalid' : ''}`}
                          data-testid="AssignmentForm.Field.AssignmentType"
                        />
                      )}
                    />
                    {errors.assignmentType?.message && (
                      <small className="text-red-500 text-xs mt-1 block">{errors.assignmentType.message}</small>
                    )}
                  </div>

                  {/* End Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Date {isEndDateRequired && <span className="text-red-500">*</span>}
                    </label>
                    <Controller
                      name="endDate"
                      control={control}
                      render={({ field }) => (
                        <Calendar
                          value={field.value ? new Date(field.value + 'T00:00:00') : null}
                          onChange={(e: any) => {
                            const date = e.value as Date | null;
                            if (date) {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              field.onChange(`${year}-${month}-${day}`);
                            } else {
                              field.onChange('');
                            }
                          }}
                          placeholder="Select end date"
                          dateFormat="dd/mm/yy"
                          showIcon
                          className="w-full"
                          data-testid="AssignmentForm.Field.EndDate"
                        />
                      )}
                    />
                    {errors.endDate?.message && (
                      <small className="text-red-500 text-xs mt-1 block">{errors.endDate.message}</small>
                    )}
                  </div>

                  {/* Active Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status
                    </label>
                    <Controller
                      name="isActive"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center gap-2 h-[42px]">
                          <Checkbox
                            inputId="isActive"
                            checked={field.value ?? false}
                            onChange={(e) => field.onChange(e.checked)}
                            data-testid="AssignmentForm.Field.IsActive"
                          />
                          <label htmlFor="isActive" className="text-gray-700 dark:text-gray-300 cursor-pointer">
                            Active
                          </label>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Create Mode - Original Layout */
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                {/* Unit Selection */}
                <Controller
                  name="unitId"
                  control={control}
                  render={({ field }) => (
                    <FormSearchableSelect
                      {...field}
                      value={field.value || ''}
                      label="Unit"
                      required
                      initialOptions={unitOptions}
                      onLazyLoad={lazyLoadUnits}
                      loading={unitsLoading}
                      placeholder="Type to search units..."
                      error={errors.unitId?.message}
                      onChange={(value) => {
                        field.onChange(value);
                        setValue('postCode', ''); // Reset post when unit changes
                      }}
                      testId="AssignmentForm.Field.Unit"
                    />
                  )}
                />

                {/* Personnel Selection */}
                <Controller
                  name="userId"
                  control={control}
                  render={({ field }) => (
                    <FormSearchableSelect
                      {...field}
                      value={field.value || ''}
                      label="Personnel"
                      required
                      initialOptions={personnelOptions}
                      onLazyLoad={lazyLoadPersonnel}
                      loading={personnelLoading}
                      placeholder="Type to search personnel..."
                      error={errors.userId?.message}
                      testId="AssignmentForm.Field.Personnel"
                    />
                  )}
                />

                {/* Post Selection */}
                <Controller
                  name="postCode"
                  control={control}
                  render={({ field }) => (
                    <FormSearchableSelect
                      {...field}
                      value={field.value || ''}
                      label="Post"
                      required
                      initialOptions={postOptions}
                      loading={postsLoading}
                      placeholder={selectedUnitId ? 'Select a post' : 'Select a unit first'}
                      error={errors.postCode?.message}
                      helperText={postOptions.length > 0 ? 'Filled posts are disabled. Select an available post.' : ''}
                      disabled={!selectedUnitId}
                      testId="AssignmentForm.Field.Post"
                    />
                  )}
                />

                {/* Assignment Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Assignment Type <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="assignmentType"
                    control={control}
                    render={({ field }) => (
                      <Dropdown
                        {...field}
                        value={field.value || ''}
                        options={filteredAssignmentTypeOptions}
                        onChange={(e) => field.onChange(e.value)}
                        placeholder="Select assignment type"
                        className={`w-full ${errors.assignmentType ? 'p-invalid' : ''}`}
                        data-testid="AssignmentForm.Field.AssignmentType"
                      />
                    )}
                  />
                  {errors.assignmentType?.message && (
                    <small className="text-red-500 text-xs mt-1">{errors.assignmentType.message}</small>
                  )}
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="startDate"
                    control={control}
                    render={({ field }) => (
                      <Calendar
                        value={field.value ? new Date(field.value + 'T00:00:00') : null}
                        onChange={(e: any) => {
                          const date = e.value as Date | null;
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            field.onChange(`${year}-${month}-${day}`);
                          } else {
                            field.onChange('');
                          }
                        }}
                        placeholder="Select start date"
                        dateFormat="dd/mm/yy"
                        showIcon
                        className="w-full"
                        data-testid="AssignmentForm.Field.StartDate"
                      />
                    )}
                  />
                  {errors.startDate?.message && (
                    <small className="text-red-500 text-xs mt-1">{errors.startDate.message}</small>
                  )}
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date {isEndDateRequired && <span className="text-red-500">*</span>}
                  </label>
                  <Controller
                    name="endDate"
                    control={control}
                    render={({ field }) => (
                      <Calendar
                        value={field.value ? new Date(field.value + 'T00:00:00') : null}
                        onChange={(e: any) => {
                          const date = e.value as Date | null;
                          if (date) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            field.onChange(`${year}-${month}-${day}`);
                          } else {
                            field.onChange('');
                          }
                        }}
                        placeholder="Select end date"
                        dateFormat="dd/mm/yy"
                        showIcon
                        className="w-full"
                        data-testid="AssignmentForm.Field.EndDate"
                      />
                    )}
                  />
                  {errors.endDate?.message && (
                    <small className="text-red-500 text-xs mt-1">{errors.endDate.message}</small>
                  )}
                </div>

                {/* Role Preview - Shows when a post is selected in create mode */}
                {selectedPost && (
                  <div className="md:col-span-3">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="pi pi-shield text-amber-600 dark:text-amber-400" />
                        <h4 className="font-medium text-sm text-gray-900 dark:text-white">
                          Roles Inherited from Post
                          {selectedPost.isUnitHead && (
                            <Tag value="Unit Head" severity="warning" className="ml-2 text-xs" />
                          )}
                        </h4>
                      </div>
                      {selectedPost.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          {selectedPost.description}
                        </p>
                      )}
                      {selectedPost.assignedRoles && selectedPost.assignedRoles.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedPost.assignedRoles.map((role: PopulatedRoleInfo) => (
                            <div
                              key={role._id}
                              className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-gray-800 rounded-full border border-amber-300 dark:border-amber-700"
                            >
                              <i className="pi pi-key text-amber-600 dark:text-amber-400" style={{ fontSize: '0.7rem' }} />
                              <span className="text-xs font-medium text-gray-900 dark:text-white">
                                {role.roleName}
                              </span>
                              {role.roleShortCode && (
                                <span className="text-xs text-gray-500">({role.roleShortCode})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                          No roles assigned to this post
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Checkbox */}
              <div className="pt-2">
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        inputId="isActive"
                        checked={field.value ?? false}
                        onChange={(e) => field.onChange(e.checked)}
                        data-testid="AssignmentForm.Field.IsActive"
                      />
                      <label htmlFor="isActive" className="text-gray-700 dark:text-gray-300 cursor-pointer">
                        Active
                      </label>
                    </div>
                  )}
                />
              </div>
            </div>
          )}

          {/* Section: Form Actions */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                label="Cancel"
                severity="secondary"
                outlined
                onClick={() => navigateToList()}
                disabled={submitting}
                testId="AssignmentForm.Button.Cancel"
              />
              <Button
                type="button"
                label={submitting ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                icon={submitting ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                disabled={submitting || (!isDirty && isEditMode)}
                testId="AssignmentForm.Button.Submit"
                onClick={handleSubmit(onSubmit)}
              />
            </div>
          </div>
        </div>
        </form>
      </div>
    </PermissionGuard>
  );
};

export default AssignmentForm;
