/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { Tooltip } from 'mainFe/Tooltip';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { Dropdown } from 'mainFe/Dropdown';
import { Calendar } from 'mainFe/Calendar';
import { Steps } from 'primereact/steps';
import { Tag } from 'primereact/tag';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Dialog } from 'primereact/dialog';

import FormFileUpload from '../../components/forms/form-file-upload';
import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import FormSearchableSelect, { type SelectOption } from '../../components/forms/form-searchable-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PostFormModal from '../../components/posts/PostFormModal';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { masterService } from '../../services/master.service';
import { unitsService } from '../../services/units.service';
import { departmentsService } from '../../services/departments.service';
import { ranksService } from '../../services/ranks.service';
import { personnelService } from '../../services/personnel.service';
import { getSystemRoleById, fetchSystemRolesForDropdown } from '../../services/system-roles.service';
import type { SystemRole } from '../../types/system-role.types';
import { assignmentService, type Assignment } from '../../services/assignment.service';
import { onboardingService, type PostRoleMapping } from '../../services/onboarding.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { fileUploadService } from '../../services/file-upload.service';
import { authService } from '../../services/auth.service';
import type { Unit, EmbeddedPostForCreate, User } from '../../types';

// Type for embedded posts as returned from Unit API (with populated references)
type UnitEmbeddedPost = NonNullable<Unit['posts']>[number];

