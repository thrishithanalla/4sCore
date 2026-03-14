/**
 * PostFormModal Component
 * Modal form for creating/editing an embedded post within a unit.
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog } from 'mainFe/Dialog';
import { Button } from 'mainFe/Button';
import { Checkbox } from 'mainFe/Checkbox';
import { Calendar } from 'mainFe/Calendar';
import { Dropdown } from 'primereact/dropdown';
import { InputSwitch } from 'primereact/inputswitch';
import FormInput from '../forms/form-input';
import FormSelect from '../forms/form-select';
import FormMultiSelect from '../forms/form-multi-select';
import { UserSelector } from '../selectors';
import { fetchSystemRolesForDropdown } from '../../services/system-roles.service';
import { valueSetsService } from '../../services/value-sets.service';
import { unitsService, PostCountItem } from '../../services/units.service';
import { masterService } from '../../services/master.service';
import type { EmbeddedPostForCreate, ReportsToPost, ValueSetLocalized, Rank } from '../../types';
import type { SystemRole } from '../../types/system-role.types';

// Stable empty array to avoid infinite re-renders when no ranks selected
const EMPTY_RANK_SHORT_CODES: string[] = [];

// Assignment type options
const ASSIGNMENT_TYPE_OPTIONS = [
  { label: 'Primary Assignment', value: 'Primary Assignment' },
  { label: 'Incharge', value: 'Incharge' },
  { label: 'Deputation', value: 'Deputation' },
];

// Validation schema for post form
const postSchema = z.object({
  postCode: z
    .string()
    .min(1, 'Post code is required')
    .max(50, 'Post code must not exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Post code must contain only letters, numbers, underscore and dash')
    .transform((val) => val.toUpperCase()),

  postName: z
    .string()
    .min(2, 'Post name must be at least 2 characters')
    .max(100, 'Post name must not exceed 100 characters')
    .refine((val) => /[a-zA-Z]/.test(val), 'Post name must contain at least one letter'),

  isUnitHead: z.boolean().default(false),

  // For unit head: can report to another unit's post
  reportsToUnitId: z.string().optional().nullable(),
  reportsToPostName: z.string().optional().nullable(),

  // Single system role assignment (changed from multi-select to single-select)
  assignedRoles: z.string().optional().nullable(),

  // Rank assignment (optional when hidden in personnel screen, required otherwise)
  rankIds: z.array(z.string()).default([]),

  // Assign User toggle
  assignUser: z.boolean().default(false),

  assignedUser: z.string().optional().nullable(),

  // Assignment fields (required when assignUser is true)
  assignmentType: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),

  description: z.string().max(500, 'Description must not exceed 500 characters').optional().nullable(),
}).refine(
  (data) => {
    // If assignUser is true, assignedUser is required
    if (data.assignUser && !data.assignedUser) {
      return false;
    }
    return true;
  },
  {
    message: 'Assigned User is required when Assign User is enabled',
    path: ['assignedUser'],
  }
).refine(
  (data) => {
    // If assignUser is true, assignmentType is required
    if (data.assignUser && !data.assignmentType) {
      return false;
    }
    return true;
  },
  {
    message: 'Assignment Type is required',
    path: ['assignmentType'],
  }
).refine(
  (data) => {
    // If assignUser is true, startDate is required
    if (data.assignUser && !data.startDate) {
      return false;
    }
    return true;
  },
  {
    message: 'Start Date is required',
    path: ['startDate'],
  }
).refine(
  (data) => {
    // End Date is required for Incharge and Deputation assignment types
    if (data.assignUser && (data.assignmentType === 'Incharge' || data.assignmentType === 'Deputation')) {
      return Boolean(data.endDate);
    }
    return true;
  },
  {
    message: 'End Date is required for Incharge and Deputation assignments',
    path: ['endDate'],
  }
).refine(
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
);

type PostFormData = z.infer<typeof postSchema>;

interface PostFormModalProps {
  visible: boolean;
  onHide: () => void;
  onSave: (post: EmbeddedPostForCreate) => void;
  post?: EmbeddedPostForCreate | null;
  existingPostCodes: string[];
  /** Existing post names for calculating count */
  existingPostNames?: string[];
  isEditing?: boolean;
  /** Label for assigned user if editing */
  assignedUserLabel?: string | null;
  /** External saving state (when parent handles API calls) */
  isSaving?: boolean;
  /** Callback to fetch posts for a selected unit */
  onFetchUnitPosts?: (unitId: string) => Promise<{ postCode: string; postName: string }[]>;
  /** Hide the assigned user selector (e.g., during onboarding) */
  hideUserSelector?: boolean;
  /** Hide the rank selector (e.g., when used in personnel screen) */
  hideRankSelector?: boolean;
  /** Unit name from parent form (read-only display) */
  unitName?: string;
  /** Unit short code from parent form (read-only display) */
  unitShortCode?: string;
  /** Unit ID for fetching post counts from API */
  unitId?: string;
  /** Parent unit ID for unit head reporting */
  parentUnitId?: string;
  /** Parent unit name for unit head reporting */
  parentUnitName?: string;
}

