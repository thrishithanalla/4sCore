/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import { Toast } from 'mainFe/Toast';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { Tooltip } from 'mainFe/Tooltip';
import { Dialog } from 'primereact/dialog';

import FormDatePicker from '../../components/forms/form-date-picker';
import FormFileUpload from '../../components/forms/form-file-upload';
import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import FormSearchableSelect, { type SelectOption } from '../../components/forms/form-searchable-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { JOB_NAMES } from '../../constants/jobNames';
import { masterService } from '../../services/master.service';
import { personnelService } from '../../services/personnel.service';
import { onboardingService, type PostRoleMapping } from '../../services/onboarding.service';
import { assignmentService } from '../../services/assignment.service';
import { unitsService } from '../../services/units.service';
import { fileUploadService } from '../../services/file-upload.service';
import { authService } from '../../services/auth.service';
import { extractErrorMessage } from '../../utils/error-handler';
import PostRoleMappingForm from '../post-role-mappings/post-role-mapping-form';
import PostFormModal from '../../components/posts/PostFormModal';
import type { Unit, EmbeddedPostForCreate } from '../../types';

// Type for embedded posts as returned from Unit API
type UnitEmbeddedPost = NonNullable<Unit['posts']>[number];

// Post assignment schema - now uses unitId and postCode from embedded posts
const postAssignmentSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  postCode: z.string().min(1, 'Post is required'),
  unitName: z.string().optional(),
  postName: z.string().optional(),
  startDate: z.string().min(1, 'Start Date is required'),
  endDate: z.string().optional(),
  assignmentType: z.string().min(1, 'Assignment Type is required'),
  isPrimary: z.boolean().optional(),
}).refine(
  (data) => {
    // End Date is required if assignment type is NOT Primary Assignment
    if (data.assignmentType && data.assignmentType !== 'Primary Assignment') {
      if (!data.endDate || data.endDate === '') {
        return false;
      }
    }
    return true;
  },
  {
    message: 'End Date is required for non-primary assignments',
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
    message: 'End Date must be on or after Start Date',
    path: ['endDate'],
  }
);

// Zod Validation Schema
const personnelSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .regex(/^\d{8}$/, 'User ID must be exactly 8 digits')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .min(1, 'Email is required')
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .optional()
    .or(z.literal('')),
  title: z.enum(['Mr', 'Ms', 'Mrs', 'Dr'], {
    message: 'Title is required',
  }),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name must not exceed 150 characters')
    .trim(),

  gender: z.enum(['Male', 'Female', 'Other'], {
    message: 'Gender is required',
  }),
  dateOfBirth: z.string().optional().or(z.literal('')),
  mobile: z
    .string()
    .regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits')
    .optional()
    .or(z.literal('')),
  departmentId: z.string().min(1, 'Department is required'),
  rankId: z.string().min(1, 'Rank is required'),
  // Multiple posts array - at least one post required
  posts: z.array(postAssignmentSchema).min(1, 'At least one post is required'),
  batchYear: z.string().optional().or(z.literal('')),
  badgeNo: z
    .string()
    .regex(/^\d*$/, 'Badge number must contain only numbers')
    .max(50, 'Badge number must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  picture: z.any().nullable().optional(),
});

type PersonnelFormData = z.infer<typeof personnelSchema>;

const titleOptions = [
  { value: 'Mr', label: 'Mr' },
  { value: 'Ms', label: 'Ms' },
  { value: 'Mrs', label: 'Mrs' },
  { value: 'Dr', label: 'Dr' },
];

const genderOptions = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