// Onboarding form schema (personnel + post assignment)
const onboardingSchema = z.object({
  // Step 1: Basic Info
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
  mpin: z
    .string()
    .regex(/^\d{4}$/, 'MPIN must be exactly 4 digits')
    .optional()
    .or(z.literal('')),
  title: z.enum(['Mr', 'Ms', 'Mrs', 'Dr'], {
    message: 'Title is required',
  }),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(150, 'Name must not exceed 150 characters')
    .regex(/^[A-Za-z\s.\-']+$/, 'Name can only contain letters, spaces, periods, hyphens, and apostrophes')
    .trim(),
  gender: z.enum(['Male', 'Female', 'Other'], {
    message: 'Gender is required',
  }),
  dateOfBirth: z.string().optional().or(z.literal('')),
  mobile: z
    .string()
    .min(1, 'Mobile number is required')
    .regex(/^[6-9]\d{9}$/, 'Mobile number must be 10 digits and start with 6, 7, 8, or 9'),
  departmentId: z.string().min(1, 'Department is required'),
  rankId: z.string().min(1, 'Rank is required'),
  batchYear: z.string().optional().or(z.literal('')),
  badgeNo: z
    .string()
    .regex(/^\d*$/, 'Badge number must contain only numbers')
    .max(50, 'Badge number must not exceed 50 characters')
    .optional()
    .or(z.literal('')),
  picture: z.any().nullable().optional(),
  // Step 2: Post Assignment (using embedded posts from units)
  unitId: z.string().min(1, 'Unit is required'),
  postCode: z.string().min(1, 'Post is required'),
  // Store names for display
  unitName: z.string().optional(),
  postName: z.string().optional(),
  // Assignment details
  startDate: z.string().min(1, 'Start Date is required'),
  endDate: z.string().optional().or(z.literal('')),
  assignmentType: z.string().min(1, 'Assignment Type is required'),
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
    // End Date is required for Incharge and Deputation assignment types
    if (data.assignmentType && (data.assignmentType === 'Incharge' || data.assignmentType === 'Deputation')) {
      return !!data.endDate;
    }
    return true;
  },
  {
    message: 'End Date is required for Incharge and Deputation assignments',
    path: ['endDate'],
  }
);

// Edit mode schema - post assignment is optional in edit mode (user may already have assignments)
// Using safeExtend() because the base schema has refinements
const editModeSchema = (onboardingSchema as any).safeExtend({
  mpin: z.string().optional().or(z.literal('')),
  unitId: z.string().optional().or(z.literal('')),
  postCode: z.string().optional().or(z.literal('')),
  startDate: z.string().optional().or(z.literal('')),
  assignmentType: z.string().optional().or(z.literal('')),
});

// Debug: Verify editModeSchema was created successfully
console.log('🔧 editModeSchema created:', editModeSchema);
console.log('🔧 editModeSchema type:', typeof editModeSchema);
console.log('🔧 Has safeExtend:', typeof (onboardingSchema as any).safeExtend);

type OnboardingFormData = z.infer<typeof onboardingSchema>;

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

// Assignment type options
const ASSIGNMENT_TYPE_OPTIONS = [
  { label: 'Primary Assignment', value: 'Primary Assignment' },
  { label: 'Incharge', value: 'Incharge' },
  { label: 'Deputation', value: 'Deputation' },
];

const UserOnboarding = () => {
  const navigate = useAppNavigate();
  const location = useLocation();
  const toast = useRef<Toast>(null);
  const queryClient = useQueryClient();

  // State for logged-in user data from /auth/me API (includes district object)
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null);

  // Fetch logged-in user data from /auth/me API (for file upload district/uploadedBy)
  useEffect(() => {
    authService.getCurrentUser()
      .then((user) => {
        console.log('Logged in user from /auth/me:', user);
        console.log('District:', user?.district);
        setLoggedInUser(user);
      })
      .catch((error) => {
        console.error('Failed to fetch logged-in user:', error);
      });
  }, []);

  // Determine which base path to use based on current URL
  const isUserOnboardingPath = location.pathname.includes('/user-onboarding');
  const basePath = isUserOnboardingPath ? '/user-onboarding' : '/personnel';

  // Get ID from URL params (for edit mode)
  // Supports both /personnel/:id/edit and /user-onboarding/:id/edit routes
  const { id: personnelId, isReady: isIdReady } = useSecureNavigation({
    entity: isUserOnboardingPath ? 'user-onboarding' : 'personnel',
    basePath,
  });

  // Determine if we're in edit mode based on URL
  const isEditMode = Boolean(personnelId && location.pathname.includes('/edit'));

  // Wizard state - 3 steps (Basic Info, Post Assignment, Review)
  const [activeStep, setActiveStep] = useState(0);
  const [createdPersonnelId, setCreatedPersonnelId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRolePreview, setShowRolePreview] = useState(false);
  const [showRolesPermissionsPreview, setShowRolesPermissionsPreview] = useState(false);
  const [showCreatePostDialog, setShowCreatePostDialog] = useState(false);
  const [createPostForAssignmentId, setCreatePostForAssignmentId] = useState<string | null>(null); // null = primary, string = additional assignment id
  const [showCreateRoleMappingDialog, setShowCreateRoleMappingDialog] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreatingRoleMapping, setIsCreatingRoleMapping] = useState(false);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Draft key for localStorage
  const DRAFT_KEY = `user-onboarding-draft-${personnelId || 'create'}`;

  // State for draft restore banner
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draftData, setDraftData] = useState<any>(null);

  // State for picture preview
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null);
  const [showPicturePreview, setShowPicturePreview] = useState(false);

  // State for detailed system roles in preview dialog
  const [detailedSystemRoles, setDetailedSystemRoles] = useState<SystemRole[]>([]);
  const [detailedRolesLoading, setDetailedRolesLoading] = useState(false);

  // Posts state - embedded posts from unit (populated with role objects)
  const [embeddedPosts, setEmbeddedPosts] = useState<UnitEmbeddedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  // Role mapping state - loaded based on post selection
  const [roleMapping, setRoleMapping] = useState<PostRoleMapping | null>(null);
  const [roleMappingLoading, setRoleMappingLoading] = useState(false);

  // Existing assignments state (for edit mode)
  const [existingAssignments, setExistingAssignments] = useState<Assignment[]>([]);
  const [primaryAssignment, setPrimaryAssignment] = useState<Assignment | null>(null);

  // Additional new assignments state (for adding multiple assignments)
  type NewAssignment = {
    id: string;
    unitId: string;
    unitName: string;
    postCode: string;
    postName: string;
    startDate: string;
    endDate: string;
    assignmentType: string;
    embeddedPosts: UnitEmbeddedPost[];
    postsLoading: boolean;
  };
  const [additionalAssignments, setAdditionalAssignments] = useState<NewAssignment[]>([]);

  // Step items for wizard (3 steps)
  const stepItems = [
    { label: 'Basic Info' },
    { label: 'Post Assignment' },
    { label: 'Review' },
  ];

  // Onboarding form (personnel + post assignment)
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(isEditMode ? editModeSchema : onboardingSchema),
    defaultValues: {
      userId: '',
      email: '',
      mpin: '',
      title: undefined,
      name: '',
      gender: undefined,
      dateOfBirth: '',
      mobile: '',
      departmentId: '',
      rankId: '',
      batchYear: '',
      badgeNo: '',
      picture: null,
      unitId: '',
      postCode: '',
      unitName: '',
      postName: '',
      startDate: '',
      endDate: '',
      assignmentType: '',
    },
    mode: 'onChange',
  });

  // Fetch personnel data in edit mode
  const { data: personnelData, isLoading: isLoadingPersonnel } = useQuery({
    queryKey: ['personnel', personnelId],
    queryFn: () => personnelService.getById(personnelId!),
    enabled: isEditMode && isIdReady && !!personnelId,
  });

  // Fetch user assignments in edit mode
  const { data: userAssignments = [], isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['user-assignments', personnelId],
    queryFn: () => assignmentService.list({ userId: personnelId!, isActive: true, isDelete: false }),
    enabled: isEditMode && isIdReady && !!personnelId,
    select: (data) => data.data || [],
  });

  // Watch for unit and post changes
  const selectedUnitId = watch('unitId');
  const selectedPostCode = watch('postCode');
  const pictureValue = watch('picture');
  const formValues = watch();

  // Fetch picture preview when picture is a fileId string
  useEffect(() => {
    let blobUrl: string | null = null;

    if (typeof pictureValue === 'string' && pictureValue) {
      // Fetch the file with authentication and create blob URL
      fileUploadService.getFileUrl(pictureValue)
        .then((url) => {
          blobUrl = url;
          setPicturePreviewUrl(url);
        })
        .catch((error) => {
          console.error('Failed to fetch picture preview:', error);
          setPicturePreviewUrl(null);
        });
    } else if (pictureValue instanceof File) {
      // Create local preview for uploaded file
      blobUrl = URL.createObjectURL(pictureValue);
      setPicturePreviewUrl(blobUrl);
    } else {
      setPicturePreviewUrl(null);
    }

    // Cleanup blob URL on unmount or when pictureValue changes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [pictureValue]);

  // Handle picture preview click
  const handlePicturePreview = () => {
    if (picturePreviewUrl) {
      setShowPicturePreview(true);
    }
  };

  // Handle removing an existing profile picture (delete from file service + update personnel)
  const handleRemovePicture = async (fileId: string) => {
    try {
      await fileUploadService.delete(fileId);
      if (isEditMode && personnelId) {
        await personnelService.update(personnelId, { picture: null });
        queryClient.invalidateQueries({ queryKey: ['personnel', personnelId] });
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

  // Navigation blocker for unsaved changes (only when form is dirty and not on success screen)
  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({
    when: isDirty && activeStep < 3,
  });

  // Autosave draft to localStorage
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, DRAFT_KEY]);

  // Load draft on mount (only for create mode)
  useEffect(() => {
    if (!isEditMode) {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setDraftData(parsed);
          setShowDraftBanner(true);
        } catch {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    }
  }, [isEditMode, DRAFT_KEY]);

  // Handle draft restore
  const handleRestoreDraft = () => {
    if (draftData) {
      reset(draftData);
      setShowDraftBanner(false);
    }
  };

  // Handle draft discard
  const handleDiscardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftBanner(false);
    setDraftData(null);
  };

  // Master data queries
  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: masterService.getDepartments,
  });

  const { data: ranks = [], isLoading: ranksLoading } = useQuery({
    queryKey: ['ranks'],
    queryFn: masterService.getRanks,
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'dropdown'],
    queryFn: masterService.getUnitsForDropdown,
  });

  // System Roles query for role assignment dialog
  const { data: systemRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['system-roles', 'dropdown'],
    queryFn: fetchSystemRolesForDropdown,
  });

  // Populate form with personnel data in edit mode
  // Wait for both personnelData AND userAssignments to finish loading
  useEffect(() => {
    if (isEditMode && personnelData && !isDataLoaded && !isLoadingAssignments) {
      console.log('📋 Populating edit form with personnel data:', {
        name: personnelData.name,
        email: personnelData.email,
        userId: personnelData.userId,
        mobile: personnelData.mobile,
        title: personnelData.title,
        gender: personnelData.gender,
        departmentId: personnelData.departmentId,
        rankId: personnelData.rankId,
        department: personnelData.department,
        rank: personnelData.rank,
        assignmentsCount: userAssignments?.length,
      });
      // Parse gender to match enum (capitalize first letter)
      const genderMap: Record<string, 'Male' | 'Female' | 'Other'> = {
        male: 'Male',
        female: 'Female',
        other: 'Other',
      };
      const normalizedGender = genderMap[personnelData.gender?.toLowerCase() || ''] || undefined;

      // Format date of birth
      let dateOfBirth = '';
      if (personnelData.dateOfBirth) {
        const date = new Date(personnelData.dateOfBirth);
        if (!isNaN(date.getTime())) {
          dateOfBirth = date.toISOString().split('T')[0];
        }
      }

      // Normalize mobile number - strip country code prefix if present (+91, 91, etc.)
      let normalizedMobile = personnelData.mobile || '';
      if (normalizedMobile.startsWith('+91')) {
        normalizedMobile = normalizedMobile.slice(3);
      } else if (normalizedMobile.startsWith('91') && normalizedMobile.length > 10) {
        normalizedMobile = normalizedMobile.slice(2);
      }

      // Reset form with personnel data
      reset({
        userId: personnelData.userId || '',
        email: personnelData.email || '',
        mpin: personnelData.mpin?.toString() || '',
        title: personnelData.title as 'Mr' | 'Ms' | 'Mrs' | 'Dr' | undefined,
        name: personnelData.name || '',
        gender: normalizedGender,
        dateOfBirth,
        mobile: normalizedMobile,
        departmentId: typeof personnelData.department === 'object' ? personnelData.department?._id : personnelData.departmentId || '',
        rankId: typeof personnelData.rank === 'object' ? personnelData.rank?._id : personnelData.rankId || '',
        batchYear: personnelData.batchYear?.toString() || '',
        badgeNo: personnelData.badgeNo || '',
        picture: personnelData.picture || null,
        // Post assignment fields - will be set from primary assignment
        unitId: '',
        postCode: '',
        unitName: '',
        postName: '',
      });

      // Set existing assignments state
      if (userAssignments && userAssignments.length > 0) {
        setExistingAssignments(userAssignments);
        // Find primary assignment or first active assignment
        const primary = userAssignments.find((a: Assignment) => a.isPrimary) || userAssignments[0];
        setPrimaryAssignment(primary);

        // In edit mode, don't pre-populate unit/post fields since those are for "Add New Assignment"
        // Existing assignments are already displayed in a separate section
      }

      setIsDataLoaded(true);
    }
  }, [isEditMode, personnelData, userAssignments, isDataLoaded, isLoadingAssignments, reset, setValue]);

  // Function to fetch embedded posts for a unit
  const fetchPostsForUnit = async (unitId: string, clearSelection = true) => {
    if (!unitId) {
      setEmbeddedPosts([]);
      setSelectedUnit(null);
      setRoleMapping(null);
      return;
    }

    setPostsLoading(true);
    if (clearSelection) {
      setEmbeddedPosts([]);
      setValue('postCode', '');
      setValue('postName', '');
      setRoleMapping(null);
    }

    try {
      // Fetch unit with embedded posts
      const unit = await unitsService.getById(unitId);
      setSelectedUnit(unit);
      // Filter to only non-deleted posts
      const posts = (unit.posts || []).filter(p => !p.isDelete);
      setEmbeddedPosts(posts);
      // Update unit name in form
      setValue('unitName', unit.name);
      return posts;
    } catch (error) {
      console.error('Error fetching unit posts:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load posts for this unit',
        life: 3000,
      });
      return [];
    } finally {
      setPostsLoading(false);
    }
  };

  // Fetch posts when unit is selected
  useEffect(() => {
    fetchPostsForUnit(selectedUnitId);
  }, [selectedUnitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // For embedded posts, role mappings are based on assignedRoles in the post
  // We'll display the assigned roles from the embedded post
  useEffect(() => {
    if (selectedPostCode && embeddedPosts.length > 0) {
      const selectedPost = embeddedPosts.find(p => p.postCode === selectedPostCode);
      if (selectedPost && selectedPost.assignedRoles && selectedPost.assignedRoles.length > 0) {
        // Create a simplified role mapping display from embedded post's assignedRoles
        setRoleMapping({
          _id: `embedded-${selectedPostCode}`,
          postId: selectedPostCode,
          isActive: true,
          isDelete: false,
          // The roles assigned to this post
          roleName: selectedPost.assignedRoles.length > 0 ? 'Assigned Role(s)' : undefined,
        } as PostRoleMapping);
      } else {
        setRoleMapping(null);
      }
    } else {
      setRoleMapping(null);
    }
  }, [selectedPostCode, embeddedPosts]);

  // Dropdown options
  const departmentOptions = useMemo(
    () => (departments || []).map((d) => ({ value: d._id, label: d.name })),
    [departments]
  );

  const rankOptions = useMemo(
    () => (ranks || []).map((r) => ({ value: r._id, label: r.name })),
    [ranks]
  );

  const unitOptions = useMemo(
    () => (units || []).map((u) => ({ value: u._id, label: u.name })),
    [units]
  );

  // System Roles dropdown options for role assignment (MultiSelect format)
  const roleOptions = useMemo(
    () => (systemRoles || []).map((role) => ({
      value: role._id,
      label: role.roleName + (role.roleShortCode ? ` (${role.roleShortCode})` : ''),
    })),
    [systemRoles]
  );

  // Posts dropdown options - disable filled posts and posts already selected in additional assignments
  const postOptions = useMemo(() => {
    return embeddedPosts.map((post) => {
      const isVacant = !post.assignedUser;
      // Check if this post is already selected in any additional assignment for the same unit
      const isSelectedInAdditional = additionalAssignments.some(
        a => a.unitId === selectedUnitId && a.postCode === post.postCode
      );
      const isDisabled = !isVacant || isSelectedInAdditional;
      let statusLabel = '';
      if (!isVacant) {
        statusLabel = ' - Filled';
      } else if (isSelectedInAdditional) {
        statusLabel = ' - Already Selected';
      } else {
        statusLabel = ' - Available';
      }
      return {
        value: post.postCode,
        label: `${post.postName} (${post.postCode})${statusLabel}`,
        disabled: isDisabled,
      };
    });
  }, [embeddedPosts, additionalAssignments, selectedUnitId]);

  // Get selected embedded post
  const selectedPost = useMemo(() => {
    return embeddedPosts.find(p => p.postCode === selectedPostCode);
  }, [embeddedPosts, selectedPostCode]);

  // Generate batch year options
  const batchYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 50 }, (_, i) => ({
      value: String(currentYear - i),
      label: String(currentYear - i),
    }));
  }, []);

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

  // Search handler for departments
  const handleDepartmentSearch = async (searchTerm: string): Promise<SelectOption[]> => {
    try {
      const results = await departmentsService.getAll({ search: searchTerm, include_deleted: false });
      return (results.data || []).map((dept) => ({
        value: dept._id,
        label: dept.name,
      }));
    } catch (error) {
      console.error('Error searching departments:', error);
      return [];
    }
  };

  // Search handler for ranks
  const handleRankSearch = async (searchTerm: string): Promise<SelectOption[]> => {
    try {
      const results = await ranksService.getAll({ search: searchTerm, include_deleted: false });
      return (results.data || []).map((rank) => ({
        value: rank._id,
        label: rank.name,
      }));
    } catch (error) {
      console.error('Error searching ranks:', error);
      return [];
    }
  };

  // Helper function to validate all current assignments
  const validateCurrentAssignments = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Validate primary assignment only if unit is selected
    if (selectedUnitId) {
      const primaryMissingFields: string[] = [];
      if (!selectedPostCode) primaryMissingFields.push('Post');
      if (!formValues.startDate) primaryMissingFields.push('Start Date');
      if (!formValues.assignmentType) primaryMissingFields.push('Assignment Type');
      // End Date is required for Incharge and Deputation assignment types
      if (formValues.assignmentType && (formValues.assignmentType === 'Incharge' || formValues.assignmentType === 'Deputation') && !formValues.endDate) {
        primaryMissingFields.push('End Date');
      }

      if (primaryMissingFields.length > 0) {
        errors.push(`Primary Assignment: ${primaryMissingFields.join(', ')}`);
      }
    }

    // Validate all additional assignments
    additionalAssignments.forEach((assignment, index) => {
      const missingFields: string[] = [];
      if (!assignment.unitId) missingFields.push('Unit');
      if (!assignment.postCode) missingFields.push('Post');
      if (!assignment.startDate) missingFields.push('Start Date');
      if (!assignment.assignmentType) missingFields.push('Assignment Type');
      // End Date is required for Incharge and Deputation assignment types
      if (assignment.assignmentType && (assignment.assignmentType === 'Incharge' || assignment.assignmentType === 'Deputation') && !assignment.endDate) {
        missingFields.push('End Date');
      }

      if (missingFields.length > 0) {
        errors.push(`Assignment ${index + 2}: ${missingFields.join(', ')}`);
      }
    });

    return { isValid: errors.length === 0, errors };
  };

  // Functions to manage additional assignments
  const handleAddAssignment = () => {
    // Validate all current assignments before adding a new one
    const { isValid, errors } = validateCurrentAssignments();

    if (!isValid) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: `Please complete all required fields before adding another assignment:\n${errors.join('\n')}`,
        life: 8000,
      });
      return;
    }

    const newAssignment: NewAssignment = {
      id: `new-${Date.now()}`,
      unitId: '',
      unitName: '',
      postCode: '',
      postName: '',
      startDate: '',
      endDate: '',
      assignmentType: '',
      embeddedPosts: [],
      postsLoading: false,
    };
    setAdditionalAssignments(prev => [...prev, newAssignment]);
  };

  const handleRemoveAssignment = (id: string) => {
    setAdditionalAssignments(prev => prev.filter(a => a.id !== id));
  };

  const handleAdditionalAssignmentChange = (id: string, field: keyof NewAssignment, value: any) => {
    setAdditionalAssignments(prev => prev.map(a =>
      a.id === id ? { ...a, [field]: value } : a
    ));
  };

  // Fetch posts for additional assignment when unit is selected
  const handleAdditionalAssignmentUnitChange = async (assignmentId: string, unitId: string, unitName: string) => {
    handleAdditionalAssignmentChange(assignmentId, 'unitId', unitId);
    handleAdditionalAssignmentChange(assignmentId, 'unitName', unitName);
    handleAdditionalAssignmentChange(assignmentId, 'postCode', '');
    handleAdditionalAssignmentChange(assignmentId, 'postName', '');
    handleAdditionalAssignmentChange(assignmentId, 'postsLoading', true);

    try {
      const unitData = await unitsService.getById(unitId);
      const posts = unitData?.posts || [];
      setAdditionalAssignments(prev => prev.map(a =>
        a.id === assignmentId ? { ...a, embeddedPosts: posts, postsLoading: false } : a
      ));
    } catch (error) {
      console.error('Error fetching posts for unit:', error);
      setAdditionalAssignments(prev => prev.map(a =>
        a.id === assignmentId ? { ...a, embeddedPosts: [], postsLoading: false } : a
      ));
    }
  };

  // Get permissions to display - check root level permissions first (API returns consolidated at root)
  const permissionsToDisplay = useMemo(() => {
    if (!roleMapping) return [];
    // API returns consolidated permissions at root level as 'permissions'
    return roleMapping.permissions || roleMapping.consolidatedPermissions || roleMapping.role?.permissions || [];
  }, [roleMapping]);

  // Get system role name from various possible fields in the API response
  const systemRoleName = useMemo(() => {
    if (!roleMapping) return 'N/A';
    // Check all possible locations for role name
    return roleMapping.systemRoleName
      || roleMapping.systemRoleData?.roleName
      || roleMapping.roleName
      || roleMapping.role?.name
      || 'N/A';
  }, [roleMapping]);

  // Get selected unit name from form value or fetch
  const selectedUnitName = useMemo(() => {
    if (formValues.unitName) return formValues.unitName;
    const unit = units.find(u => u._id === selectedUnitId);
    return unit?.name || '';
  }, [units, selectedUnitId, formValues.unitName]);

  // Get selected unit short code
  const selectedUnitShortCode = useMemo(() => {
    const unit = units.find(u => u._id === selectedUnitId);
    return unit?.unitCode || '';
  }, [units, selectedUnitId]);

  // Get department and rank names for review
  const departmentName = useMemo(() => {
    const dept = departments.find(d => d._id === formValues.departmentId);
    return dept?.name || '';
  }, [departments, formValues.departmentId]);

  const rankName = useMemo(() => {
    const rank = ranks.find(r => r._id === formValues.rankId);
    return rank?.name || '';
  }, [ranks, formValues.rankId]);

  // Track all selected unit+post combinations to prevent duplicates
  const selectedAssignmentKeys = useMemo(() => {
    const keys = new Set<string>();

    // Add primary assignment if selected
    if (selectedUnitId && selectedPostCode) {
      keys.add(`${selectedUnitId}-${selectedPostCode}`);
    }

    // Add all additional assignments
    additionalAssignments.forEach(assignment => {
      if (assignment.unitId && assignment.postCode) {
        keys.add(`${assignment.unitId}-${assignment.postCode}`);
      }
    });

    // Add existing assignments (edit mode)
    existingAssignments.forEach(assignment => {
      const unitId = typeof assignment.unit === 'object' ? assignment.unit._id : assignment.unit;
      if (unitId && assignment.postCode) {
        keys.add(`${unitId}-${assignment.postCode}`);
      }
    });

    return keys;
  }, [selectedUnitId, selectedPostCode, additionalAssignments, existingAssignments]);

  // Helper to check if a post is already selected in another assignment
  const isPostAlreadySelected = (unitId: string, postCode: string, excludeAssignmentId?: string) => {
    // Check primary assignment
    if (selectedUnitId === unitId && selectedPostCode === postCode) {
      return true;
    }

    // Check additional assignments (excluding the current one if provided)
    return additionalAssignments.some(a =>
      a.id !== excludeAssignmentId && a.unitId === unitId && a.postCode === postCode
    );
  };

  // Handle post creation - save via API and auto-select
  const handleSavePost = async (postData: EmbeddedPostForCreate) => {
    // Determine which unit to use based on whether we're creating for primary or additional assignment
    const targetUnitId = createPostForAssignmentId
      ? additionalAssignments.find(a => a.id === createPostForAssignmentId)?.unitId
      : selectedUnitId;

    if (!targetUnitId) return;

    setIsSavingPost(true);
    try {
      // Add the post to the unit via API
      await unitsService.addPost(targetUnitId, postData);

      // Close modal first
      setShowCreatePostDialog(false);

      if (createPostForAssignmentId) {
        // Creating post for additional assignment
        const assignmentId = createPostForAssignmentId;

        // Fetch updated posts for the unit
        const unitData = await unitsService.getById(targetUnitId);
        const posts = unitData?.posts || [];

        // Update additional assignment's embedded posts
        setAdditionalAssignments(prev => prev.map(a =>
          a.id === assignmentId ? { ...a, embeddedPosts: posts } : a
        ));

        // Auto-select the newly created post
        const newPost = posts.find((p: UnitEmbeddedPost) => p.postCode === postData.postCode);
        if (newPost) {
          handleAdditionalAssignmentChange(assignmentId, 'postCode', newPost.postCode);
          handleAdditionalAssignmentChange(assignmentId, 'postName', newPost.postName);
        }

        setCreatePostForAssignmentId(null);
      } else {
        // Creating post for primary assignment
        // Refresh posts list
        const refreshedPosts = await fetchPostsForUnit(targetUnitId, false);

        // Auto-select the newly created post
        if (refreshedPosts && refreshedPosts.length > 0) {
          const newPost = refreshedPosts.find((p: UnitEmbeddedPost) => p.postCode === postData.postCode);
          if (newPost) {
            setValue('postCode', newPost.postCode);
            setValue('postName', newPost.postName);
          }
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
      setCreatePostForAssignmentId(null);
    }
  };

  // Handle role assignment - assigns a role to the embedded post
  const handleCreateRoleMapping = async () => {
    if (!selectedPostCode || !selectedRoleId || !selectedUnitId) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a role',
        life: 3000,
      });
      return;
    }

    setIsCreatingRoleMapping(true);
    try {
      // Add role to the embedded post (API expects array)
      await unitsService.addPostRoles(selectedUnitId, selectedPostCode, [selectedRoleId]);

      // Refresh the posts list to get updated assignedRoles
      await fetchPostsForUnit(selectedUnitId, false);

      setShowCreateRoleMappingDialog(false);
      setSelectedRoleId(null);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Role assigned to post successfully',
        life: 3000,
      });
    } catch (error: any) {
      const errorMessage = extractErrorMessage(error, 'Failed to assign role to post');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    } finally {
      setIsCreatingRoleMapping(false);
    }
  };

  // Open role mapping dialog
  const handleOpenCreateRoleMappingDialog = () => {
    setSelectedRoleId(null);
    setShowCreateRoleMappingDialog(true);
  };

  // Open role permissions preview and fetch system role details
  const handleOpenRolesPermissionsPreview = async () => {
    if (!selectedPost?.assignedRoles || selectedPost.assignedRoles.length === 0) {
      setShowRolesPermissionsPreview(true);
      return;
    }

    setDetailedRolesLoading(true);
    setDetailedSystemRoles([]);
    setShowRolesPermissionsPreview(true);

    try {
      // Get role IDs - handle both populated objects and string IDs
      const roleIds = selectedPost.assignedRoles.map((role) =>
        typeof role === 'object' && role !== null ? role._id : role
      );

      // Fetch each system role's details (these are System Roles from rank_roles table)
      const rolePromises = roleIds.map((id) => getSystemRoleById(id).catch(() => null));
      const roleResults = await Promise.all(rolePromises);

      // Filter out any null results (failed fetches)
      const validRoles = roleResults.filter((role): role is SystemRole => role !== null);
      setDetailedSystemRoles(validRoles);
    } catch (error) {
      console.error('Error fetching system role details:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load role permissions',
        life: 5000,
      });
    } finally {
      setDetailedRolesLoading(false);
    }
  };

  // Step validation
  const validateStep = async (step: number): Promise<boolean> => {
    if (step === 0) {
      // Basic Info validation
      const result = await trigger(['userId', 'email', 'title', 'name', 'gender', 'mobile', 'departmentId', 'rankId']);
      return result;
    }
    if (step === 1) {
      // Post Assignment validation - in edit mode, existing assignment is acceptable
      const hasExistingAssignments = isEditMode && existingAssignments.length > 0;
      const hasPrimaryUnitSelected = !!selectedUnitId;
      const hasPrimaryPostSelected = !!selectedPostCode;
      const hasPrimaryNewAssignment = hasPrimaryUnitSelected && hasPrimaryPostSelected;
      const hasAdditionalAssignments = additionalAssignments.length > 0;

      // In edit mode with existing assignments and no new assignments - that's OK
      if (hasExistingAssignments && !hasPrimaryUnitSelected && !hasAdditionalAssignments) {
        return true;
      }

      // Validate primary assignment if user has started selecting one (unit selected)
      if (hasPrimaryUnitSelected) {
        // Check all required fields for the primary assignment
        const primaryMissingFields: string[] = [];
        if (!selectedPostCode) primaryMissingFields.push('Post');
        if (!formValues.startDate) primaryMissingFields.push('Start Date');
        if (!formValues.assignmentType) primaryMissingFields.push('Assignment Type');

        if (primaryMissingFields.length > 0) {
          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: `Primary Assignment: Please fill ${primaryMissingFields.join(', ')}`,
            life: 8000,
          });
          // Set error on each missing field manually (trigger() won't work in edit mode - schema makes fields optional)
          if (primaryMissingFields.includes('Post')) {
            setError('postCode', { type: 'manual', message: 'Please select Post' });
          }
          if (primaryMissingFields.includes('Start Date')) {
            setError('startDate', { type: 'manual', message: 'Please select Start Date' });
          }
          if (primaryMissingFields.includes('Assignment Type')) {
            setError('assignmentType', { type: 'manual', message: 'Please select Assignment Type' });
          }
          return false;
        }

        // Validate end date for Incharge and Deputation assignment types
        if (formValues.assignmentType && (formValues.assignmentType === 'Incharge' || formValues.assignmentType === 'Deputation') && !formValues.endDate) {
          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'End Date is required for Incharge and Deputation assignments',
            life: 5000,
          });
          setError('endDate', { type: 'manual', message: 'Please select End Date' });
          return false;
        }

        // Check if the selected post has assigned roles
        const post = embeddedPosts.find(p => p.postCode === selectedPostCode);
        if (!post || !post.assignedRoles || post.assignedRoles.length === 0) {
          toast.current?.show({
            severity: 'warn',
            summary: 'Warning',
            detail: 'No roles assigned to this post. Please select a different post or assign a role.',
            life: 5000,
          });
          return false;
        }
      }

      // For create mode, primary assignment is required
      if (!isEditMode) {
        if (!selectedUnitId || !selectedPostCode) {
          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'Please select a Unit and Post for the assignment',
            life: 5000,
          });
          await trigger(['unitId', 'postCode']);
          return false;
        }

        // Validate start date and assignment type
        if (!formValues.startDate || !formValues.assignmentType) {
          const missingFields: string[] = [];
          if (!formValues.startDate) missingFields.push('Start Date');
          if (!formValues.assignmentType) missingFields.push('Assignment Type');

          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: `Please fill ${missingFields.join(' and ')} for the assignment`,
            life: 5000,
          });
          await trigger(['startDate', 'assignmentType']);
          return false;
        }

        // Validate end date for Incharge and Deputation assignment types
        if (formValues.assignmentType && (formValues.assignmentType === 'Incharge' || formValues.assignmentType === 'Deputation') && !formValues.endDate) {
          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: 'End Date is required for Incharge and Deputation assignments',
            life: 5000,
          });
          await trigger(['endDate']);
          return false;
        }

        const post = embeddedPosts.find(p => p.postCode === selectedPostCode);
        if (!post || !post.assignedRoles || post.assignedRoles.length === 0) {
          toast.current?.show({
            severity: 'warn',
            summary: 'Warning',
            detail: 'No roles assigned to this post. Please select a different post or assign a role.',
            life: 5000,
          });
          return false;
        }
      }

      // Validate additional assignments
      if (hasAdditionalAssignments) {
        const invalidAssignments: string[] = [];
        additionalAssignments.forEach((assignment, index) => {
          const missingFields: string[] = [];
          if (!assignment.unitId) missingFields.push('Unit');
          if (!assignment.postCode) missingFields.push('Post');
          if (!assignment.startDate) missingFields.push('Start Date');
          if (!assignment.assignmentType) missingFields.push('Assignment Type');
          // End Date is required for Incharge and Deputation assignment types
          if (assignment.assignmentType && (assignment.assignmentType === 'Incharge' || assignment.assignmentType === 'Deputation') && !assignment.endDate) {
            missingFields.push('End Date');
          }

          if (missingFields.length > 0) {
            invalidAssignments.push(`Assignment ${index + 2}: ${missingFields.join(', ')}`);
          }
        });

        if (invalidAssignments.length > 0) {
          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: `Please fill required fields for additional assignments:\n${invalidAssignments.join('\n')}`,
            life: 8000,
          });
          return false;
        }
      }

      // Check for duplicate unit+post combinations across all new assignments
      const allNewAssignments: { unitId: string; postCode: string; label: string }[] = [];

      // Add primary assignment if selected
      if (selectedUnitId && selectedPostCode) {
        allNewAssignments.push({
          unitId: selectedUnitId,
          postCode: selectedPostCode,
          label: 'Primary Assignment',
        });
      }

      // Add additional assignments
      additionalAssignments.forEach((assignment, index) => {
        if (assignment.unitId && assignment.postCode) {
          allNewAssignments.push({
            unitId: assignment.unitId,
            postCode: assignment.postCode,
            label: `Assignment ${index + 2}`,
          });
        }
      });

      // Check for duplicates among new assignments
      const seenCombinations = new Map<string, string>();
      const duplicates: string[] = [];

      for (const assignment of allNewAssignments) {
        const key = `${assignment.unitId}-${assignment.postCode}`;
        if (seenCombinations.has(key)) {
          duplicates.push(`${seenCombinations.get(key)} and ${assignment.label}`);
        } else {
          seenCombinations.set(key, assignment.label);
        }
      }

      if (duplicates.length > 0) {
        toast.current?.show({
          severity: 'error',
          summary: 'Duplicate Assignment',
          detail: `Cannot assign the same post multiple times: ${duplicates.join(', ')}`,
          life: 8000,
        });
        return false;
      }

      // Check if any new assignment conflicts with existing assignments (edit mode)
      if (isEditMode && existingAssignments.length > 0) {
        const existingKeys = new Set(
          existingAssignments.map(a => {
            const unitId = typeof a.unit === 'object' ? a.unit._id : a.unit;
            return `${unitId}-${a.postCode}`;
          })
        );

        for (const assignment of allNewAssignments) {
          const key = `${assignment.unitId}-${assignment.postCode}`;
          if (existingKeys.has(key)) {
            toast.current?.show({
              severity: 'error',
              summary: 'Duplicate Assignment',
              detail: `${assignment.label} conflicts with an existing assignment. Cannot assign the same post twice.`,
              life: 8000,
            });
            return false;
          }
        }
      }

      return true;
    }
    return true;
  };

  // Check if Next button should be disabled on step 1
  const hasRequiredFieldsMissing = activeStep === 1 && (
    !formValues.startDate ||
    !formValues.assignmentType ||
    ((formValues.assignmentType === 'Incharge' || formValues.assignmentType === 'Deputation') && !formValues.endDate)
  );

  // Navigation handlers
  const handleNext = async () => {
    const isValid = await validateStep(activeStep);
    if (isValid && activeStep < 2) {
      setActiveStep(activeStep + 1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    }
  };

  // Submit handler - creates or updates personnel and assignment
  const onSubmit = async (data: OnboardingFormData) => {
    console.log('✅ FORM VALIDATION PASSED - onSubmit called');
    console.log('Submitted form data:', JSON.stringify(data, null, 2));
    console.log('isEditMode:', isEditMode, 'personnelId:', personnelId);
    setIsSubmitting(true);
    try {
      // Normalize mobile number - add +91 prefix if not present (stored format in DB)
      const normalizedMobile = data.mobile && !data.mobile.startsWith('+91')
        ? `+91${data.mobile}`
        : data.mobile;

      // Upload picture if it's a File object
      let pictureId: string | null | undefined;
      if (data.picture instanceof File) {
        // Get district ID by fetching unit details
        let districtId = '';
        const uploadedById = loggedInUser?._id || '';

        // Get unitId from: 1) form data, 2) userAssignments (edit mode)
        const unitIdForDistrict = data.unitId || userAssignments[0]?.unitId;

        if (unitIdForDistrict) {
          try {
            const unitDetails = await unitsService.getById(unitIdForDistrict);
            districtId = unitDetails?.districtId || '';
          } catch (unitError) {
            console.error('[UserOnboarding] Failed to fetch unit details:', unitError);
          }
        }

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
        pictureId = null; // Picture was cleared
      }

      if (isEditMode && personnelId) {
        // UPDATE MODE - Update personnel information
        const updatePayload = {
          email: data.email,
          name: data.name,
          title: data.title,
          gender: data.gender?.toLowerCase(),
          mobile: normalizedMobile,
          departmentId: data.departmentId,
          rankId: data.rankId,
          batchYear: data.batchYear ? parseInt(data.batchYear) : undefined,
          dateOfBirth: data.dateOfBirth ? `${data.dateOfBirth}T00:00:00Z` : undefined,
          badgeNo: data.badgeNo || undefined,
          picture: pictureId,
        };

        await personnelService.update(personnelId, updatePayload);
        setCreatedPersonnelId(personnelId);

        // Check if user selected a new/different assignment
        const hasNewAssignment = data.unitId && data.postCode;
        const assignmentChanged = primaryAssignment
          ? (data.unitId !== primaryAssignment.unitId || data.postCode !== primaryAssignment.postCode)
          : hasNewAssignment;

        if (assignmentChanged && hasNewAssignment) {
          // Create a new assignment if user selected a different unit/post
          try {
            await assignmentService.create({
              userId: personnelId,
              unitId: data.unitId,
              postCode: data.postCode,
              assignmentType: data.assignmentType,
              isPrimary: data.assignmentType === 'Primary Assignment',
              isActive: true,
              startDate: data.startDate ? `${data.startDate}T00:00:00.000+00:00` : new Date().toISOString(),
              endDate: data.endDate ? `${data.endDate}T00:00:00.000+00:00` : undefined,
            });

            toast.current?.show({
              severity: 'success',
              summary: 'Success',
              detail: 'Personnel updated and new assignment created successfully',
              life: 3000,
            });
          } catch (assignmentError: any) {
            console.error('Error creating assignment:', assignmentError);
            toast.current?.show({
              severity: 'warn',
              summary: 'Partial Success',
              detail: 'Personnel updated but new assignment failed. Please assign manually.',
              life: 5000,
            });
          }
        } else {
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Personnel updated successfully',
            life: 3000,
          });
        }

        // Create additional assignments
        if (additionalAssignments.length > 0) {
          for (const assignment of additionalAssignments) {
            if (assignment.unitId && assignment.postCode) {
              try {
                await assignmentService.create({
                  userId: personnelId,
                  unitId: assignment.unitId,
                  postCode: assignment.postCode,
                  assignmentType: assignment.assignmentType,
                  isPrimary: assignment.assignmentType === 'Primary Assignment',
                  isActive: true,
                  startDate: assignment.startDate ? `${assignment.startDate}T00:00:00.000+00:00` : new Date().toISOString(),
                  endDate: assignment.endDate ? `${assignment.endDate}T00:00:00.000+00:00` : undefined,
                });
              } catch (additionalAssignmentError: any) {
                console.error('Error creating additional assignment:', additionalAssignmentError);
                toast.current?.show({
                  severity: 'warn',
                  summary: 'Partial Success',
                  detail: `Failed to create assignment for ${assignment.unitName} - ${assignment.postName}`,
                  life: 5000,
                });
              }
            }
          }
        }

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['personnel'] });
        queryClient.invalidateQueries({ queryKey: ['user-assignments', personnelId] });

        // Clear draft from localStorage on success
        localStorage.removeItem(DRAFT_KEY);

        // Move to complete step
        setActiveStep(3);
      } else {
        // CREATE MODE - Create personnel using onboarding API
        const onboardingPayload = {
          email: data.email,
          name: data.name,
          userId: data.userId,
          password: data.userId, // Default password is the userId (user can change later)
          title: data.title,
          gender: data.gender?.toLowerCase(),
          mobile: normalizedMobile,
          departmentId: data.departmentId,
          rankId: data.rankId,
          batchYear: data.batchYear ? parseInt(data.batchYear) : undefined,
          dateOfBirth: data.dateOfBirth ? `${data.dateOfBirth}T00:00:00Z` : undefined,
          badgeNo: data.badgeNo || undefined,
          picture: pictureId,
        };

        const result = await onboardingService.create(onboardingPayload);
        const newPersonnelId = result.personnel._id;
        setCreatedPersonnelId(newPersonnelId);

        // Create assignment for the selected post
        try {
          await assignmentService.create({
            userId: newPersonnelId,
            unitId: data.unitId,
            postCode: data.postCode,
            assignmentType: data.assignmentType,
            isPrimary: data.assignmentType === 'Primary Assignment',
            isActive: true,
            startDate: data.startDate ? `${data.startDate}T00:00:00.000+00:00` : new Date().toISOString(),
            endDate: data.endDate ? `${data.endDate}T00:00:00.000+00:00` : undefined,
          });
        } catch (assignmentError: any) {
          console.error('Error creating assignment:', assignmentError);
          toast.current?.show({
            severity: 'warn',
            summary: 'Partial Success',
            detail: 'User created but assignment failed. Please assign manually.',
            life: 5000,
          });
        }

        // Create additional assignments
        if (additionalAssignments.length > 0) {
          for (const assignment of additionalAssignments) {
            if (assignment.unitId && assignment.postCode) {
              try {
                await assignmentService.create({
                  userId: newPersonnelId,
                  unitId: assignment.unitId,
                  postCode: assignment.postCode,
                  assignmentType: assignment.assignmentType,
                  isPrimary: assignment.assignmentType === 'Primary Assignment',
                  isActive: true,
                  startDate: assignment.startDate ? `${assignment.startDate}T00:00:00.000+00:00` : new Date().toISOString(),
                  endDate: assignment.endDate ? `${assignment.endDate}T00:00:00.000+00:00` : undefined,
                });
              } catch (additionalAssignmentError: any) {
                console.error('Error creating additional assignment:', additionalAssignmentError);
                toast.current?.show({
                  severity: 'warn',
                  summary: 'Partial Success',
                  detail: `Failed to create assignment for ${assignment.unitName} - ${assignment.postName}`,
                  life: 5000,
                });
              }
            }
          }
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'User onboarded successfully',
          life: 3000,
        });

        // Clear draft from localStorage on success
        localStorage.removeItem(DRAFT_KEY);

        // Move to complete step
        setActiveStep(3);
      }
    } catch (error: any) {
      const errorMessage = extractErrorMessage(error, isEditMode ? 'Failed to update personnel' : 'Failed to complete onboarding');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Debug: Log validation errors when form submit fails silently
  const onInvalid = (validationErrors: any) => {
    console.error('❌ FORM VALIDATION FAILED - This is why Update Personnel does nothing!');
    console.error('Validation Errors:', JSON.stringify(validationErrors, null, 2));

    // Log each field error for easy debugging
    Object.entries(validationErrors).forEach(([field, error]: [string, any]) => {
      if (error?.message) {
        console.error(`  → ${field}: ${error.message}`);
      } else if (error?.root?.message) {
        console.error(`  → ${field} (root): ${error.root.message}`);
      }
    });

    console.log('Current form values:', JSON.stringify(watch(), null, 2));
    console.log('editModeSchema:', editModeSchema);
    console.log('isEditMode:', isEditMode);
  };

  // Final submit
  const handleFinalSubmit = () => {
    console.log('🔘 handleFinalSubmit called - Update Personnel button clicked');
    console.log('Current form errors before submit:', JSON.stringify(errors, null, 2));
    console.log('Form values:', JSON.stringify(watch(), null, 2));
    console.log('isDirty:', isDirty, 'isSubmitting:', isSubmitting);
    handleSubmit(onSubmit, onInvalid)();
  };

  // Navigation
  const handleFinish = () => {
    if (createdPersonnelId) {
      // Always navigate to personnel view page after onboarding
      navigate(`/personnel/${createdPersonnelId}`);
    } else {
      navigate('/personnel');
    }
  };

  const handleGoToList = () => {
    navigate('/personnel');
  };

  // Loading state for edit mode
  const isLoadingEditData = isEditMode && (isLoadingPersonnel || isLoadingAssignments || !isIdReady);

  // Show loading spinner while data is being fetched in edit mode
  if (isLoadingEditData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <ProgressSpinner style={{ width: '50px', height: '50px' }} />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading personnel data...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900">
        {/* Header - Back button beside title */}
        <div className="mb-3 flex items-start gap-3">
          <button
            type="button"
            onClick={() => handleNavigate('/personnel')}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors mt-1"
          >
            <i className="pi pi-arrow-left" style={{ fontSize: '1.25rem' }} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit Personnel' : 'Personnel Onboarding'}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isEditMode ? `Editing: ${personnelData?.name || 'Personnel'}` : 'Create New Personnel Account'}
            </p>
          </div>
        </div>

        {/* Draft Recovery Banner */}
        {showDraftBanner && (
          <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <i className="pi pi-info-circle text-blue-600" />
              <span className="text-blue-800 dark:text-blue-200">
                Unsaved changes found. Restore them?
              </span>
            </div>
            <div className="flex gap-2">
              <Button label="Restore" size="small" onClick={handleRestoreDraft} />
              <Button label="Discard" size="small" severity="secondary" text onClick={handleDiscardDraft} />
            </div>
          </div>
        )}

        {activeStep < 3 ? (
          <>
            {/* Progress Steps - full width, compact height */}
            <div className="w-full mb-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-4 py-1">
                <Steps model={stepItems} activeIndex={activeStep} readOnly className="text-sm [&_.p-steps-item]:py-1 [&_.p-menuitem-link]:gap-1" />
              </div>
            </div>

            {/* Step Content - Sharp border */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6 mb-6">
              {/* Step 1: Basic Info */}
              {activeStep === 0 && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Basic Information
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
                          required
                          error={!!errors.title}
                          helperText={errors.title?.message as string}
                          filter
                        />
                      )}
                    />

                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <FormInput
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => {
                            // Allow alphabets, spaces, periods, apostrophes, and hyphens
                            // Trim multiple spaces and periods to single
                            const filtered = e.target.value
                              .replace(/[^A-Za-z\s.\-']/g, '')
                              .replace(/\s+/g, ' ')
                              .replace(/\.+/g, '.');
                            field.onChange({ ...e, target: { ...e.target, value: filtered } });
                          }}
                          label="Full Name"
                          placeholder="Enter full name"
                          required
                          error={!!errors.name}
                          helperText={errors.name?.message as string}
                        />
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">
                    <Controller
                      name="userId"
                      control={control}
                      render={({ field }) => (
                        <div className="relative">
                          <FormInput
                            {...field}
                            value={field.value || ''}
                            label="User ID"
                            placeholder="Enter User ID"
                            required
                            disabled={isEditMode}
                            error={!!errors.userId}
                            helperText={isEditMode ? 'User ID cannot be changed' : (errors.userId?.message as string)}
                          />
                          {!isEditMode && (
                            <>
                              <i
                                className="pi pi-info-circle text-gray-400 hover:text-blue-500 cursor-pointer absolute"
                                style={{ fontSize: '0.875rem', top: '18px', right: '12px' }}
                                data-pr-tooltip="Enter the 8-digit CMFS ID "
                                data-pr-position="top"
                              />
                              <Tooltip target="[data-pr-tooltip]" />
                            </>
                          )}
                        </div>
                      )}
                    />

                    <Controller
                      name="mobile"
                      control={control}
                      render={({ field }) => (
                        <FormInput
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => {
                            // Allow only digits and limit to 10 characters
                            const filtered = e.target.value.replace(/\D/g, '').slice(0, 10);
                            field.onChange({ ...e, target: { ...e.target, value: filtered } });
                          }}
                          label="Mobile"
                          placeholder="Enter 10-digit mobile number"
                          required
                          maxLength={10}
                          error={!!errors.mobile}
                          helperText={errors.mobile?.message as string}
                        />
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4 items-end">
                    <Controller
                      name="dateOfBirth"
                      control={control}
                      render={({ field }) => (
                        <div className="flex flex-col">
                          <Calendar
                            value={field.value ? new Date(field.value) : null}
                            onChange={(e: any) => {
                              const dateValue = e.value as Date | null;
                              const dateStr = dateValue ? dateValue.toISOString().split('T')[0] : '';
                              field.onChange(dateStr);
                            }}
                            placeholder="Select date of birth"
                            dateFormat="dd/mm/yy"
                            showIcon
                            maxDate={new Date()}
                            className="w-full"
                            data-testid="UserOnboarding.DateOfBirth"
                          />
                          {errors.dateOfBirth && (
                            <span className="text-xs text-red-500 mt-1">{errors.dateOfBirth.message as string}</span>
                          )}
                        </div>
                      )}
                    />

                    <Controller
                      name="email"
                      control={control}
                      render={({ field }) => (
                        <FormInput
                          {...field}
                          value={field.value || ''}
                          label="Email"
                          type="email"
                          placeholder="officer@appolice.gov.in"
                          required
                          error={!!errors.email}
                          helperText={errors.email?.message as string}
                        />
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">
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
                          required
                          error={!!errors.gender}
                          helperText={errors.gender?.message as string}
                          filter
                        />
                      )}
                    />
                  </div>

                  <div className="mt-4">
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
                          onPreview={picturePreviewUrl ? handlePicturePreview : undefined}
                        />
                      )}
                    />
                  </div>

                  {/* Professional Information Section */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-6">
                      Professional Information
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Controller
                        name="departmentId"
                        control={control}
                        render={({ field: { value, onChange, ...fieldProps } }) => (
                          <FormSearchableSelect
                            {...fieldProps}
                            value={value || ''}
                            onChange={(e) => onChange(e.target.value)}
                            label="Department"
                            onSearch={handleDepartmentSearch}
                            initialOptions={departmentOptions}
                            placeholder="Search and select department"
                            required
                            error={!!errors.departmentId}
                            helperText={errors.departmentId?.message as string}
                            debounceDelay={300}
                            loading={departmentsLoading}
                          />
                        )}
                      />

                      <Controller
                        name="rankId"
                        control={control}
                        render={({ field: { value, onChange, ...fieldProps } }) => (
                          <FormSearchableSelect
                            {...fieldProps}
                            value={value || ''}
                            onChange={(e) => onChange(e.target.value)}
                            label="Rank"
                            onSearch={handleRankSearch}
                            initialOptions={rankOptions}
                            placeholder="Search and select rank"
                            required
                            error={!!errors.rankId}
                            helperText={errors.rankId?.message as string}
                            debounceDelay={300}
                            loading={ranksLoading}
                          />
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      <Controller
                        name="batchYear"
                        control={control}
                        render={({ field: { value, onChange, ...field } }) => (
                          <FormSelect
                            {...field}
                            value={value || ''}
                            onChange={(e) => onChange(e.target.value)}
                            label="Batch Year"
                            options={batchYearOptions}
                            placeholder="Select Batch Year"
                            error={!!errors.batchYear}
                            helperText={errors.batchYear?.message as string}
                            filter
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
                            placeholder="Enter badge number"
                            error={!!errors.badgeNo}
                            helperText={errors.badgeNo?.message as string}
                          />
                        )}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Step 2: Post Assignment */}
              {activeStep === 1 && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Post Assignment
                  </h2>

                  {/* Officer Info Banner */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-3">
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      Officer: {formValues.title} {formValues.name}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      Rank: {rankName}
                    </div>
                  </div>

                  {/* Existing Assignments (Edit Mode Only) */}
                  {isEditMode && existingAssignments.length > 0 && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="pi pi-check-circle text-green-600" />
                        <span className="font-semibold text-green-900 dark:text-green-100">
                          Existing Assignments ({existingAssignments.length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {existingAssignments.map((assignment) => (
                          <div
                            key={assignment._id}
                            className={`flex items-center justify-between p-2 rounded ${assignment.isPrimary ? 'bg-green-100 dark:bg-green-800/30' : 'bg-white dark:bg-gray-800'}`}
                          >
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {assignment.unit && typeof assignment.unit === 'object'
                                  ? assignment.unit.name
                                  : 'Unit'}
                              </span>
                              <span className="text-sm text-gray-500 dark:text-gray-400 mx-2">-</span>
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {assignment.post && typeof assignment.post === 'object'
                                  ? `${assignment.post.postName} (${assignment.postCode})`
                                  : assignment.postCode}
                              </span>
                              {(assignment.startDate || assignment.endDate || assignment.assignmentType) && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {assignment.assignmentType && <span>{assignment.assignmentType}</span>}
                                  {assignment.startDate && (
                                    <span>{assignment.assignmentType ? ' | ' : ''}Start: {new Date(assignment.startDate).toLocaleDateString('en-IN')}</span>
                                  )}
                                  {assignment.endDate && (
                                    <span> - End: {new Date(assignment.endDate).toLocaleDateString('en-IN')}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {assignment.isPrimary && (
                                <Tag value="Primary" severity="success" className="text-xs" />
                              )}
                              {assignment.isActive && (
                                <Tag value="Active" severity="info" className="text-xs" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-3">
                        You can add a new assignment below or keep the existing ones.
                      </p>
                    </div>
                  )}

                  {/* New Assignment Section Header (Edit Mode) */}
                  {isEditMode && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                      <h3 className="text-base font-medium text-gray-800 dark:text-white mb-3">
                        Add New Assignment (Optional)
                      </h3>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-end">
                    <Controller
                      name="unitId"
                      control={control}
                      render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormSearchableSelect
                          {...fieldProps}
                          value={value || ''}
                          onChange={(e) => onChange(e.target.value)}
                          label="Select Unit"
                          onSearch={handleUnitSearch}
                          initialOptions={unitOptions}
                          placeholder="Search and select a unit"
                          required={!isEditMode}
                          error={!!errors.unitId}
                          helperText={errors.unitId?.message as string}
                          debounceDelay={300}
                          loading={unitsLoading}
                        />
                      )}
                    />

                    {selectedUnitId && (
                      <Controller
                        name="postCode"
                        control={control}
                        render={({ field: { value, onChange, ...field } }) => (
                          <FormSelect
                            {...field}
                            value={value || ''}
                            onChange={(e) => {
                              onChange(e.target.value);
                              // Also update postName for display
                              const post = embeddedPosts.find(p => p.postCode === e.target.value);
                              if (post) {
                                setValue('postName', post.postName);
                              }
                            }}
                            label="Select Post"
                            options={postOptions}
                            placeholder={postsLoading ? 'Loading posts...' : (embeddedPosts.length === 0 ? 'No posts available' : 'Select a post')}
                            required={!isEditMode}
                            error={!!errors.postCode}
                            helperText={errors.postCode?.message as string || (embeddedPosts.length > 0 ? 'Filled posts are disabled. Select an available post.' : '')}
                            disabled={postsLoading || embeddedPosts.length === 0}
                            loading={postsLoading}
                            filter
                          />
                        )}
                      />
                    )}
                  </div>

                  {/* Assignment Details: Assignment Type, Start Date, End Date */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mt-4">
                    {/* Assignment Type */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Assignment Type <span className="text-red-500">*</span>
                      </label>
                      <Controller
                        name="assignmentType"
                        control={control}
                        render={({ field: { ref: _ref, ...fieldProps } }) => {
                          // Check if user already has a primary assignment
                          const hasPrimaryAssignment =
                            // Check existing assignments (edit mode)
                            existingAssignments.some(a => a.isPrimary === true || a.assignmentType === 'Primary Assignment') ||
                            // Check additional assignments
                            additionalAssignments.some(a => a.assignmentType === 'Primary Assignment');

                          // Filter out Primary Assignment if user already has one
                          const filteredOptions = ASSIGNMENT_TYPE_OPTIONS.filter(opt =>
                            !hasPrimaryAssignment || opt.value !== 'Primary Assignment'
                          );

                          return (
                            <Dropdown
                              {...fieldProps}
                              value={fieldProps.value || ''}
                              options={filteredOptions}
                              onChange={(e: any) => fieldProps.onChange(e.value)}
                              placeholder="Select assignment type"
                              className={`w-full ${errors.assignmentType ? 'p-invalid' : ''}`}
                              style={{ width: '200px' }}
                              data-testid="UserOnboarding.Field.AssignmentType"
                            />
                          );
                        }}
                      />
                      {errors.assignmentType?.message && (
                        <small className="text-red-500 text-xs mt-1">{errors.assignmentType.message as string}</small>
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
                            className={`w-full ${errors.startDate ? 'p-invalid' : ''}`}
                            data-testid="UserOnboarding.Field.StartDate"
                          />
                        )}
                      />
                      {errors.startDate?.message && (
                        <small className="text-red-500 text-xs mt-1">{errors.startDate.message as string}</small>
                      )}
                    </div>

                    {/* End Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End Date {formValues.assignmentType && (formValues.assignmentType === 'Incharge' || formValues.assignmentType === 'Deputation') && <span className="text-red-500">*</span>}
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
                            minDate={formValues.startDate ? new Date(formValues.startDate + 'T00:00:00') : undefined}
                            className={`w-full ${errors.endDate ? 'p-invalid' : ''}`}
                            data-testid="UserOnboarding.Field.EndDate"
                          />
                        )}
                      />
                      {errors.endDate?.message && (
                        <small className="text-red-500 text-xs mt-1">{errors.endDate.message as string}</small>
                      )}
                    </div>
                  </div>

                  {/* Create Post Button - always visible when unit is selected */}
                  {selectedUnitId && !postsLoading && (
                    <div className="mt-3">
                      {(embeddedPosts.length === 0 || postOptions.every(p => p.disabled)) && (
                        <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                          {embeddedPosts.length === 0
                            ? 'No posts available for this unit.'
                            : 'All posts are filled.'}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCreatePostForAssignmentId(null);
                          setShowCreatePostDialog(true);
                        }}
                        className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <i className="pi pi-plus-circle" />
                        Create New Post
                      </button>
                    </div>
                  )}

                  {/* Selected Post Info */}
                  {selectedPost && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <i className="pi pi-briefcase text-blue-600" style={{ fontSize: '1.25rem' }} />
                        <span className="font-semibold text-gray-900 dark:text-white">{selectedPost.postName}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">({selectedPost.postCode})</span>
                        {selectedPost.isUnitHead && (
                          <Tag value="Unit Head" severity="info" className="text-xs" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm px-2 py-1 rounded ${!selectedPost.assignedUser ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {!selectedPost.assignedUser ? 'Available' : 'Filled'}
                        </span>
                        {selectedPost.assignedRoles && selectedPost.assignedRoles.length > 0 && (
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedPost.assignedRoles.length} role(s) assigned
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Role Assignment Status */}
                  {selectedPostCode && (
                    <div className={`rounded-lg p-4 ${selectedPost?.assignedRoles?.length ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
                      {selectedPost?.assignedRoles && selectedPost.assignedRoles.length > 0 ? (
                        <div className="flex items-center gap-3">
                          <i className="pi pi-check-circle text-green-600" style={{ fontSize: '1.25rem' }} />
                          <div>
                            <p className="font-medium text-green-800 dark:text-green-200">
                              Role(s) Assigned
                            </p>
                            <p className="text-sm text-green-700 dark:text-green-300">
                              {selectedPost.assignedRoles.length} role(s) will be inherited by the user
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <i className="pi pi-exclamation-triangle text-amber-600" style={{ fontSize: '1.25rem' }} />
                            <p className="font-medium text-amber-800 dark:text-amber-200">
                              No Roles Assigned
                            </p>
                          </div>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                            This post does not have any roles assigned. Assign a role to grant permissions to users in this post.
                          </p>
                          <button
                            type="button"
                            onClick={handleOpenCreateRoleMappingDialog}
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <i className="pi pi-plus-circle" />
                            Assign Role
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Assignments Section */}
                  {additionalAssignments.length > 0 && (
                    <div className="mt-6 space-y-4">
                      <h3 className="text-base font-medium text-gray-800 dark:text-white">
                        Additional Assignments ({additionalAssignments.length})
                      </h3>
                      {additionalAssignments.map((assignment, index) => (
                        <div
                          key={assignment.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Assignment {index + 2}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAssignment(assignment.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove assignment"
                            >
                              <i className="pi pi-times" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            {/* Unit Selection */}
                            <FormSearchableSelect
                              name={`additional-unit-${assignment.id}`}
                              value={assignment.unitId}
                              onChange={(e) => {
                                const unitId = e.target.value;
                                const selectedOption = unitOptions.find(u => u.value === unitId);
                                handleAdditionalAssignmentUnitChange(assignment.id, unitId, selectedOption?.label || '');
                              }}
                              label="Select Unit"
                              onSearch={handleUnitSearch}
                              initialOptions={unitOptions}
                              placeholder="Search and select a unit"
                              required
                              debounceDelay={300}
                              loading={unitsLoading}
                            />

                            {/* Post Selection */}
                            {assignment.unitId && (
                              <FormSelect
                                name={`additional-post-${assignment.id}`}
                                value={assignment.postCode}
                                onChange={(e) => {
                                  const postCode = e.target.value;
                                  const post = assignment.embeddedPosts.find(p => p.postCode === postCode);
                                  handleAdditionalAssignmentChange(assignment.id, 'postCode', postCode);
                                  handleAdditionalAssignmentChange(assignment.id, 'postName', post?.postName || '');
                                }}
                                label="Select Post"
                                options={assignment.embeddedPosts.map(p => {
                                  const alreadySelected = isPostAlreadySelected(assignment.unitId, p.postCode, assignment.id);
                                  return {
                                    value: p.postCode,
                                    label: `${p.postName} (${p.postCode})${alreadySelected ? ' - Already Selected' : ''}`,
                                    disabled: !!p.assignedUser || alreadySelected,
                                  };
                                })}
                                placeholder={assignment.postsLoading ? 'Loading posts...' : 'Select a post'}
                                required
                                disabled={assignment.postsLoading || assignment.embeddedPosts.length === 0}
                                loading={assignment.postsLoading}
                                filter
                              />
                            )}
                          </div>

                          {/* Create Post Button for additional assignment */}
                          {assignment.unitId && !assignment.postsLoading && (
                            <div className="mt-3">
                              {(assignment.embeddedPosts.length === 0 || assignment.embeddedPosts.every(p => !!p.assignedUser)) && (
                                <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                                  {assignment.embeddedPosts.length === 0
                                    ? 'No posts available for this unit.'
                                    : 'All posts are filled.'}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCreatePostForAssignmentId(assignment.id);
                                  setShowCreatePostDialog(true);
                                }}
                                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                <i className="pi pi-plus-circle" />
                                Create New Post
                              </button>
                            </div>
                          )}

                          {/* Assignment Details */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mt-4">
                            {/* Assignment Type */}
                            <div className="w-full">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Assignment Type <span className="text-red-500">*</span>
                              </label>
                              {(() => {
                                // Check if user already has a primary assignment
                                const hasPrimaryAssignment =
                                  // Check existing assignments (edit mode)
                                  existingAssignments.some(a => a.isPrimary === true || a.assignmentType === 'Primary Assignment') ||
                                  // Check primary form assignment
                                  formValues.assignmentType === 'Primary Assignment' ||
                                  // Check OTHER additional assignments (excluding current)
                                  additionalAssignments.some(a => a.id !== assignment.id && a.assignmentType === 'Primary Assignment');

                                // Filter out Primary Assignment if user already has one
                                const filteredOptions = ASSIGNMENT_TYPE_OPTIONS.filter(opt =>
                                  !hasPrimaryAssignment || opt.value !== 'Primary Assignment'
                                );

                                return (
                                  <Dropdown
                                    value={assignment.assignmentType}
                                    options={filteredOptions}
                                    onChange={(e: any) => handleAdditionalAssignmentChange(assignment.id, 'assignmentType', e.value)}
                                    placeholder="Select assignment type"
                                    className="w-full"
                                    style={{ width: '200px' }}
                                  />
                                );
                              })()}
                            </div>

                            {/* Start Date */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Start Date <span className="text-red-500">*</span>
                              </label>
                              <Calendar
                                value={assignment.startDate ? new Date(assignment.startDate + 'T00:00:00') : null}
                                onChange={(e: any) => {
                                  const date = e.value as Date | null;
                                  if (date) {
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    handleAdditionalAssignmentChange(assignment.id, 'startDate', `${year}-${month}-${day}`);
                                  } else {
                                    handleAdditionalAssignmentChange(assignment.id, 'startDate', '');
                                  }
                                }}
                                placeholder="Select start date"
                                dateFormat="dd/mm/yy"
                                showIcon
                                className="w-full"
                              />
                            </div>

                            {/* End Date */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                End Date {assignment.assignmentType && (assignment.assignmentType === 'Incharge' || assignment.assignmentType === 'Deputation') && <span className="text-red-500">*</span>}
                              </label>
                              <Calendar
                                value={assignment.endDate ? new Date(assignment.endDate + 'T00:00:00') : null}
                                onChange={(e: any) => {
                                  const date = e.value as Date | null;
                                  if (date) {
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    handleAdditionalAssignmentChange(assignment.id, 'endDate', `${year}-${month}-${day}`);
                                  } else {
                                    handleAdditionalAssignmentChange(assignment.id, 'endDate', '');
                                  }
                                }}
                                placeholder="Select end date"
                                dateFormat="dd/mm/yy"
                                showIcon
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Assignment Button */}
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={handleAddAssignment}
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <i className="pi pi-plus-circle" />
                      Add Another Assignment
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Review */}
              {activeStep === 2 && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                    Review & Create
                  </h2>

                  <div className="space-y-4">
                    {/* Personal Information */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                        <i className="pi pi-user text-blue-500" />
                        Personal Information
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-gray-600 dark:text-gray-400">Name:</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formValues.title} {formValues.name}</div>
                        <div className="text-gray-600 dark:text-gray-400">User ID:</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formValues.userId}</div>
                        <div className="text-gray-600 dark:text-gray-400">Email:</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formValues.email}</div>
                        <div className="text-gray-600 dark:text-gray-400">Mobile:</div>
                        <div className="font-medium text-gray-900 dark:text-white">{formValues.mobile}</div>
                        <div className="text-gray-600 dark:text-gray-400">Department:</div>
                        <div className="font-medium text-gray-900 dark:text-white">{departmentName}</div>
                        <div className="text-gray-600 dark:text-gray-400">Rank:</div>
                        <div className="font-medium text-gray-900 dark:text-white">{rankName}</div>
                      </div>
                    </div>

                    {/* Post Assignment */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                        <i className="pi pi-briefcase text-green-500" />
                        Post Assignment
                      </h3>
                      {/* Existing Assignments (Edit Mode) */}
                      {isEditMode && existingAssignments.length > 0 && (
                        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                            Existing Assignments:
                          </p>
                          <div className="space-y-1">
                            {existingAssignments.map((assignment) => (
                              <div key={assignment._id} className="text-sm">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {assignment.unit && typeof assignment.unit === 'object'
                                    ? assignment.unit.name
                                    : 'Unit'}
                                </span>
                                <span className="text-gray-500 mx-1">-</span>
                                <span className="text-gray-700 dark:text-gray-300">
                                  {assignment.post && typeof assignment.post === 'object'
                                    ? assignment.post.postName
                                    : assignment.postCode}
                                </span>
                                {assignment.isPrimary && (
                                  <Tag value="Primary" severity="success" className="text-xs ml-2" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* New Assignment (if selected) */}
                      {selectedUnitId && selectedPostCode && selectedPost ? (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="text-gray-600 dark:text-gray-400">
                            {isEditMode ? 'New Unit:' : 'Unit:'}
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white">{selectedUnitName}</div>
                          <div className="text-gray-600 dark:text-gray-400">
                            {isEditMode ? 'New Post:' : 'Post:'}
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {selectedPost?.postName} ({selectedPost?.postCode})
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">Status:</div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {!selectedPost?.assignedUser ? 'Available' : 'Filled'}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">Start Date:</div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formValues.startDate
                              ? new Date(formValues.startDate + 'T00:00:00').toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '-'}
                          </div>
                          {formValues.endDate && (
                            <>
                              <div className="text-gray-600 dark:text-gray-400">End Date:</div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {new Date(formValues.endDate + 'T00:00:00').toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                            </>
                          )}
                          <div className="text-gray-600 dark:text-gray-400">Assignment Type:</div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {formValues.assignmentType || '-'}
                          </div>
                        </div>
                      ) : isEditMode && existingAssignments.length > 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                          No new assignment selected. Existing assignments will be retained.
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          No post selected
                        </p>
                      )}

                      {/* Additional Assignments in Review */}
                      {additionalAssignments.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                            Additional Assignments ({additionalAssignments.length}):
                          </p>
                          <div className="space-y-3">
                            {additionalAssignments.map((assignment) => (
                              <div
                                key={assignment.id}
                                className="bg-gray-50 dark:bg-gray-700/50 rounded p-3"
                              >
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div className="text-gray-600 dark:text-gray-400">Unit:</div>
                                  <div className="font-medium text-gray-900 dark:text-white">
                                    {assignment.unitName || '-'}
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400">Post:</div>
                                  <div className="font-medium text-gray-900 dark:text-white">
                                    {assignment.postName || '-'} ({assignment.postCode || '-'})
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400">Start Date:</div>
                                  <div className="font-medium text-gray-900 dark:text-white">
                                    {assignment.startDate
                                      ? new Date(assignment.startDate + 'T00:00:00').toLocaleDateString('en-US', {
                                          month: 'long',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })
                                      : '-'}
                                  </div>
                                  {assignment.endDate && (
                                    <>
                                      <div className="text-gray-600 dark:text-gray-400">End Date:</div>
                                      <div className="font-medium text-gray-900 dark:text-white">
                                        {new Date(assignment.endDate + 'T00:00:00').toLocaleDateString('en-US', {
                                          month: 'long',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })}
                                      </div>
                                    </>
                                  )}
                                  <div className="text-gray-600 dark:text-gray-400">Assignment Type:</div>
                                  <div className="font-medium text-gray-900 dark:text-white">
                                    {assignment.assignmentType || '-'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Role & Access */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                        <i className="pi pi-shield text-amber-500" />
                        Role & Access
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div className="text-gray-600 dark:text-gray-400">Assigned Roles:</div>
                        <div className="font-medium text-gray-900 dark:text-white capitalize">
                          {selectedPost?.assignedRoles?.length
                            ? `${selectedPost.assignedRoles.length} role(s)`
                            : 'None'}
                        </div>
                      </div>

                      {/* Role Names Display - assignedRoles from Unit API is populated: Array<{_id, name, shortCode}> */}
                      {selectedPost?.assignedRoles && selectedPost.assignedRoles.length > 0 && (
                        <div className="space-y-2 overflow-hidden">
                          <div className="flex flex-wrap gap-2 max-w-full">
                            {selectedPost.assignedRoles.map((role) => {
                              // Handle both populated objects and string IDs
                              const isPopulated = typeof role === 'object' && role !== null;
                              const roleId = isPopulated ? role._id : role;
                              const roleName = isPopulated ? role.roleName : (systemRoles.find(r => r._id === role)?.roleName || `Role ${String(role).slice(-4)}`);
                              return (
                                <Tag
                                  key={roleId}
                                  value={roleName}
                                  severity="info"
                                  className="text-xs"
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenRolesPermissionsPreview}
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mt-2"
                          >
                            <i className="pi pi-eye" />
                            View Permissions
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Warning Note */}
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      {isEditMode ? (
                        <>
                          <strong>Note:</strong> This will update the user's profile information.
                          {selectedUnitId && selectedPostCode && ' A new assignment will also be created.'}
                        </>
                      ) : (
                        <>
                          <strong>Note:</strong> This action will create a new user account with immediate access.
                          The user will receive login credentials via SMS.
                        </>
                      )}
                    </p>
                  </div>
                </>
              )}

              {/* Navigation Buttons */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                {activeStep > 0 && (
                  <Button
                    type="button"
                    label="Back"
                    icon="pi pi-arrow-left"
                    severity="secondary"
                    outlined
                    onClick={handleBack}
                    disabled={isSubmitting}
                  />
                )}

                <div className="flex-1" />

                {activeStep < 2 ? (
                  <Button
                    type="button"
                    label="Next"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    onClick={handleNext}
                    disabled={hasRequiredFieldsMissing}
                  />
                ) : (
                  <Button
                    type="button"
                    label={isSubmitting
                      ? (isEditMode ? 'Updating...' : 'Creating...')
                      : (isEditMode ? 'Update Personnel' : 'Create User Account')}
                    icon={isSubmitting ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                    onClick={handleFinalSubmit}
                    disabled={isSubmitting || (!isEditMode && !selectedPost?.assignedRoles?.length)}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          /* Success Screen - Compact to fit single page */
          <div className="max-w-xl mx-auto p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-5 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <i className="pi pi-check text-green-600 dark:text-green-400" style={{ fontSize: '1.75rem' }} />
              </div>
              <h2 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">
                {isEditMode ? 'Personnel Updated Successfully!' : 'User Created Successfully!'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {formValues.title} {formValues.name} has been successfully {isEditMode ? 'updated' : 'onboarded to the system'}.
              </p>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-4 text-left">
                <div className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                  <i className="pi pi-check-circle text-sm" />
                  Actions Completed:
                </div>
                <ul className="text-xs text-green-700 dark:text-green-300 space-y-1">
                  <li className="flex items-center gap-2">
                    <i className="pi pi-check text-xs" />
                    Personnel record {isEditMode ? 'updated' : 'created'}
                  </li>
                  {selectedUnitId && selectedPostCode && (
                    <li className="flex items-center gap-2">
                      <i className="pi pi-check text-xs" />
                      {isEditMode ? 'New assignment' : 'Assignment'} created: {formValues.postName || selectedPost?.postName} at {selectedUnitName}
                    </li>
                  )}
                  {selectedPost?.assignedRoles?.length ? (
                    <li className="flex items-center gap-2">
                      <i className="pi pi-check text-xs" />
                      Roles assigned: {selectedPost.assignedRoles.length} role(s)
                    </li>
                  ) : null}
                  {!isEditMode && (
                    <>
                      <li className="flex items-center gap-2">
                        <i className="pi pi-check text-xs" />
                        User account created
                      </li>
                      <li className="flex items-center gap-2">
                        <i className="pi pi-check text-xs" />
                        Login credentials sent via SMS
                      </li>
                    </>
                  )}
                </ul>
              </div>

              <div className="flex gap-2 justify-center">
                <Button
                  type="button"
                  label="View Personnel"
                  icon="pi pi-eye"
                  size="small"
                  onClick={handleFinish}
                />
                <Button
                  type="button"
                  label="Back to Personnel"
                  severity="secondary"
                  outlined
                  size="small"
                  onClick={handleGoToList}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leave Confirmation Dialog */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="UserOnboarding.Dialog.Leave"
      />

      {/* Role Preview Dialog */}
      <Dialog
        visible={showRolePreview}
        onHide={() => setShowRolePreview(false)}
        header={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <i className="pi pi-shield text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize m-0">
                {systemRoleName !== 'N/A' ? systemRoleName : 'Role Details'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
                {permissionsToDisplay.length} Module{permissionsToDisplay.length !== 1 ? 's' : ''} with permissions
              </p>
            </div>
          </div>
        }
        style={{ width: '600px', maxWidth: '90vw' }}
        modal
        dismissableMask
        className="role-preview-dialog"
      >
        {roleMappingLoading ? (
          <div className="flex justify-center items-center py-8">
            <ProgressSpinner style={{ width: '40px', height: '40px' }} />
          </div>
        ) : roleMapping ? (
          <div className="space-y-4">
            {/* Role Info */}
            <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-gray-200 dark:border-gray-700">
              {roleMapping.role?.shortCode && (
                <Tag value={roleMapping.role.shortCode} severity="secondary" />
              )}
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Based on post: {selectedPost?.postName}
              </span>
            </div>

            {/* Permissions Display */}
            {permissionsToDisplay.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm py-4 text-center">
                No permissions assigned to this role.
              </p>
            ) : (
              <Accordion multiple activeIndex={[0]} className="role-permissions-accordion">
                {permissionsToDisplay.map((module: any) => (
                  <AccordionTab
                    key={module.moduleId}
                    header={
                      <div className="flex items-center gap-3">
                        <i className="pi pi-folder text-blue-500" />
                        <span className="font-semibold text-blue-600">{module.moduleName}</span>
                        <Tag value={`${module.jobs?.length || 0} Jobs`} severity="info" className="text-xs" />
                      </div>
                    }
                  >
                    <div className="pl-2 space-y-3">
                      {module.jobs?.map((job: any, jobIndex: number) => (
                        <div
                          key={job.jobName || job.jobId || jobIndex}
                          className={jobIndex < (module.jobs?.length || 0) - 1 ? 'pb-3 border-b border-gray-100 dark:border-gray-700' : ''}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <i className="pi pi-table text-gray-400" style={{ fontSize: '0.75rem' }} />
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{job.jobName || job.displayName}</p>
                            <Tag
                              value={job.isMenu ? 'Menu' : 'Hidden'}
                              severity={job.isMenu ? 'success' : 'secondary'}
                              className="text-xs"
                            />
                          </div>
                          <div className="flex gap-1.5 flex-wrap ml-5">
                            {job.permissions?.map((perm: any) => (
                              <Tag
                                key={perm.name || perm.permissionId}
                                value={perm.name}
                                severity={perm.isSelf ? 'warning' : 'secondary'}
                                className="capitalize text-xs"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionTab>
                ))}
              </Accordion>
            )}

            {/* Additional/Exclusion Permissions Summary */}
            {((roleMapping.additionalPermissions?.length ?? 0) > 0 || (roleMapping.exclusionPermissions?.length ?? 0) > 0) && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-3 flex-wrap">
                  {roleMapping.additionalPermissions && roleMapping.additionalPermissions.length > 0 && (
                    <Tag value={`+${roleMapping.additionalPermissions.reduce(
                      (acc, m) => acc + (m.jobs?.reduce((jAcc, j) => jAcc + (j.permissions?.length || 0), 0) || 0),
                      0
                    )} additional permissions`} severity="success" className="text-xs" />
                  )}
                  {roleMapping.exclusionPermissions && roleMapping.exclusionPermissions.length > 0 && (
                    <Tag value={`-${roleMapping.exclusionPermissions.reduce(
                      (acc, m) => acc + (m.jobs?.reduce((jAcc, j) => jAcc + (j.permissions?.length || 0), 0) || 0),
                      0
                    )} excluded permissions`} severity="warning" className="text-xs" />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <i className="pi pi-exclamation-triangle text-orange-500 mb-3" style={{ fontSize: '2rem' }} />
            <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
              No Role Mapping Found
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This post does not have a role mapping configured.
            </p>
          </div>
        )}
      </Dialog>

      {/* Create Post Dialog - using same PostFormModal as unit form */}
      <PostFormModal
        visible={showCreatePostDialog}
        onHide={() => {
          if (!isSavingPost) {
            setShowCreatePostDialog(false);
            setCreatePostForAssignmentId(null);
          }
        }}
        onSave={handleSavePost}
        existingPostCodes={
          createPostForAssignmentId
            ? (additionalAssignments.find(a => a.id === createPostForAssignmentId)?.embeddedPosts || []).map(p => p.postCode.toUpperCase())
            : embeddedPosts.map(p => p.postCode.toUpperCase())
        }
        isEditing={false}
        isSaving={isSavingPost}
        onFetchUnitPosts={async (unitId: string) => {
          try {
            const unit = await unitsService.getById(unitId);
            return (unit.posts || [])
              .filter(p => !p.isDelete)
              .map(p => ({ postCode: p.postCode, postName: p.postName }));
          } catch {
            return [];
          }
        }}
        hideUserSelector
        hideRankSelector
        unitId={
          createPostForAssignmentId
            ? (additionalAssignments.find(a => a.id === createPostForAssignmentId)?.unitId || '')
            : selectedUnitId
        }
        unitName={
          createPostForAssignmentId
            ? (additionalAssignments.find(a => a.id === createPostForAssignmentId)?.unitName || '')
            : selectedUnitName
        }
        unitShortCode={
          createPostForAssignmentId
            ? (units.find(u => u._id === additionalAssignments.find(a => a.id === createPostForAssignmentId)?.unitId)?.unitCode || '')
            : selectedUnitShortCode
        }
        parentUnitId={selectedUnit?.parentUnitId || ''}
        parentUnitName={units.find(u => u._id === selectedUnit?.parentUnitId)?.name || ''}
      />

      {/* Assign Role Dialog */}
      <Dialog
        visible={showCreateRoleMappingDialog}
        onHide={() => {
          if (!isCreatingRoleMapping) {
            setShowCreateRoleMappingDialog(false);
            setSelectedRoleId(null);
          }
        }}
        header={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <i className="pi pi-shield text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">
                Assign Role to Post
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
                Select a role to assign to this post
              </p>
            </div>
          </div>
        }
        style={{ width: '500px', maxWidth: '95vw' }}
        modal
        dismissableMask={!isCreatingRoleMapping}
        closable={!isCreatingRoleMapping}
        className="assign-role-dialog"
      >
        <div className="space-y-4 pt-2">
          {/* Post Info (Read-only) */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Post
            </label>
            <div className="flex items-center gap-2">
              <i className="pi pi-briefcase text-blue-500" />
              <span className="font-medium text-gray-900 dark:text-white">
                {selectedPost?.postName || 'N/A'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Unit: {selectedUnitName}
            </p>
          </div>

          {/* System Role Dropdown (Single Selection) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              System Role <span className="text-red-500">*</span>
            </label>
            <Dropdown
              value={selectedRoleId}
              onChange={(e: { value: string | null }) => setSelectedRoleId(e.value)}
              options={roleOptions}
              optionLabel="label"
              optionValue="value"
              placeholder={rolesLoading ? 'Loading system roles...' : 'Select a system role'}
              filter
              filterPlaceholder="Search system roles..."
              className="w-full"
              disabled={rolesLoading || isCreatingRoleMapping}
              appendTo={document.body}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select a system role to assign to this post
            </p>
          </div>

          {/* Info Note */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex gap-2">
              <i className="pi pi-info-circle text-blue-500 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Users assigned to this post will inherit the permissions defined in the selected role.
                You can customize additional or exclusion permissions later from the assignments.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => {
                setShowCreateRoleMappingDialog(false);
                setSelectedRoleId(null);
              }}
              disabled={isCreatingRoleMapping}
            />
            <Button
              type="button"
              label={isCreatingRoleMapping ? 'Assigning...' : 'Assign Role'}
              icon={isCreatingRoleMapping ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              onClick={handleCreateRoleMapping}
              disabled={!selectedRoleId || isCreatingRoleMapping}
            />
          </div>
        </div>
      </Dialog>

      {/* Roles Permissions Preview Dialog */}
      <Dialog
        visible={showRolesPermissionsPreview}
        onHide={() => setShowRolesPermissionsPreview(false)}
        header={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <i className="pi pi-shield text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white m-0">
                Role Permissions Preview
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
                {selectedPost?.assignedRoles?.length || 0} role(s) assigned to this post
              </p>
            </div>
          </div>
        }
        style={{ width: '700px', maxWidth: '95vw' }}
        modal
        dismissableMask
        className="roles-permissions-preview-dialog"
      >
        <div className="space-y-4">
          {detailedRolesLoading ? (
            <div className="flex justify-center items-center py-8">
              <ProgressSpinner style={{ width: '40px', height: '40px' }} />
            </div>
          ) : !selectedPost?.assignedRoles || selectedPost.assignedRoles.length === 0 ? (
            <div className="text-center py-8">
              <i className="pi pi-exclamation-triangle text-orange-500 mb-3" style={{ fontSize: '2rem' }} />
              <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                No Roles Assigned
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This post does not have any roles assigned.
              </p>
            </div>
          ) : detailedSystemRoles.length === 0 ? (
            <div className="text-center py-8">
              <i className="pi pi-exclamation-circle text-gray-400 mb-3" style={{ fontSize: '2rem' }} />
              <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                Role Details Not Found
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Could not load permission details for the assigned roles.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {detailedSystemRoles.map((role) => {
                // Parse the structure from API
                // Structure: roleBinding[] -> roleData.jobs[] (jobs directly on roleData)
                const useCaseRoles = role.roleBinding?.map((binding) => ({
                  moduleId: binding.moduleId,
                  moduleName: binding.moduleName,
                  roleId: binding.roleId,
                  roleName: binding.roleName,
                  roleShortCode: binding.roleData?.roleShortCode,
                  roleDescription: binding.roleData?.description,
                  // Jobs are directly on roleData, not nested in permissions
                  jobs: binding.roleData?.jobs?.map((job: any) => ({
                    jobName: job.jobName,
                    displayName: job.displayName || job.jobName,
                    route: job.route,
                    isMenu: job.isMenu,
                    displayOrder: job.displayOrder,
                    permissions: job.permissions?.map((p: any) => ({
                      name: typeof p === 'string' ? p : p.name,
                      isSelf: typeof p === 'object' ? p.isSelf : false,
                    })) || [],
                  })) || [],
                })) || [];

                // Count total jobs across all role bindings
                const totalJobs = useCaseRoles.reduce((acc, ucr) => acc + ucr.jobs.length, 0);

                // Helper to get icon and color for permission action
                const getPermissionStyle = (permName: string) => {
                  const name = permName.toUpperCase();
                  if (name === 'CREATE') {
                    return { icon: 'pi-plus', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', border: 'border-green-200 dark:border-green-800' };
                  }
                  if (name === 'READ') {
                    return { icon: 'pi-eye', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' };
                  }
                  if (name === 'UPDATE') {
                    return { icon: 'pi-pencil', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' };
                  }
                  if (name === 'DELETE') {
                    return { icon: 'pi-trash', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', border: 'border-red-200 dark:border-red-800' };
                  }
                  return { icon: 'pi-cog', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', border: 'border-gray-200 dark:border-gray-600' };
                };

                return (
                  <div
                    key={role._id}
                    className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm"
                  >
                    {/* System Role Header Card */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                          <i className="pi pi-shield text-blue-600 dark:text-blue-400" style={{ fontSize: '1.25rem' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white m-0">
                              {role.roleName}
                            </h4>
                            {role.roleShortCode && (
                              <Tag value={role.roleShortCode} severity="info" className="text-xs" />
                            )}
                          </div>
                          {role.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
                              {role.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <i className="pi pi-users" style={{ fontSize: '0.75rem' }} />
                              {useCaseRoles.length} UseCase Role(s)
                            </span>
                            <span className="flex items-center gap-1">
                              <i className="pi pi-briefcase" style={{ fontSize: '0.75rem' }} />
                              {totalJobs} Job(s)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Permissions Content - UseCase Role → Jobs → Permissions */}
                    <div className="p-4">
                      {useCaseRoles.length === 0 ? (
                        <div className="text-center py-4">
                          <i className="pi pi-info-circle text-gray-400 mb-2" style={{ fontSize: '1.5rem' }} />
                          <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
                            No permissions defined for this role.
                          </p>
                        </div>
                      ) : (
                        <Accordion multiple activeIndex={[0]}>
                          {useCaseRoles.map((ucRole, ucIdx) => (
                            <AccordionTab
                              key={ucRole.roleId || ucIdx}
                              header={
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                                    <i className="pi pi-user text-indigo-600 dark:text-indigo-400" style={{ fontSize: '0.875rem' }} />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {ucRole.roleName}
                                      </span>
                                      {ucRole.roleShortCode && (
                                        <Tag value={ucRole.roleShortCode} severity="secondary" className="text-xs" />
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                      <span className="flex items-center gap-1">
                                        <i className="pi pi-folder" style={{ fontSize: '0.65rem' }} />
                                        {ucRole.moduleName}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <i className="pi pi-briefcase" style={{ fontSize: '0.65rem' }} />
                                        {ucRole.jobs.length} Job(s)
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              }
                            >
                              {/* Jobs Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                                {ucRole.jobs.map((job: any, jobIdx: number) => (
                                  <div
                                    key={job.jobName || jobIdx}
                                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700/30"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <i className="pi pi-briefcase text-blue-500" style={{ fontSize: '0.8rem' }} />
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                                          {job.displayName}
                                        </span>
                                      </div>
                                      {job.isMenu && (
                                        <Tag value="Menu" severity="success" className="text-xs" />
                                      )}
                                    </div>
                                    {job.route && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        <i className="pi pi-link mr-1" style={{ fontSize: '0.6rem' }} />
                                        /{job.route}
                                      </p>
                                    )}
                                    <div className="flex gap-1.5 flex-wrap">
                                      {job.permissions.map((perm: any, permIdx: number) => {
                                        const style = getPermissionStyle(perm.name);
                                        return (
                                          <span
                                            key={permIdx}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${style.color} ${style.border}`}
                                          >
                                            <i className={`pi ${style.icon}`} style={{ fontSize: '0.6rem' }} />
                                            {perm.name}
                                            {perm.isSelf && (
                                              <span className="text-amber-600 dark:text-amber-400 ml-0.5">(Self)</span>
                                            )}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {ucRole.jobs.length === 0 && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                                  No jobs defined for this role.
                                </p>
                              )}
                            </AccordionTab>
                          ))}
                        </Accordion>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary Footer */}
          {detailedSystemRoles.length > 0 && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="flex gap-2">
                  <i className="pi pi-info-circle text-blue-500 mt-0.5" />
                  <div className="text-xs text-blue-700 dark:text-blue-300">
                    <p className="font-medium mb-1">Access Summary:</p>
                    <p>
                      The user will inherit permissions from{' '}
                      <strong>{detailedSystemRoles.length}</strong> system role(s) with{' '}
                      <strong>
                        {detailedSystemRoles.reduce((acc, role) => acc + (role.roleBinding?.length || 0), 0)}
                      </strong> usecase role(s) and{' '}
                      <strong>
                        {detailedSystemRoles.reduce((acc, role) => {
                          // Count jobs from roleBinding[].roleData.jobs[]
                          return acc + (role.roleBinding?.reduce((bindingAcc, binding) => {
                            return bindingAcc + (binding.roleData?.jobs?.length || 0);
                          }, 0) || 0);
                        }, 0)}
                      </strong> job(s).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Picture Preview Dialog */}
      <Dialog
        visible={showPicturePreview}
        onHide={() => setShowPicturePreview(false)}
        header="Profile Picture Preview"
        style={{ width: '500px', maxWidth: '95vw' }}
        modal
        dismissableMask
      >
        <div className="flex justify-center items-center p-4">
          {picturePreviewUrl ? (
            <img
              src={picturePreviewUrl}
              alt="Profile Preview"
              className="max-w-full max-h-[400px] rounded-lg shadow-lg object-contain"
            />
          ) : (
            <div className="text-center py-8">
              <i className="pi pi-image text-gray-400 mb-3" style={{ fontSize: '3rem' }} />
              <p className="text-gray-500 dark:text-gray-400">No picture available</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
};

export default UserOnboarding;