const PostFormModal = ({
  visible,
  onHide,
  onSave,
  post = null,
  existingPostCodes = [],
  existingPostNames = [],
  isEditing = false,
  assignedUserLabel = null,
  isSaving: saving = false,
  onFetchUnitPosts,
  hideUserSelector = false,
  hideRankSelector = false,
  unitName = '',
  unitShortCode = '',
  unitId,
  parentUnitId = '',
  parentUnitName = '',
}: PostFormModalProps) => {
  // State for posts from external unit (when unit head reports to another unit)
  const [externalUnitPosts, setExternalUnitPosts] = useState<{ postCode: string; postName: string }[]>([]);
  const [loadingExternalPosts, setLoadingExternalPosts] = useState(false);

  // State for post counts from API
  const [postCounts, setPostCounts] = useState<PostCountItem[]>([]);
  const [loadingPostCounts, setLoadingPostCounts] = useState(false);

  // Fetch post counts from API when modal opens (if unitId is provided)
  useEffect(() => {
    const fetchPostCounts = async () => {
      if (visible && unitId && !isEditing) {
        setLoadingPostCounts(true);
        try {
          const response = await unitsService.getPostsCount(unitId, false);
          setPostCounts(response.counts || []);
        } catch (error) {
          console.error('Failed to fetch post counts:', error);
          setPostCounts([]);
        } finally {
          setLoadingPostCounts(false);
        }
      }
    };
    fetchPostCounts();
  }, [visible, unitId, isEditing]);

  // Fetch system roles for dropdown
  const { data: systemRoles = [], isLoading: loadingSystemRoles } = useQuery<SystemRole[]>({
    queryKey: ['system-roles', 'dropdown'],
    queryFn: fetchSystemRolesForDropdown,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch ranks for dropdown
  const { data: ranks = [], isLoading: loadingRanks } = useQuery<Rank[]>({
    queryKey: ['ranks', 'dropdown'],
    queryFn: masterService.getRanks,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch POST NAME value set for dropdown
  const { data: postNameValueSet, isLoading: loadingPostNames } = useQuery<ValueSetLocalized>({
    queryKey: ['value-sets', 'POST NAME', 'en'],
    queryFn: () => valueSetsService.getByKey('POST NAME', 'en'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Transform POST NAME value set items to dropdown options
  // Use code as value (for post code generation), label for display
  const postNameOptions = useMemo(() => {
    if (!postNameValueSet?.items) return [];
    return postNameValueSet.items.map((item) => ({
      value: item.code, // Use code as value for post code generation
      label: item.label, // Show label for display
    }));
  }, [postNameValueSet]);

  // Transform system roles to dropdown options
  const systemRoleOptions = useMemo(() => {
    return systemRoles.map((role) => ({
      value: role._id,
      label: role.roleShortCode
        ? `${role.roleName} (${role.roleShortCode.toUpperCase()})`
        : role.roleName,
    }));
  }, [systemRoles]);

  // Transform ranks to dropdown options
  const rankOptions = useMemo(() => {
    return ranks.map((rank) => ({
      value: rank._id,
      label: rank.shortCode
        ? `${rank.name} (${rank.shortCode})`
        : rank.name,
    }));
  }, [ranks]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PostFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(postSchema) as any,
    defaultValues: {
      postCode: '',
      postName: '',
      isUnitHead: false,
      reportsToUnitId: null,
      reportsToPostName: null,
      assignedRoles: null,
      rankIds: [],
      assignUser: false,
      assignedUser: null,
      assignmentType: null,
      startDate: null,
      endDate: null,
      description: '',
    },
  });

  const currentPostCode = watch('postCode');
  const isUnitHead = watch('isUnitHead');
  const reportsToUnitId = watch('reportsToUnitId');
  const postNameValue = watch('postName');
  const watchedRankIds = watch('rankIds');
  const assignUser = watch('assignUser');
  const assignmentType = watch('assignmentType');

  // Check if End Date is required (for Incharge and Deputation)
  const isEndDateRequired = assignmentType === 'Incharge' || assignmentType === 'Deputation';

  // Convert selected rank IDs to shortCodes for the UserSelector by-ranks API
  // Uses stable EMPTY_RANK_SHORT_CODES constant to avoid infinite re-renders
  const selectedRankShortCodes = useMemo(() => {
    if (!watchedRankIds || watchedRankIds.length === 0 || ranks.length === 0) {
      return EMPTY_RANK_SHORT_CODES;
    }
    return watchedRankIds
      .map(rankId => ranks.find(r => r._id === rankId)?.shortCode)
      .filter((code): code is string => !!code);
  }, [watchedRankIds, ranks]);

  // Store original sequence from post code in edit mode (e.g., "001" from "DPO-SI-001")
  const [originalSequence, setOriginalSequence] = useState<string | null>(null);

  // Extract sequence from post code when editing (last part after last dash)
  useEffect(() => {
    if (isEditing && post?.postCode) {
      const parts = post.postCode.split('-');
      if (parts.length > 0) {
        const sequence = parts[parts.length - 1];
        // Check if it's a valid sequence (digits only)
        if (/^\d+$/.test(sequence)) {
          setOriginalSequence(sequence);
        }
      }
    } else {
      setOriginalSequence(null);
    }
  }, [isEditing, post?.postCode]);

  // Helper function to extract post name code from a full post code
  // Post code format: {unitShortCode}-{postNameCode}-{sequence} (e.g., "LO-DPO-CTR-BZAWZ-HC-001")
  // Returns the post name code (second-to-last segment) if valid, otherwise null
  const extractPostNameCodeFromPostCode = (fullPostCode: string): string | null => {
    const parts = fullPostCode.split('-');
    if (parts.length < 2) return null;
    const lastPart = parts[parts.length - 1];
    // Check if last part is a sequence (all digits)
    if (/^\d+$/.test(lastPart)) {
      // Post name code is the second-to-last part
      return parts[parts.length - 2]?.toUpperCase() || null;
    }
    return null;
  };

  // Auto-generate post code from unit short code + post name code + sequence
  // Format: UnitShortCode-PostNameCode-Sequence (e.g., "DPO-SI-001")
  // postNameValue is the code from the value-set API (e.g., "SI" for Sub-Inspector)
  // Sequence is zero-padded to 3 digits: 001, 002...009, 010...099, 100...999
  // In edit mode: keeps the original sequence when post name changes
  useEffect(() => {
    if (postNameValue?.trim()) {
      const postCode = postNameValue.trim().toUpperCase();

      let paddedSequence: string;

      if (isEditing && originalSequence) {
        // In edit mode, use the original sequence
        paddedSequence = originalSequence;
      } else if (!isEditing && !loadingPostCounts) {
        // In create mode, calculate new sequence
        // Get count from API response - find matching label
        const matchingApiCount = postCounts.find(
          (item) => item.label.toUpperCase() === postCode
        );
        const apiCount = matchingApiCount ? matchingApiCount.count : 0;

        // Count matching post name codes from existing post codes (local state)
        // Parse each post code to extract the post name code segment
        // This is more reliable than using postName which might be the full label
        const localCount = existingPostCodes.filter((code) => {
          const extractedPostNameCode = extractPostNameCodeFromPostCode(code);
          return extractedPostNameCode === postCode;
        }).length;

        // Total count = API count + local state count, then add 1 for new post
        const nextSequence = apiCount + localCount + 1;

        // Zero-pad sequence to 3 digits (001, 010, 100)
        paddedSequence = nextSequence.toString().padStart(3, '0');

        console.log('[PostFormModal] Generating post code - postName:', postCode, 'API count:', apiCount, 'local count:', localCount, 'sequence:', paddedSequence);
      } else {
        // Still loading or no sequence available
        return;
      }

      // Combine unit short code with post name code and sequence using dash separator
      const unitCodePart = unitShortCode ? unitShortCode.toUpperCase() : '';
      const generatedCode = unitCodePart
        ? `${unitCodePart}-${postCode}-${paddedSequence}`
        : `${postCode}-${paddedSequence}`;

      setValue('postCode', generatedCode);
    }
  }, [postNameValue, unitShortCode, postCounts, existingPostCodes, loadingPostCounts, isEditing, originalSequence, setValue]);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      if (post) {
        // Editing mode - take first role from array (single selection now)
        // Handle both string IDs and populated role objects { _id, roleName, roleShortCode }
        const firstRole = post.assignedRoles?.[0];
        const roleId = firstRole
          ? (typeof firstRole === 'string' ? firstRole : (firstRole as any)._id)
          : null;
        // Extract rank IDs - handle both string IDs and populated rank objects
        // API may return allowedRanks or rankIds, form uses rankIds internally
        // Check both fields for backward compatibility
        const ranksData = (post as any).allowedRanks || (post as any).rankIds || [];
        const rankIds = ranksData.map((r: string | { _id: string }) =>
          typeof r === 'string' ? r : r._id
        );
        reset({
          postCode: post.postCode || '',
          postName: post.postName || '',
          isUnitHead: post.isUnitHead || false,
          reportsToUnitId: post.reportsToPost?.unitId || null,
          reportsToPostName: post.reportsToPost?.postName || null,
          assignedRoles: roleId,
          rankIds,
          assignUser: Boolean(post.assignedUser),
          assignedUser: post.assignedUser || null,
          assignmentType: post.assignmentType || null,
          startDate: post.startDate ? post.startDate.split('T')[0] : null,
          endDate: post.endDate ? post.endDate.split('T')[0] : null,
          description: post.description || '',
        });
        // If editing and has external unit, fetch its posts
        if (post.reportsToPost?.unitId && onFetchUnitPosts) {
          setLoadingExternalPosts(true);
          onFetchUnitPosts(post.reportsToPost.unitId)
            .then(setExternalUnitPosts)
            .finally(() => setLoadingExternalPosts(false));
        }
      } else {
        // Create mode
        reset({
          postCode: '',
          postName: '',
          isUnitHead: false,
          reportsToUnitId: null,
          reportsToPostName: null,
          assignedRoles: null,
          rankIds: [],
          assignUser: false,
          assignedUser: null,
          assignmentType: null,
          startDate: null,
          endDate: null,
          description: '',
        });
        setExternalUnitPosts([]);
      }
    }
  }, [visible, post, reset, onFetchUnitPosts]);

  // Fetch posts when external unit changes
  useEffect(() => {
    if (reportsToUnitId && onFetchUnitPosts) {
      setLoadingExternalPosts(true);
      onFetchUnitPosts(reportsToUnitId)
        .then(setExternalUnitPosts)
        .finally(() => setLoadingExternalPosts(false));
      // Clear post selection when unit changes
      setValue('reportsToPostName', null);
    } else if (!reportsToUnitId) {
      setExternalUnitPosts([]);
    }
  }, [reportsToUnitId, onFetchUnitPosts, setValue]);

  // Get available posts for reportsTo dropdown
  // For unit head with external unit selected: show external unit's posts
  // Otherwise: show posts within same unit (exclude current post)
  const reportsToOptions = useMemo(() => {
    if (isUnitHead && reportsToUnitId) {
      // Unit head reporting to another unit - show external unit's posts
      const options = externalUnitPosts.map((post) => ({
        value: post.postName,
        label: `${post.postName} (${post.postCode})`,
      }));
      return [{ value: '', label: '(No Supervisor - Highest Ranking)' }, ...options];
    } else {
      // Same unit posts (exclude current post)
      const options = existingPostCodes
        .filter((code) => code !== currentPostCode?.toUpperCase())
        .map((code) => ({
          value: code,
          label: code,
        }));
      // Add option for no supervisor (highest ranking)
      return [{ value: '', label: '(No Supervisor - Highest Ranking)' }, ...options];
    }
  }, [existingPostCodes, currentPostCode, isUnitHead, reportsToUnitId, externalUnitPosts]);

  // Handle form submission
  const onSubmit = async (data: PostFormData, e?: React.BaseSyntheticEvent) => {
    // Prevent event from bubbling up to parent form
    e?.preventDefault();
    e?.stopPropagation();

    // Validate unique postCode (except when editing same post)
    const upperCode = data.postCode.toUpperCase();
    if (!isEditing && existingPostCodes.includes(upperCode)) {
      return; // Error shown by zod refine
    }

    // Build the post object
    // For unit head with external unit: include unitId in reportsToPost
    // For regular posts: unitId is null (same unit)
    let reportsToPost: ReportsToPost | null = null;
    if (data.reportsToPostName) {
      if (data.isUnitHead && data.reportsToUnitId) {
        // External unit - find postCode from externalUnitPosts
        const externalPost = externalUnitPosts.find(p => p.postName === data.reportsToPostName);
        reportsToPost = {
          unitId: data.reportsToUnitId,
          postCode: externalPost?.postCode || '',
          postName: data.reportsToPostName,
        };
      } else {
        // Same unit - reportsToPostName is the postCode (from existingPostCodes)
        reportsToPost = {
          unitId: null,
          postCode: data.reportsToPostName,
          postName: data.reportsToPostName,
        };
      }
    }

    // Helper to format date to ISO string
    const formatDateToISO = (dateStr: string): string => {
      const isoString = new Date(dateStr + 'T00:00:00.000Z').toISOString();
      return isoString.replace('Z', '+00:00');
    };

    const postData: EmbeddedPostForCreate = {
      postCode: upperCode,
      postName: data.postName.trim(),
      isUnitHead: data.isUnitHead,
      reportsToPost,
      // Convert single role to array for backend compatibility
      assignedRoles: data.assignedRoles ? [data.assignedRoles] : [],
      allowedRanks: data.rankIds || [],
      // Only include assignment data when assignUser is enabled
      assignedUser: data.assignUser ? (data.assignedUser || null) : null,
      assignmentType: data.assignUser ? (data.assignmentType || undefined) : undefined,
      startDate: data.assignUser && data.startDate ? formatDateToISO(data.startDate) : undefined,
      endDate: data.assignUser && data.endDate ? formatDateToISO(data.endDate) : undefined,
      description: data.description?.trim() || undefined,
    };

    console.log('[PostFormModal] Saving post with data:', {
      postCode: postData.postCode,
      assignUser: data.assignUser,
      assignedUser: postData.assignedUser,
      assignmentType: postData.assignmentType,
      startDate: postData.startDate,
      endDate: postData.endDate,
    });

    // Call parent's save handler - parent manages saving state and closing modal
    onSave(postData);
  };

  // Dialog footer
  const dialogFooter = (
    <div className="flex justify-end gap-2 pt-4">
      <Button
        type="button"
        label="Cancel"
        severity="secondary"
        outlined
        onClick={onHide}
        disabled={saving}
      />
      <Button
        type="button"
        label={saving ? 'Saving...' : isEditing ? 'Update Post' : 'Add Post'}
        icon={saving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
        disabled={saving}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit(onSubmit)();
        }}
      />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      header={
        <div className="flex items-center gap-2">
          <i className={`pi ${isEditing ? 'pi-pencil' : 'pi-plus'}`} />
          <span>{isEditing ? 'Edit Post' : 'Add New Post'}</span>
        </div>
      }
      footer={dialogFooter}
      style={{ width: '600px' }}
      modal
      dismissableMask={false}
      closable={!saving}
      closeOnEscape={!saving}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-4"
      >
        {/* Unit Name - Read-only, from parent unit form */}
        <FormInput
          name="unitName"
          label="Unit Name"
          value={unitName}
          onChange={() => {}}
          disabled
          helperText="Auto-populated from unit"
        />

        {/* Unit Short Code - Read-only, from parent unit form */}
        <FormInput
          name="unitShortCode"
          label="Unit Short Code"
          value={unitShortCode}
          onChange={() => {}}
          disabled
          helperText="Auto-populated from unit"
        />

 {/* Post Name - Dropdown from value-sets */}
        <Controller
          name="postName"
          control={control}
          render={({ field: { value, onChange } }) => (
            <FormSelect
              name="postName"
              label="Post Name"
              value={value || ''}
              onChange={(e) => onChange(e.target.value || '')}
              options={postNameOptions}
              placeholder="Select post name"
              required
              filter
              filterPlaceholder="Search post names..."
              loading={loadingPostNames}
              error={!!errors.postName}
              helperText={errors.postName?.message}
            />
          )}
        />
        {/* Post Code - Auto-generated from Post Name */}
        <Controller
          name="postCode"
          control={control}
          render={({ field }) => (
            <FormInput
              {...field}
              label="Post Code"
              placeholder="Auto-generated"
              required
              disabled
              error={!!errors.postCode}
              helperText={errors.postCode?.message || 'Auto-generated from Post Name'}
            />
          )}
        />

        {/* Description */}
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <FormInput
              {...field}
              value={field.value || ''}
              label="Description"
              placeholder="Brief description of this post (optional)"
              error={!!errors.description}
              helperText={errors.description?.message}
            />
          )}
        />

        

        {/* Is Unit Head */}
        <Controller
          name="isUnitHead"
          control={control}
          render={({ field: { value, onChange } }) => (
            <div className="flex items-center gap-2">
              <Checkbox
                inputId="isUnitHead"
                checked={value || false}
                onChange={(e: { checked: boolean }) => onChange(e.checked)}
                label="Unit Head"
              />
              <span className="text-sm text-gray-500">(Only one post can be unit head per unit)</span>
            </div>
          )}
        />

        {/* Reports To Section */}
        {/* For Unit Head: can report to same unit or parent unit */}
        {isUnitHead && (
          <Controller
            name="reportsToUnitId"
            control={control}
            render={({ field: { value, onChange } }) => (
              <FormSelect
                name="reportsToUnitId"
                label="Reports To Unit"
                value={value || ''}
                onChange={(e) => {
                  onChange(e.target.value || null);
                }}
                options={[
                  { value: '', label: '(Same Unit)' },
                  ...(parentUnitId ? [{ value: parentUnitId, label: parentUnitName || 'Parent Unit' }] : []),
                ]}
                placeholder="Select unit"
                error={!!errors.reportsToUnitId}
                helperText={parentUnitId ? 'Unit head can report to same unit or parent unit' : 'No parent unit selected'}
              />
            )}
          />
        )}

        {/* Reports To Post */}
        <Controller
          name="reportsToPostName"
          control={control}
          render={({ field: { value, onChange } }) => (
            <FormSelect
              name="reportsToPostName"
              label={isUnitHead && reportsToUnitId ? 'Reports To Post in Selected Unit' : 'Reports To (Superior Post)'}
              value={value || ''}
              onChange={(e) => onChange(e.target.value || null)}
              options={reportsToOptions}
              placeholder="Select superior post (optional)"
              showClear
              loading={loadingExternalPosts}
              disabled={!!(isUnitHead && reportsToUnitId && loadingExternalPosts)}
              error={!!errors.reportsToPostName}
              helperText={errors.reportsToPostName?.message || 'Leave empty for highest ranking post'}
            />
          )}
        />

        {/* Ranks - MultiSelect from ranks API (Required) - Hidden in personnel screen */}
        {!hideRankSelector && (
          <Controller
            name="rankIds"
            control={control}
            render={({ field: { value, onChange } }) => (
              <FormMultiSelect
                name="rankIds"
                label="Ranks"
                value={value || []}
                onChange={onChange}
                options={rankOptions}
                placeholder="Select ranks"
                required
                filter
                loading={loadingRanks}
                error={!!errors.rankIds}
                helperText={errors.rankIds?.message}
                display="chip"
                maxSelectedLabels={3}
              />
            )}
          />
        )}

        {/* Assigned System Role (Single Selection) */}
        <Controller
          name="assignedRoles"
          control={control}
          render={({ field: { value, onChange } }) => (
            <FormSelect
              name="assignedRoles"
              label="Assigned System Role"
              value={value || ''}
              onChange={(e) => onChange(e.target.value || null)}
              options={systemRoleOptions}
              placeholder="Select system role (optional)"
              showClear
              filter
              filterPlaceholder="Search system roles..."
              loading={loadingSystemRoles}
              error={!!errors.assignedRoles}
              helperText={errors.assignedRoles?.message}
            />
          )}
        />

        {/* Assign User Toggle - Hidden during onboarding */}
        {!hideUserSelector && (
          <>
            <Controller
              name="assignUser"
              control={control}
              render={({ field: { value, onChange } }) => (
                <div className="flex items-center gap-3 py-2">
                  <InputSwitch
                    inputId="assignUser"
                    checked={value || false}
                    onChange={(e) => {
                      onChange(e.value);
                      // Clear assignment fields when toggle is turned off
                      if (!e.value) {
                        setValue('assignedUser', null);
                        setValue('assignmentType', null);
                        setValue('startDate', null);
                        setValue('endDate', null);
                      }
                    }}
                  />
                  <label htmlFor="assignUser" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                    Assign Personnel?
                  </label>
                </div>
              )}
            />

            {/* Assignment Fields - Shown when assignUser toggle is enabled */}
            {assignUser && (
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <i className="pi pi-user-plus text-blue-500" />
                  User Assignment Details
                </h4>

                {/* Assigned User */}
                <Controller
                  name="assignedUser"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <UserSelector
                      name="assignedUser"
                      label="Assigned User"
                      value={value ?? null}
                      onChange={onChange}
                      error={!!errors.assignedUser}
                      helperText={errors.assignedUser?.message}
                      placeholder="Search and select user..."
                      selectedUserLabel={assignedUserLabel}
                      rankShortCodes={selectedRankShortCodes}
                      required
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
                    render={({ field: { value, onChange } }) => (
                      <Dropdown
                        value={value || ''}
                        options={ASSIGNMENT_TYPE_OPTIONS}
                        onChange={(e) => onChange(e.value)}
                        placeholder="Select assignment type"
                        className={`w-full ${errors.assignmentType ? 'p-invalid' : ''}`}
                      />
                    )}
                  />
                  {errors.assignmentType?.message && (
                    <small className="text-red-500 text-xs mt-1 block">{errors.assignmentType.message}</small>
                  )}
                </div>

                {/* Date Fields - 2 column grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Start Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="startDate"
                      control={control}
                      render={({ field: { value, onChange } }) => (
                        <Calendar
                          value={value ? new Date(value + 'T00:00:00') : null}
                          onChange={(e: any) => {
                            const date = e.value as Date | null;
                            if (date) {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              onChange(`${year}-${month}-${day}`);
                            } else {
                              onChange(null);
                            }
                          }}
                          placeholder="Select start date"
                          dateFormat="dd/mm/yy"
                          showIcon
                          className={`w-full ${errors.startDate ? 'p-invalid' : ''}`}
                        />
                      )}
                    />
                    {errors.startDate?.message && (
                      <small className="text-red-500 text-xs mt-1 block">{errors.startDate.message}</small>
                    )}
                  </div>

                  {/* End Date - Required for Incharge and Deputation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Date {isEndDateRequired && <span className="text-red-500">*</span>}
                    </label>
                    <Controller
                      name="endDate"
                      control={control}
                      render={({ field: { value, onChange } }) => (
                        <Calendar
                          value={value ? new Date(value + 'T00:00:00') : null}
                          onChange={(e: any) => {
                            const date = e.value as Date | null;
                            if (date) {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              onChange(`${year}-${month}-${day}`);
                            } else {
                              onChange(null);
                            }
                          }}
                          placeholder="Select end date"
                          dateFormat="dd/mm/yy"
                          showIcon
                          className={`w-full ${errors.endDate ? 'p-invalid' : ''}`}
                        />
                      )}
                    />
                    {errors.endDate?.message && (
                      <small className="text-red-500 text-xs mt-1 block">{errors.endDate.message}</small>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        
      </form>
    </Dialog>
  );
};

export default PostFormModal;