const PersonnelForm = () => {
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'personnel',
    basePath: '/personnel',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const DRAFT_KEY = `personnel-draft-${isEditMode ? id : 'new'}`;

  // Draft state
  const [draftData, setDraftData] = useState<PersonnelFormData | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  // Role mapping state - track which posts have role mappings
  const [postRoleMappings, setPostRoleMappings] = useState<Map<string, PostRoleMapping | null>>(new Map());
  const [roleMappingLoading, setRoleMappingLoading] = useState<Map<string, boolean>>(new Map());

  // Create Role Mapping dialog state
  const [showCreateRoleMappingDialog, setShowCreateRoleMappingDialog] = useState(false);
  const [selectedPostForMapping, setSelectedPostForMapping] = useState<{ postId: string; postName: string; unitName?: string } | null>(null);

  // Embedded posts state - map of field index to posts array (same pattern as user-onboarding)
  const [embeddedPostsMap, setEmbeddedPostsMap] = useState<Map<number, UnitEmbeddedPost[]>>(new Map());
  const [postsLoadingMap, setPostsLoadingMap] = useState<Map<number, boolean>>(new Map());
  // Cache unit info per field index (for Create Post modal - stores unitId, unitName, unitCode)
  const [unitInfoMap, setUnitInfoMap] = useState<Map<number, { unitId: string; unitName: string; unitCode: string }>>(new Map());

  // Create Post Modal state
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [createPostFieldIndex, setCreatePostFieldIndex] = useState<number | null>(null);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [createPostUnitInfo, setCreatePostUnitInfo] = useState<{
    unitId: string;
    unitName: string;
    unitShortCode: string;
  } | null>(null);

  // Logged-in user data (for file upload district/uploadedBy)
  const [loggedInUser, setLoggedInUser] = useState<any>(null);

  // Fetch logged-in user data from /auth/me API
  useEffect(() => {
    authService.getCurrentUser()
      .then((user) => setLoggedInUser(user))
      .catch((error) => console.error('Failed to fetch logged-in user:', error));
  }, []);

  // React Hook Form
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<PersonnelFormData>({
    resolver: zodResolver(personnelSchema),
    defaultValues: {
      userId: '',
      email: '',
      password: '',
      title: undefined,
      name: '',
      gender: undefined,
      dateOfBirth: '',
      mobile: '',
      departmentId: '',
      rankId: '',
      posts: [{ unitId: '', postCode: '', unitName: '', postName: '', startDate: '', endDate: '', assignmentType: '', isPrimary: false }], // Start with one empty post assignment
      batchYear: '',
      badgeNo: '',
      picture: null,
    },
    mode: 'onChange',
  });

  // Field array for dynamic posts management
  const { fields: postFields, append: appendPost, remove: removePost } = useFieldArray({
    control,
    name: 'posts',
  });

  // Navigation blocker for unsaved changes
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  const formValues = watch();

  // Fetch dropdown data with React Query
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: masterService.getDepartments,
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ['ranks'],
    queryFn: masterService.getRanks,
  });

  // Fetch personnel data for edit mode - wait for ID decryption
  const { data: personnel, isLoading: fetchLoading } = useQuery({
    queryKey: ['personnel', id],
    queryFn: () => personnelService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show personnel name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? personnel?.name : null);

  // Helper to capitalize first letter (for gender field)
  const capitalizeFirst = (str: string | undefined | null): string => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };


  // Fetch user's assignments for edit mode
  const { data: userAssignments = [] } = useQuery({
    queryKey: ['user-assignments', personnel?._id],
    queryFn: () => assignmentService.getUserAssignments(personnel!._id, true),
    enabled: isEditMode && !!personnel?._id,
  });

  // Fetch units for dropdown (always needed for unit selection)
  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['units-for-personnel-form'],
    queryFn: async () => {
      const response = await unitsService.getAll({ include_deleted: false, page_size: 1000 });
      return response.data || [];
    },
  });

  // Unit options for dropdown
  const unitOptions = useMemo(
    () => units.map((u) => ({ value: u._id, label: u.name })),
    [units]
  );

  // Search handler for units
  const handleUnitSearch = async (searchTerm: string): Promise<SelectOption[]> => {
    try {
      const results = await unitsService.search(searchTerm);
      return (results.data || []).map((unit) => ({
        value: unit._id,
        label: unit.name,
      }));
    } catch (error) {
      console.error('Error searching units:', error);
      return [];
    }
  };

  // Function to fetch posts for a unit (same pattern as user-onboarding)
  const fetchPostsForUnit = async (unitId: string, fieldIndex: number) => {
    if (!unitId) {
      setEmbeddedPostsMap(prev => {
        const newMap = new Map(prev);
        newMap.delete(fieldIndex);
        return newMap;
      });
      return [];
    }

    setPostsLoadingMap(prev => new Map(prev).set(fieldIndex, true));

    try {
      const unit = await unitsService.getById(unitId);
      console.log('UNIT FROM API:', unit);
      const posts = (unit.posts || []).filter(p => !p.isDelete);
      setEmbeddedPostsMap(prev => new Map(prev).set(fieldIndex, posts));
      // Cache unit info for Create Post modal
      setUnitInfoMap(prev => new Map(prev).set(fieldIndex, {
        unitId: unit._id,
        unitName: unit.name || '',
        unitCode: unit.unitCode || '',
      }));
      setValue(`posts.${fieldIndex}.unitName`, unit.name || '');
      return posts;
    } catch (error) {
      console.error('Error fetching unit posts:', error);
      setEmbeddedPostsMap(prev => new Map(prev).set(fieldIndex, []));
      return [];
    } finally {
      setPostsLoadingMap(prev => new Map(prev).set(fieldIndex, false));
    }
  };

  // Get post options for a specific field index - disable filled posts in create mode
  const getPostOptionsForField = (fieldIndex: number): { value: string; label: string; disabled?: boolean }[] => {
    const posts = embeddedPostsMap.get(fieldIndex) || [];
    return posts.map((post) => {
      const isVacant = !post.assignedUser;
      return {
        value: post.postCode,
        label: `${post.postName} (${post.postCode})${isVacant ? ' - Available' : ' - Filled'}`,
        disabled: !isEditMode && !isVacant, // Disable filled posts in create mode only
      };
    });
  };

  // Check if all posts are filled for a field index
  const areAllPostsFilled = (fieldIndex: number): boolean => {
    const posts = embeddedPostsMap.get(fieldIndex) || [];
    return posts.length > 0 && posts.every(p => !!p.assignedUser);
  };

  // Check if no posts available for a field index
  const hasNoPosts = (fieldIndex: number): boolean => {
    const posts = embeddedPostsMap.get(fieldIndex) || [];
    return posts.length === 0;
  };

  // Get existing post codes for a field index (for validation in create modal)
  const getExistingPostCodes = (fieldIndex: number): string[] => {
    const posts = embeddedPostsMap.get(fieldIndex) || [];
    return posts.map(p => p.postCode.toUpperCase());
  };


  // Handle creating a new post
  const handleSavePost = async (postData: EmbeddedPostForCreate) => {
    if (createPostFieldIndex === null) return;

    const currentPost = watchedPosts?.[createPostFieldIndex];
    const unitId = currentPost?.unitId;
    if (!unitId) return;

    setIsSavingPost(true);
    try {
      // Add the post to the unit via API
      await unitsService.addPost(unitId, postData);

      // Close modal first
      setShowCreatePostModal(false);

      // Refresh posts list for this field
      const refreshedPosts = await fetchPostsForUnit(unitId, createPostFieldIndex);

      // Auto-select the newly created post
      if (refreshedPosts && refreshedPosts.length > 0) {
        const newPost = refreshedPosts.find((p: UnitEmbeddedPost) => p.postCode === postData.postCode);
        if (newPost) {
          setValue(`posts.${createPostFieldIndex}.postCode`, newPost.postCode);
          setValue(`posts.${createPostFieldIndex}.postName`, newPost.postName);
        }
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Post Created',
        detail: `Post "${postData.postName}" has been created and selected`,
        life: 3000,
      });
    } catch (error: any) {
      const errorMessage = extractErrorMessage(error, 'Failed to create post');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 5000,
      });
    } finally {
      setIsSavingPost(false);
      setCreatePostFieldIndex(null);
    }
  };

  // Helper function to get unit name and post name from units data
  const getUnitAndPostNames = (unitId: string, postCode: string): { unitName: string; postName: string; unitCode?: string } => {
    const unit = units.find(u => u._id === unitId);
    if (!unit) return { unitName: '', postName: '' };

    const post = (unit.posts || []).find(p => p.postCode === postCode && !p.isDelete);
    return {
      unitName: unit.name || '',
      postName: post?.postName || '',
      unitCode: unit.unitCode || '', // Added unitCode
    };
  };

  // Populate form when personnel data is loaded
  useEffect(() => {
    if (personnel && isEditMode && units.length > 0) {
      // Map assignments to form format (unitId + postCode)
      // Populate unitName and postName from units data
      const postsData = userAssignments.length > 0
        ? userAssignments.map((assignment) => {
            const names = getUnitAndPostNames(assignment.unitId, assignment.postCode);
            // Determine assignment type: use API value if present, otherwise infer from isPrimary flag
            let assignmentType = assignment.assignmentType || '';
            if (!assignmentType && assignment.isPrimary) {
              assignmentType = 'Primary Assignment';
            }
            return {
              unitId: assignment.unitId,
              postCode: assignment.postCode,
              unitName: names.unitName,
              postName: names.postName,
              startDate: assignment.startDate ? assignment.startDate.split('T')[0] : '',
              endDate: assignment.endDate ? assignment.endDate.split('T')[0] : '',
              assignmentType: assignmentType,
              isPrimary: assignment.isPrimary || false,
            };
          })
        : [{ unitId: '', postCode: '', unitName: '', postName: '', startDate: '', endDate: '', assignmentType: '', isPrimary: false }];

      // Normalize gender to match form options (Male, Female, Other)
      const normalizedGender = capitalizeFirst(personnel.gender) as 'Male' | 'Female' | 'Other';

      reset({
        userId: personnel.userId || '',
        email: personnel.email || '',
        password: '',
        title: (personnel.title as 'Mr' | 'Ms' | 'Mrs' | 'Dr') || 'Mr',
        name: personnel.name || '',
        gender: normalizedGender || 'Male',
        dateOfBirth: personnel.dateOfBirth ? personnel.dateOfBirth.split('T')[0] : '',
        mobile: personnel.mobile || '',
        departmentId: personnel.departmentId || '',
        rankId: personnel.rankId || '',
        posts: postsData,
        batchYear: personnel.batchYear?.toString() || '',
        badgeNo: personnel.badgeNo || '',
        picture: personnel.picture || null,
      });

      // Load posts for each unit in edit mode (so post dropdowns are populated)
      postsData.forEach((postData, index) => {
        if (postData.unitId) {
          fetchPostsForUnit(postData.unitId, index);
        }
      });
    }
  }, [personnel, isEditMode, reset, userAssignments, units]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft autosave (only for create mode)
  useEffect(() => {
    if (isEditMode || !isDirty) return;

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, isEditMode, DRAFT_KEY]);

  // Load draft on mount (only for create mode)
  useEffect(() => {
    if (!isEditMode) {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setDraftData(parsed);
          setShowDraftBanner(true);
        } catch (error) {
          console.error('Failed to parse draft:', error);
        }
      }
    }
  }, [isEditMode, DRAFT_KEY]);

  // Mutation for create/update
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return personnelService.update(id, data);
      }
      return personnelService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      localStorage.removeItem(DRAFT_KEY);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Personnel ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });
      setTimeout(() => {
        navigateToList();
      }, 1000);
    },
    onError: (error: any) => {
      console.error('Error response:', error.response);
      console.error('Error data:', error.response?.data);

      // Use standardized error message extraction
      const errorMessage = extractErrorMessage(
        error,
        `Failed to ${isEditMode ? 'update' : 'create'} personnel`
      );

      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = mutation.isPending;

  const onSubmit = async (data: PersonnelFormData) => {
    // Extract post assignments for later assignment creation
    const postAssignments = data.posts
      .filter(p => p.unitId && p.postCode)
      .map(p => ({
        unitId: p.unitId,
        postCode: p.postCode,
        unitName: p.unitName,
        postName: p.postName,
        startDate: p.startDate,
        endDate: p.endDate,
        assignmentType: p.assignmentType,
      }));

    // Upload picture if it's a File object
    let pictureId: string | null | undefined;
    if (data.picture instanceof File) {
      const districtId = loggedInUser?.district?._id || '';
      const uploadedById = loggedInUser?._id || '';
      try {
        const uploadResponse = await fileUploadService.upload(data.picture, {
          district: districtId,
          uploadedBy: uploadedById,
          module: 'CORE',
          uploadType: 'profile',
        });
        pictureId = uploadResponse.data.fileId;
      } catch (uploadError) {
        console.error('Failed to upload picture:', uploadError);
        toast.current?.show({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Failed to upload profile picture. Continuing without it.',
          life: 3000,
        });
      }
    } else if (typeof data.picture === 'string') {
      pictureId = data.picture;
    } else {
      // picture is null - user cleared it
      pictureId = null;
    }

    // Build personnel payload without posts (assignments will be created separately)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      email: data.email,
      name: data.name,
      userId: data.userId,
      password: data.password,
      title: data.title,
      gender: data.gender?.toLowerCase(),
      mobile: data.mobile || undefined,
      departmentId: data.departmentId,
      rankId: data.rankId,
      // Send empty posts array - we'll create assignments via assignment API
      posts: [],
      batchYear: data.batchYear ? parseInt(data.batchYear) : undefined,
      dateOfBirth: data.dateOfBirth ? `${data.dateOfBirth}T00:00:00Z` : undefined,
      badgeNo: data.badgeNo || undefined,
      picture: pictureId,
    };

    // In edit mode, remove password if empty
    if (isEditMode && !payload.password) {
      delete payload.password;
    }

    // Store post assignments for use after personnel creation
    // We'll create assignments after personnel is created successfully
    console.log('Submitting personnel payload:', payload);
    console.log('Post assignments to create:', postAssignments);

    // Use a custom mutate that handles assignment creation
    try {
      let personnelId: string;

      if (isEditMode && id) {
        // Update personnel
        const result = await personnelService.update(id, payload);
        personnelId = result._id;
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Personnel updated successfully',
          life: 3000,
        });
      } else {
        // Create personnel
        const result = await personnelService.create(payload);
        personnelId = result._id;
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Personnel created successfully',
          life: 3000,
        });
      }

      // Create assignments for each post
      if (postAssignments.length > 0) {
        const assignmentPromises = postAssignments.map((pa) =>
          assignmentService.create({
            userId: personnelId,
            unitId: pa.unitId,
            postCode: pa.postCode,
            isActive: true,
            isPrimary: pa.assignmentType === 'Primary Assignment',
            startDate: pa.startDate,
            endDate: pa.endDate,
            assignmentType: pa.assignmentType,
          })
        );

        try {
          await Promise.all(assignmentPromises);
          toast.current?.show({
            severity: 'success',
            summary: 'Assignments Created',
            detail: `${postAssignments.length} post assignment(s) created successfully`,
            life: 3000,
          });
        } catch (assignmentError) {
          console.error('Error creating assignments:', assignmentError);
          toast.current?.show({
            severity: 'warn',
            summary: 'Partial Success',
            detail: 'Personnel saved but some assignments may have failed',
            life: 5000,
          });
        }
      }

      // Clear draft and navigate
      localStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      queryClient.invalidateQueries({ queryKey: ['units'] });
      navigateToList();
    } catch (error) {
      const message = extractErrorMessage(error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: message || 'An error occurred',
        life: 5000,
      });
    }
  };

  const handleRestoreDraft = () => {
    if (draftData) {
      reset(draftData);
      setShowDraftBanner(false);
    }
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftData(null);
    setShowDraftBanner(false);
  };

  // Handle profile picture removal - delete from file service and update personnel
  const handleRemovePicture = async (fileId: string) => {
    try {
      await fileUploadService.delete(fileId);
      // If in edit mode, immediately update personnel with picture: null
      if (isEditMode && id) {
        await personnelService.update(id, { picture: null });
        queryClient.invalidateQueries({ queryKey: ['personnel', id] });
      }
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Profile picture removed successfully',
        life: 3000,
      });
    } catch (error) {
      console.error('Failed to delete profile picture:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to remove profile picture'),
        life: 5000,
      });
      throw error; // Re-throw so FormFileUpload keeps the image displayed
    }
  };

  // Dropdown options
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d._id, label: d.name })),
    [departments]
  );

  const rankOptions = useMemo(
    () => ranks.map((r) => ({ value: r._id, label: r.name })),
    [ranks]
  );


  // State to track if batch loading is in progress
  const [isBatchLoadingMappings, setIsBatchLoadingMappings] = useState(false);

  // Function to fetch role mappings for multiple posts in a single API call
  const fetchRoleMappingsForPosts = async (postIds: string[]) => {
    if (postIds.length === 0) return;

    // Filter out posts that are already loaded or loading
    const postIdsToFetch = postIds.filter(
      postId => postId && !postRoleMappings.has(postId) && !roleMappingLoading.get(postId)
    );

    if (postIdsToFetch.length === 0) return;

    // Mark all as loading
    setRoleMappingLoading(prev => {
      const newMap = new Map(prev);
      postIdsToFetch.forEach(postId => newMap.set(postId, true));
      return newMap;
    });
    setIsBatchLoadingMappings(true);

    try {
      // Single API call to get all mappings
      const mappingsMap = await onboardingService.getPostRoleMappingsByPostIds(postIdsToFetch);

      // Update state with results (including null for posts without mappings)
      setPostRoleMappings(prev => {
        const newMap = new Map(prev);
        postIdsToFetch.forEach(postId => {
          newMap.set(postId, mappingsMap.get(postId) || null);
        });
        return newMap;
      });
    } catch (error) {
      console.error('Error fetching role mappings for posts:', error);
      // Mark all as null (no mapping found) on error
      setPostRoleMappings(prev => {
        const newMap = new Map(prev);
        postIdsToFetch.forEach(postId => newMap.set(postId, null));
        return newMap;
      });
    } finally {
      // Clear loading state for all
      setRoleMappingLoading(prev => {
        const newMap = new Map(prev);
        postIdsToFetch.forEach(postId => newMap.set(postId, false));
        return newMap;
      });
      setIsBatchLoadingMappings(false);
    }
  };

  // Function to fetch role mapping for a single post (used after creating new mapping)
  const fetchRoleMappingForPost = async (postId: string) => {
    if (!postId) return;

    // Skip if already loaded or loading
    if (postRoleMappings.has(postId) || roleMappingLoading.get(postId)) return;

    setRoleMappingLoading(prev => new Map(prev).set(postId, true));

    try {
      const mapping = await onboardingService.getPostRoleMappingByPostId(postId);
      setPostRoleMappings(prev => new Map(prev).set(postId, mapping));
    } catch (error) {
      console.error('Error fetching role mapping for post:', postId, error);
      setPostRoleMappings(prev => new Map(prev).set(postId, null));
    } finally {
      setRoleMappingLoading(prev => new Map(prev).set(postId, false));
    }
  };

  // Watch for post selection changes and fetch role mappings
  const watchedPosts = watch('posts');

  // Get post IDs as a string to use as dependency (avoids object reference issues)
  const watchedPostIds = watchedPosts?.map(p => p.postCode).filter(Boolean).join(',') || '';

  // Batch fetch role mappings when posts change - single API call instead of one per post
  useEffect(() => {
    if (watchedPostIds && !isBatchLoadingMappings) {
      const postIds = watchedPostIds.split(',').filter(Boolean);
      // Use batch fetch for efficiency
      fetchRoleMappingsForPosts(postIds);
    }
  }, [watchedPostIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle successful role mapping creation
  const handleRoleMappingCreated = async () => {
    setShowCreateRoleMappingDialog(false);
    if (selectedPostForMapping) {
      // Clear cached mapping to force refresh
      setPostRoleMappings(prev => {
        const newMap = new Map(prev);
        newMap.delete(selectedPostForMapping.postId);
        return newMap;
      });
      // Re-fetch the role mapping
      fetchRoleMappingForPost(selectedPostForMapping.postId);
    }
    setSelectedPostForMapping(null);
  };

  // Generate batch year options (last 50 years)
  const batchYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= currentYear - 50; year--) {
      years.push({ value: year.toString(), label: year.toString() });
    }
    return years;
  }, []);

  if (fetchLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <LoadingSpinner size="50px" />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.PERSONNEL}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900">
        {/* Header Section */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => handleNavigate('/personnel')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.25rem' }} />
            <span>Back to Personnel</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditMode ? 'Edit Personnel' : 'Create New Personnel'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isEditMode ? 'Update personnel information' : 'Add a new personnel to the system'}
          </p>
        </div>

        {/* Draft Recovery Banner */}
        {showDraftBanner && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="pi pi-info-circle text-blue-600" style={{ fontSize: '1.25rem' }} />
              <span className="text-blue-800 dark:text-blue-200">
                You have unsaved changes from a previous session. Would you like to restore them?
              </span>
            </div>
            <div className="flex gap-2">
              <Button label="Restore" size="small" onClick={handleRestoreDraft} />
              <Button label="Discard" size="small" severity="secondary" outlined onClick={handleDiscardDraft} />
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Login Credentials Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Login Credentials
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    User ID <span className="text-red-500">*</span>
                  </span>
                  <i
                    className="pi pi-info-circle text-gray-400 hover:text-blue-500 cursor-pointer"
                    style={{ fontSize: '0.875rem' }}
                    data-pr-tooltip="Enter the 8-digit CMFS ID"
                    data-pr-position="top"
                  />
                  <Tooltip target="[data-pr-tooltip]" />
                </div>
                <Controller
                  name="userId"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label=""
                      placeholder="Enter 8-digit CMFS ID"
                      error={!!errors.userId}
                      helperText={errors.userId?.message as string}
                      disabled={isEditMode}
                    />
                  )}
                />
              </div>

              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="Email"
                    type="email"
                    placeholder="user@example.com"
                    required
                    error={!!errors.email}
                    helperText={errors.email?.message as string}
                  />
                )}
              />

              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label={isEditMode ? 'Password (leave blank to keep current)' : 'Password'}
                    type="password"
                    placeholder="Enter password"
                    error={!!errors.password}
                    helperText={errors.password?.message as string}
                    required={!isEditMode}
                  />
                )}
              />
            </div>
          </div>

          {/* Personal Information Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Personal Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-2">
                <Controller
                  name="title"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="Title"
                      options={titleOptions}
                      error={!!errors.title}
                      helperText={errors.title?.message as string}
                      required
                    />
                  )}
                />
              </div>

              <div className="md:col-span-10">
                <Controller
                  name="name"
                  control={control}
                  render={({ field: { value, ...fieldProps } }) => (
                    <FormInput
                      {...fieldProps}
                      value={value || ''}
                      label="Full Name"
                      placeholder="Enter full name"
                      error={!!errors.name}
                      helperText={errors.name?.message as string}
                      required
                    />
                  )}
                />
              </div>

              <div className="md:col-span-4">
                <Controller
                  name="gender"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="Gender"
                      options={genderOptions}
                      error={!!errors.gender}
                      helperText={errors.gender?.message as string}
                      required
                    />
                  )}
                />
              </div>

              <div className="md:col-span-4">
                <Controller
                  name="dateOfBirth"
                  control={control}
                  render={({ field }) => (
                    <FormDatePicker
                      {...field}
                      value={field.value || ''}
                      label="Date of Birth"
                      error={!!errors.dateOfBirth}
                      helperText={errors.dateOfBirth?.message as string}
                      maxDate={new Date().toISOString().split('T')[0]} // Prevent future dates
                    />
                  )}
                />
              </div>

              <div className="md:col-span-4">
                <Controller
                  name="mobile"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Mobile"
                      placeholder="Enter 10-digit mobile number"
                      error={!!errors.mobile}
                      helperText={errors.mobile?.message as string}
                    />
                  )}
                />
              </div>

              <div className="md:col-span-6">
                <Controller
                  name="picture"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <FormFileUpload
                      name="picture"
                      label="Profile Picture"
                      value={value}
                      onChange={onChange}
                      onRemove={handleRemovePicture}
                      accept="image/*"
                    />
                  )}
                />
              </div>
            </div>
          </div>

          {/* Professional Information Section */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              Professional Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Controller
                name="departmentId"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value || null)}
                    label="Department"
                    options={departmentOptions}
                    placeholder="Select a department"
                    required
                    filter
                    filterPlaceholder="Search department..."
                    error={!!errors.departmentId}
                    helperText={errors.departmentId?.message as string}
                  />
                )}
              />

              <Controller
                name="rankId"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value || null)}
                    label="Rank"
                    options={rankOptions}
                    placeholder="Select a rank"
                    required
                    filter
                    filterPlaceholder="Search rank..."
                    error={!!errors.rankId}
                    helperText={errors.rankId?.message as string}
                  />
                )}
              />

              <Controller
                name="batchYear"
                control={control}
                render={({ field: { value, onChange, ...field } }) => (
                  <FormSelect
                    {...field}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value || null)}
                    label="Batch Year"
                    options={batchYearOptions}
                    placeholder="Select batch year"
                    error={!!errors.batchYear}
                    helperText={errors.batchYear?.message as string}
                  />
                )}
              />

              <Controller
                name="badgeNo"
                control={control}
                render={({ field }) => (
                  <FormInput
                    {...field}
                    value={field.value || ''}
                    label="Badge Number"
                    placeholder="Enter badge number (numbers only)"
                    error={!!errors.badgeNo}
                    helperText={errors.badgeNo?.message as string}
                  />
                )}
              />
            </div>
          </div>

          {/* Post Assignments Section - Direct Unit & Post Dropdowns (same pattern as user-onboarding) */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Post Assignments
              </h2>
              <Button
                type="button"
                label="Add Post"
                icon="pi pi-plus"
                size="small"
                severity="secondary"
                outlined
                onClick={() => appendPost({ unitId: '', postCode: '', unitName: '', postName: '', startDate: '', endDate: '', assignmentType: '', isPrimary: false })}
              />
            </div>

            {errors.posts && typeof errors.posts === 'object' && 'message' in errors.posts && (
              <p className="text-red-500 text-sm mb-4">{errors.posts.message as string}</p>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Select a unit and then choose a post within that unit.
            </p>

            <div className="flex flex-col gap-4">
              {postFields.map((field, index) => {
                const currentPost = watchedPosts?.[index];
                const hasSelection = currentPost?.unitId && currentPost?.postCode;
                const postsLoading = postsLoadingMap.get(index) || false;
                const postOptionsForField = getPostOptionsForField(index);

                return (
                  <div key={field.id} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Post Assignment {index + 1}
                        {index === 0 && <span className="text-xs text-blue-600 ml-2">(Primary)</span>}
                      </span>
                      {postFields.length > 1 && (
                        <button
                          type="button"
                          className="ml-auto p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          onClick={() => {
                            removePost(index);
                            // Clean up the embedded posts map for this index
                            setEmbeddedPostsMap(prev => {
                              const newMap = new Map(prev);
                              newMap.delete(index);
                              return newMap;
                            });
                          }}
                          title="Remove post assignment"
                        >
                          <i className="pi pi-trash text-red-600" style={{ fontSize: '1rem' }} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Unit Dropdown */}
                      <Controller
                        name={`posts.${index}.unitId`}
                        control={control}
                        render={({ field: { value, onChange, ...fieldProps } }) => (
                          <FormSearchableSelect
                            {...fieldProps}
                            value={value || ''}
                            onChange={(e) => {
                              const newUnitId = e.target.value;
                              onChange(newUnitId);
                              // Clear post selection when unit changes
                              setValue(`posts.${index}.postCode`, '');
                              setValue(`posts.${index}.postName`, '');
                              // Clear unit name initially - it will be set when posts are fetched
                              setValue(`posts.${index}.unitName`, '');

                              // Fetch posts for the new unit (this also caches unit info)
                              if (newUnitId) {
                                fetchPostsForUnit(newUnitId, index);
                              } else {
                                setEmbeddedPostsMap(prev => {
                                  const newMap = new Map(prev);
                                  newMap.delete(index);
                                  return newMap;
                                });
                                setUnitInfoMap(prev => {
                                  const newMap = new Map(prev);
                                  newMap.delete(index);
                                  return newMap;
                                });
                              }
                            }}
                            label="Unit"
                            onSearch={handleUnitSearch}
                            initialOptions={unitOptions}
                            placeholder="Search and select a unit"
                            required
                            error={!!errors.posts?.[index]?.unitId}
                            helperText={errors.posts?.[index]?.unitId?.message as string}
                            debounceDelay={300}
                            loading={unitsLoading}
                          />
                        )}
                      />

                      {/* Post Dropdown */}
                      <Controller
                        name={`posts.${index}.postCode`}
                        control={control}
                        render={({ field: { value, onChange, ...fieldProps } }) => (
                          <FormSelect
                            {...fieldProps}
                            value={value || ''}
                            onChange={(e) => {
                              const newPostCode = e.target.value;
                              onChange(newPostCode);
                              // Update post name
                              const posts = embeddedPostsMap.get(index) || [];
                              const post = posts.find(p => p.postCode === newPostCode);
                              setValue(`posts.${index}.postName`, post?.postName || '');
                            }}
                            label="Post"
                            options={postOptionsForField}
                            placeholder={
                              !currentPost?.unitId
                                ? 'Select a unit first'
                                : postsLoading
                                ? 'Loading posts...'
                                : postOptionsForField.length === 0
                                ? 'No posts available'
                                : 'Select a post'
                            }
                            required
                            error={!!errors.posts?.[index]?.postCode}
                            helperText={errors.posts?.[index]?.postCode?.message as string}
                            disabled={!currentPost?.unitId || postsLoading}
                            loading={postsLoading}
                            optionDisabled="disabled"
                          />
                        )}
                      />
                    </div>

                    {/* Assignment Details Row */}
                    {hasSelection && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        {/* Assignment Type Dropdown */}
                        <Controller
                          name={`posts.${index}.assignmentType`}
                          control={control}
                          render={({ field: { value, onChange, ...fieldProps } }) => {
                            // Filter out Primary Assignment if user already has one (excluding current index)
                            // Check both assignmentType and isPrimary flag
                            const hasPrimaryAssignment = formValues.posts?.some(
                              (p, idx) => idx !== index && (p.assignmentType === 'Primary Assignment' || p.isPrimary === true)
                            );

                            const assignmentTypeOptions = [
                              { label: 'Primary Assignment', value: 'Primary Assignment' },
                              { label: 'Incharge', value: 'Incharge' },
                              { label: 'Deputation', value: 'Deputation' },
                            ].filter(opt =>
                              !hasPrimaryAssignment || opt.value !== 'Primary Assignment'
                            );

                            return (
                              <FormSelect
                                {...fieldProps}
                                value={value || ''}
                                onChange={(e) => {
                                  const selectedType = e.target.value;
                                  onChange(selectedType);
                                  // Set isPrimary flag based on selection
                                  setValue(`posts.${index}.isPrimary`, selectedType === 'Primary Assignment');
                                }}
                                label="Assignment Type"
                                options={assignmentTypeOptions}
                                placeholder="Select assignment type"
                                required
                                error={!!errors.posts?.[index]?.assignmentType}
                                helperText={errors.posts?.[index]?.assignmentType?.message as string}
                              />
                            );
                          }}
                        />

                        {/* Start Date */}
                        <Controller
                          name={`posts.${index}.startDate`}
                          control={control}
                          render={({ field }) => (
                            <FormDatePicker
                              {...field}
                              value={field.value || ''}
                              label="Start Date"
                              error={!!errors.posts?.[index]?.startDate}
                              helperText={errors.posts?.[index]?.startDate?.message as string}
                            />
                          )}
                        />

                        {/* End Date */}
                        <Controller
                          name={`posts.${index}.endDate`}
                          control={control}
                          render={({ field }) => (
                            <FormDatePicker
                              {...field}
                              value={field.value || ''}
                              label="End Date"
                              error={!!errors.posts?.[index]?.endDate}
                              helperText={errors.posts?.[index]?.endDate?.message as string}
                              disabled={formValues.posts?.[index]?.assignmentType === 'Primary Assignment'}
                            />
                          )}
                        />
                      </div>
                    )}

                    {/* Create Post Button - always visible when unit is selected */}
                    {currentPost?.unitId && !postsLoading && (
                      <div className="mt-3">
                        {(hasNoPosts(index) || areAllPostsFilled(index)) && (
                          <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                            {hasNoPosts(index)
                              ? 'No posts available for this unit.'
                              : 'All posts are filled.'}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const unitId = currentPost?.unitId;
                            const unit = units.find(u => u._id === unitId);
                            const cached = unitInfoMap.get(index);
                            console.log('DEBUG:', { unitId, unit, cached, units });
                            setCreatePostFieldIndex(index);
                            setCreatePostUnitInfo({
                              unitId: unitId || '',
                              unitName: cached?.unitName || unit?.name || '',
                              unitShortCode: cached?.unitCode || unit?.unitCode || '',
                            });
                            setShowCreatePostModal(true);
                          }}
                          disabled={!currentPost?.unitId}
                          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <i className="pi pi-plus-circle" />
                          CREATE POST NOW
                        </button>
                      </div>
                    )}

                    {/* Show selected post info */}
                    {hasSelection && (
                      <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                          <i className="pi pi-check-circle" />
                          <span className="text-sm font-medium">
                            {currentPost?.unitName || 'Unit'} - {currentPost?.postName || currentPost?.postCode}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {postFields.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <i className="pi pi-building text-4xl mb-3 opacity-50" />
                <p>No post assignments yet.</p>
                <p className="text-sm">Click "Add Post" to assign this personnel to a unit post.</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/personnel')}
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

      {/* Leave Confirmation Dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="PersonnelForm.Dialog.Leave"
      />

      {/* Create Role Mapping Dialog */}
      <Dialog
        visible={showCreateRoleMappingDialog}
        onHide={() => {
          setShowCreateRoleMappingDialog(false);
          setSelectedPostForMapping(null);
        }}
        header={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <i className="pi pi-link text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">
                Create Role Mapping
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
                Assign a system role to this post
              </p>
            </div>
          </div>
        }
        style={{ width: '800px', maxWidth: '95vw' }}
        modal
        dismissableMask
        className="create-role-mapping-dialog"
      >
        {selectedPostForMapping && (
          <PostRoleMappingForm
            isModal
            modalPostId={selectedPostForMapping.postId}
            modalPostName={selectedPostForMapping.postName}
            modalUnitName={selectedPostForMapping.unitName}
            onSuccess={handleRoleMappingCreated}
            onCancel={() => {
              setShowCreateRoleMappingDialog(false);
              setSelectedPostForMapping(null);
            }}
          />
        )}
      </Dialog>

      {/* Create Post Modal */}
      {showCreatePostModal && createPostFieldIndex !== null && createPostUnitInfo && (
        <PostFormModal
          visible={showCreatePostModal}
          onHide={() => {
            setShowCreatePostModal(false);
            setCreatePostFieldIndex(null);
            setCreatePostUnitInfo(null);
          }}
          onSave={handleSavePost}
          existingPostCodes={getExistingPostCodes(createPostFieldIndex)}
          isEditing={false}
          isSaving={isSavingPost}
          unitId={createPostUnitInfo.unitId}
          unitName={createPostUnitInfo.unitName}
          unitShortCode={createPostUnitInfo.unitShortCode}
          hideRankSelector
        />
      )}
    </PermissionGuard>
  );
};

export default PersonnelForm;
