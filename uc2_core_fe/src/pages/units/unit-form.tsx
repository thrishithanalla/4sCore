import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { z } from 'zod';

import { Dialog } from 'mainFe/Dialog';
import { Toast } from 'mainFe/Toast';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { Checkbox } from 'mainFe/Checkbox';
import { InputSwitch } from 'mainFe/InputSwitch';
import { Calendar } from 'mainFe/Calendar';
import { TextArea } from 'mainFe/TextArea';
import { Button } from 'mainFe/Button';
import { ProgressBar } from 'mainFe/ProgressBar';
import { uploadFile, downloadFile, getDownloadUrl } from 'mainFe/fileUploadService';
import ImagePreviewOverlay from 'mainFe/ImagePreviewOverlay';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import FormInput from '../../components/forms/form-input';
import FormSelect from '../../components/forms/form-select';
import FormFileUpload from '../../components/forms/form-file-upload';
import FormSearchableSelect from '../../components/forms/form-searchable-select';
// Commented out - unitPersonnelList form field removed
// import FormSearchableMultiSelect from '../../components/forms/form-searchable-multi-select';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { PostsManager } from '../../components/posts';
import type { PostsManagerRef } from '../../components/posts';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import { unitsService } from '../../services/units.service';
import { masterService } from '../../services/master.service';
import { fetchSystemRolesForDropdown } from '../../services/system-roles.service';
import { assignmentService, type AssignmentCreateRequest } from '../../services/assignment.service';
import type { RootState } from '../../utils/main-fe-auth';
import type { SystemRole } from '../../types/system-role.types';
import { extractErrorMessage } from '../../utils/error-handler';
import { useDebounce } from '../../hooks/useDebounce';
import type { EmbeddedPostForCreate } from '../../types';

/**
 * Validation Schema - Zod
 */
const unitSchema = z.object({
  policeReferenceId: z
    .string()
    .min(1, 'Reference ID is required')
    .max(50, 'Reference ID must not exceed 50 characters')
    .trim(),

  name: z
    .string()
    .min(2, 'Unit name must be at least 2 characters')
    .max(120, 'Unit name must not exceed 120 characters')
    .trim(),

  unitCode: z
    .string()
    .max(100, 'Unit code must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s&-]*$/, 'Unit code must contain only letters, numbers, spaces, & and -')
    .optional()
    .or(z.literal('')),

  departmentId: z
    .string()
    .min(1, 'Department is required'),

  unitTypeId: z
    .string()
    .min(1, 'Unit type is required'),

  parentUnitId: z
    .string()
    .min(1, 'Parent Unit is required'),

  shortCode: z
    .string()
    .min(1, 'Short Code is required')
    .max(50, 'Short code must not exceed 50 characters')
    .regex(/^[a-zA-Z0-9\s&-]*$/, 'Short code must contain only letters, numbers, spaces, & and -'),

  scope: z
    .string()
    .max(200, 'Scope must not exceed 200 characters')
    .trim()
    .optional()
    .or(z.literal('')),

  logo: z
    .any()
    .optional()
    .nullable(),

  address1: z
    .string()
    .max(200, 'Address line 1 must not exceed 200 characters')
    .trim()
    .optional()
    .nullable(),

  address2: z
    .string()
    .max(200, 'Address line 2 must not exceed 200 characters')
    .trim()
    .optional()
    .nullable(),

  city: z
    .string()
    .max(100, 'City must not exceed 100 characters')
    .trim()
    .optional()
    .nullable(),

  districtId: z
    .string()
    .min(1, 'District is required'),

  zip: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || /^[0-9]{6}$/.test(val),
      { message: 'ZIP code must be 6 digits' }
    )
    .or(z.literal('')),

  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .max(120, 'Email must not exceed 120 characters')
    .trim(),

  phone: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true;
        // Split by comma and validate each phone number
        const phones = val.split(',').map(p => p.trim()).filter(Boolean);
        // Each phone should be 10 digits only (Indian phone number format)
        return phones.every(phone => /^[0-9]{10}$/.test(phone));
      },
      { message: 'Each phone number must be exactly 10 digits (comma-separated for multiple)' }
    )
    .or(z.literal('')),

  responsiblePostCode: z
    .string()
    .optional()
    .nullable(),

  // This now stores designation ID (for dropdown), name will be derived on submit
  responsiblePersonTitle: z
    .string()
    .optional()
    .or(z.literal('')),

  // Note: posts are managed separately via PostsManager component, not in this schema

  proxyUserId: z
    .string()
    .optional()
    .nullable(),

  unitPersonnelList: z
    .preprocess(
      (val) => {
        if (Array.isArray(val)) {
          return val.filter(v => v !== null && v !== undefined && v !== '');
        }
        return [];
      },
      z.array(z.string()).optional().default([])
    ),

  isVirtual: z
    .boolean()
    .default(false),
});

type UnitFormData = z.infer<typeof unitSchema>;

/**
 * UnitForm Component - Production Grade
 */
const UnitForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'units',
    basePath: '/units',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const postsManagerRef = useRef<PostsManagerRef>(null);
  const canCreate = useCanCreate(JOB_NAMES.UNITS);
  const canUpdate = useCanUpdate(JOB_NAMES.UNITS);
  const hasPermission = isEditMode ? canUpdate : canCreate;

  // Get pre-selected values from URL query params (when coming from Units list "Add Child Unit")
  const [searchParams] = useSearchParams();
  const preSelectedParentUnitId = searchParams.get('parentUnitId') || '';
  const preSelectedParentUnitName = searchParams.get('parentUnitName') || '';
  const preSelectedDepartmentId = searchParams.get('departmentId') || '';
  const preSelectedDistrictId = searchParams.get('districtId') || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageOverlayRef = useRef<any>(null); // Ref for ImagePreviewOverlay
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null); // State for preview URL

  // Logo metadata state - stores file ID, filename and direct URL
  const [logoMeta, setLogoMeta] = useState<{ id: string; filename: string; url: string } | null>(null);

  // Cleanup preview URL on unmount or change (only for blob URLs)
  useEffect(() => {
    return () => {
      if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);


  // Get current user ID from Redux store
  const currentUser = useSelector((state: RootState) => state.auth.user);

  const DRAFT_KEY = `unit-form-draft-${id || 'create'}`;

  // State
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draftData, setDraftData] = useState<any>(null);

  // History dialog state
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyData, setHistoryData] = useState<{
    fromDate: Date | null;
    toDate: Date | null;
    reason: string;
  }>({
    fromDate: new Date(),
    toDate: null,
    reason: '',
  });

  // Posts state - embedded posts managed separately from react-hook-form
  const [posts, setPosts] = useState<EmbeddedPostForCreate[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);

  // File Upload State
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);


  // Track original responsible post ID
  const originalResponsiblePostId = useRef<string>('');

  // Form setup
  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<UnitFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(unitSchema) as any,
    defaultValues: {
      policeReferenceId: '',
      name: '',
      unitCode: '',
      shortCode: '',
      scope: '',
      departmentId: preSelectedDepartmentId,
      unitTypeId: '',
      parentUnitId: preSelectedParentUnitId,
      logo: null,
      address1: '',
      address2: '',
      city: '',
      districtId: preSelectedDistrictId,
      zip: '',
      email: '',
      phone: '',
      responsiblePostCode: '',
      responsiblePersonTitle: '',
      proxyUserId: '',
      unitPersonnelList: [],
      isVirtual: false,
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  const formValues = watch();
  const currentResponsiblePostCode = watch('responsiblePostCode');

  // Watch unitTypeId for unit code suggestion and parent unit filtering
  const selectedUnitTypeId = watch('unitTypeId');
  // Watch districtId for unit short code auto-populate
  const selectedDistrictId = watch('districtId');
  // Watch shortCode for unit short code auto-populate (with 2 second delay)
  const shortCodeValue = watch('shortCode');
  const debouncedShortCode = useDebounce(shortCodeValue || '', 2000);

  // Fetch dropdown data
  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: masterService.getDepartments,
  });

  // Watch departmentId for unit code generation
  const selectedDepartmentId = watch('departmentId');

  // Fetch all unit types (independent of department)
  const { data: unitTypes = [], isLoading: unitTypesLoading } = useQuery({
    queryKey: ['unitTypes'],
    queryFn: masterService.getUnitTypes,
  });

  const { data: districts = [], isLoading: districtsLoading } = useQuery({
    queryKey: ['districts'],
    queryFn: masterService.getDistricts,
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['units', 'with-unitType'],
    queryFn: masterService.getUnitsWithUnitType,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'dropdown'],
    queryFn: masterService.getUsersForDropdown,
  });

  // Fetch system roles for PostsManager role display
  const { data: systemRoles = [] } = useQuery<SystemRole[]>({
    queryKey: ['system-roles', 'dropdown'],
    queryFn: fetchSystemRolesForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  // Create role names map for PostsManager display (using system roles)
  const roleNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    systemRoles.forEach((role) => map.set(role._id, role.roleName));
    return map;
  }, [systemRoles]);

  // Create user names map for PostsManager display
  const userNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => {
      const displayName = user.name || `${user.firstName} ${user.lastName}`;
      map.set(user._id, displayName);
    });
    return map;
  }, [users]);

  // Fetch unit data for edit mode - wait for ID decryption
  const { data: unitData, isLoading: unitLoading } = useQuery({
    queryKey: ['unit', id],
    queryFn: () => unitsService.getById(id!),
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show unit name instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? unitData?.name : null);

  // Populate form in edit mode
  useEffect(() => {
    if (unitData && isEditMode) {
      reset({
        policeReferenceId: unitData.policeReferenceId || '',
        name: unitData.name || '',
        unitCode: unitData.unitCode || '',
        // Extract shortCode from unitCode if not explicitly set (last part after last dash)
        shortCode: (unitData as any).shortCode || (unitData.unitCode?.includes('-')
          ? unitData.unitCode.split('-').pop() || ''
          : ''),
        scope: (unitData as any).scope || '',
        departmentId: unitData.departmentId || '',
        unitTypeId: unitData.unitTypeId || '',
        parentUnitId: unitData.parentUnitId || '',
        logo: unitData.logo || null,
        address1: unitData.address1 || '',
        address2: unitData.address2 || '',
        city: unitData.city || '',
        districtId: unitData.districtId || '',
        zip: unitData.zip || '',
        email: unitData.email || '',
        phone: unitData.phone?.join(', ') || '',
        responsiblePostCode: unitData.responsiblePostCode || '',
        responsiblePersonTitle: '',
        proxyUserId: unitData.proxyUserId || '',
        unitPersonnelList: unitData.unitPersonnelList || [],
        isVirtual: unitData.isVirtual === true,
      });

      // Populate embedded posts
      if (unitData.posts && Array.isArray(unitData.posts)) {
        // Convert populated posts to EmbeddedPostForCreate format
        const postsForForm: EmbeddedPostForCreate[] = unitData.posts
          .filter((p) => !p.isDelete) // Only include non-deleted posts
          .map((p) => ({
            postCode: p.postCode,
            postName: p.postName,
            isUnitHead: p.isUnitHead || false,
            reportsToPost: p.reportsToPost ? {
              unitId: p.reportsToPost.unitId || null,
              postName: p.reportsToPost.postName || null,
            } : null,
            // Extract role IDs from populated role objects
            assignedRoles: (p.assignedRoles || []).map((r) =>
              typeof r === 'string' ? r : r._id
            ),
            // Extract rank IDs from populated rank objects (allowedRanks)
            allowedRanks: (p.allowedRanks || []).map((r) =>
              typeof r === 'string' ? r : r._id
            ),
            // Extract user ID from populated user object
            assignedUser: p.assignedUser
              ? (typeof p.assignedUser === 'string' ? p.assignedUser : p.assignedUser._id)
              : null,
            description: p.description || undefined,
          }));

        // Merge assignment fields from current posts state (preserve local assignment data)
        // This is needed because assignment fields (assignmentType, startDate, endDate) are not
        // stored in posts, they're only in local state until the assignment is created
        setPosts((currentPosts) => {
          console.log('[UnitForm] Merging posts - current posts count:', currentPosts.length, 'API posts count:', postsForForm.length);

          // Create a map of current posts' assignment data by postCode
          const assignmentDataMap = new Map<string, { assignmentType?: string; startDate?: string; endDate?: string }>();
          currentPosts.forEach((post) => {
            if (post.assignmentType || post.startDate || post.endDate) {
              assignmentDataMap.set(post.postCode.toUpperCase(), {
                assignmentType: post.assignmentType,
                startDate: post.startDate,
                endDate: post.endDate,
              });
              console.log('[UnitForm] Preserving assignment data for post:', post.postCode, {
                assignmentType: post.assignmentType,
                startDate: post.startDate,
              });
            }
          });

          // Also check for new posts in current state that aren't in API response yet
          const apiPostCodes = new Set(postsForForm.map((p) => p.postCode.toUpperCase()));
          const newLocalPosts = currentPosts.filter(
            (p) => !apiPostCodes.has(p.postCode.toUpperCase())
          );

          if (newLocalPosts.length > 0) {
            console.log('[UnitForm] Found new local posts not in API:', newLocalPosts.map(p => p.postCode));
          }

          // Merge assignment data back into API posts
          const mergedPosts = postsForForm.map((post) => {
            const existingAssignmentData = assignmentDataMap.get(post.postCode.toUpperCase());
            if (existingAssignmentData) {
              console.log('[UnitForm] Merging assignment data back into post:', post.postCode);
              return {
                ...post,
                assignmentType: existingAssignmentData.assignmentType,
                startDate: existingAssignmentData.startDate,
                endDate: existingAssignmentData.endDate,
              };
            }
            return post;
          });

          // Append any new local posts that weren't in the API response
          return [...mergedPosts, ...newLocalPosts];
        });
      }

      // Store original responsible post code
      originalResponsiblePostId.current = unitData.responsiblePostCode || '';

      // Fetch logo metadata if logo exists
      if (unitData.logo) {
        const logoId = unitData.logo;
        const downloadApiUrl = getDownloadUrl(logoId);
        const token = localStorage.getItem('accessToken');

        // Call the download API to get the signed URL with filename
        fetch(downloadApiUrl, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((response) => response.json())
          .then((data) => {
            if (data?.success && data?.data?.url) {
              const signedUrl = data.data.url;
              // Extract filename from the signed URL
              // URL format: https://...blob.core.windows.net/...?...&rscd=attachment%3B%20filename%3D"actual-filename.png"
              let filename = logoId;
              try {
                // Try to extract filename from rscd parameter
                const urlObj = new URL(signedUrl);
                const rscd = urlObj.searchParams.get('rscd');
                if (rscd) {
                  // rscd format: attachment; filename="actual-filename.png" or attachment%3B%20filename%3D"actual-filename.png"
                  const decodedRscd = decodeURIComponent(rscd);
                  const filenameMatch = decodedRscd.match(/filename[=*]?"?([^";\s]+)"?/i);
                  if (filenameMatch && filenameMatch[1]) {
                    filename = decodeURIComponent(filenameMatch[1]);
                  }
                }
              } catch (e) {
                console.error('Failed to extract filename from URL:', e);
              }

              setLogoMeta({
                id: logoId,
                filename,
                url: signedUrl,
              });
            } else {
              // API call succeeded but no URL in response
              setLogoMeta({
                id: logoId,
                filename: logoId,
                url: downloadApiUrl,
              });
            }
          })
          .catch((err) => {
            console.error('Failed to fetch logo metadata:', err);
            // Fallback: use the ID as filename
            setLogoMeta({
              id: logoId,
              filename: logoId,
              url: downloadApiUrl,
            });
          });
      } else {
        setLogoMeta(null);
      }
    }
  }, [unitData, isEditMode, reset]);

  // Transform options (memoized for performance)
  const departmentOptions = useMemo(
    () => departments.map(d => ({ value: d._id, label: d.name })),
    [departments]
  );

  const unitTypeOptions = useMemo(
    () => unitTypes.map(t => ({ value: t._id, label: t.name })),
    [unitTypes]
  );

  const districtOptions = useMemo(
    () => districts.map(d => ({ value: d._id, label: d.name })),
    [districts]
  );

  // Get selected unitType's level for filtering parent units
  const selectedUnitTypeLevel = useMemo(() => {
    if (!selectedUnitTypeId) return null;
    // Check both _id and id since API may return either format
    const unitType = unitTypes.find(t => t._id === selectedUnitTypeId || t.id === selectedUnitTypeId);
    return unitType?.level ?? null;
  }, [selectedUnitTypeId, unitTypes]);

  // Filter parent units based on unitType level (show units with level <= selected level)
  // Uses populated unitType from API response directly
  const parentUnitOptions = useMemo(() => {
    let filteredUnits = units.filter(u => u.id !== id && u._id !== id);

    // If unitType is selected, filter by level using the populated unitType from API
    if (selectedUnitTypeLevel !== null) {
      filteredUnits = filteredUnits.filter(u => {
        // If unit has no unitType, exclude it (only show units with proper hierarchy)
        if (!u.unitType) return false;
        // Include units with level <= selected level (same or higher in hierarchy)
        return u.unitType.level <= selectedUnitTypeLevel;
      });
    }

    return filteredUnits.map(u => {
      // Use populated unitType from API for display
      const levelInfo = u.unitType ? ` (${u.unitType.name})` : '';
      return { value: u.id || u._id, label: `${u.name}${levelInfo}` };
    });
  }, [units, id, selectedUnitTypeLevel]);

  // Generate unit code suggestion based on department shortCode, unit type shortCode, district shortCode, and user-entered shortCode
  // Format: DepartmentShortCode-UnitTypeShortCode-DistrictShortCode-UserShortCode (e.g., "POL-DPO-ANMY-001")
  const unitCodeSuggestion = useMemo(() => {
    const parts: string[] = [];

    // Add department shortCode
    if (selectedDepartmentId) {
      const department = departments.find(d => d._id === selectedDepartmentId);
      if (department?.shortCode) {
        parts.push(department.shortCode);
      }
    }

    // Add unit type shortCode
    if (selectedUnitTypeId) {
      const unitType = unitTypes.find(t => t._id === selectedUnitTypeId || t.id === selectedUnitTypeId);
      if (unitType?.shortCode) {
        parts.push(unitType.shortCode);
      }
    }

    // Add district shortCode
    if (selectedDistrictId) {
      const district = districts.find(d => d._id === selectedDistrictId);
      if (district?.shortCode) {
        parts.push(district.shortCode);
      }
    }

    // Add user-entered shortCode (debounced by 2 seconds)
    if (debouncedShortCode?.trim()) {
      parts.push(debouncedShortCode.trim());
    }

    return parts.join('-');
  }, [selectedDepartmentId, selectedUnitTypeId, selectedDistrictId, departments, unitTypes, districts, debouncedShortCode]);

  // Auto-fill unit code when suggestion changes (field is read-only, always sync with suggestion)
  // Updates in both create and edit mode when dependencies change
  useEffect(() => {
    setValue('unitCode', unitCodeSuggestion);
  }, [unitCodeSuggestion, setValue]);

  const userOptions = useMemo(
    () => users.map(u => {
      const displayName = u.name || `${u.firstName} ${u.lastName}`;
      return {
        value: u._id,
        label: `${displayName} (${u.userId})`,
      };
    }),
    [users]
  );

  // Responsible post options from embedded posts
  const responsiblePostOptions = useMemo(
    () => posts.map((p) => ({
      value: p.postCode,
      label: `${p.postName} (${p.postCode})`
    })),
    [posts]
  );

  // Fetch posts for a specific unit (for cross-unit reporting)
  const handleFetchUnitPosts = async (targetUnitId: string): Promise<{ postCode: string; postName: string }[]> => {
    try {
      const unitData = await unitsService.getById(targetUnitId);
      if (unitData?.posts) {
        return unitData.posts
          .filter((p) => !p.isDelete)
          .map((p) => ({
            postCode: p.postCode,
            postName: p.postName,
          }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching unit posts:', error);
      return [];
    }
  };

  // Search handler for personnel
  const handlePersonnelSearch = async (searchTerm: string) => {
    try {
      const results = await masterService.searchPersonnel(searchTerm);
      return results.map(u => {
        const displayName = u.name || `${u.firstName} ${u.lastName}`;
        return {
          value: u._id,
          label: `${displayName} (${u.userId})`,
        };
      });
    } catch (error) {
      console.error('Error searching personnel:', error);
      return [];
    }
  };

  // Get post title from responsible post code
  const getResponsiblePostTitle = (postCode: string) => {
    const post = posts.find((p) => p.postCode === postCode);
    return post?.postName || postCode || '';
  };

  // Create/Update mutation
  const mutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: any) => {
      if (isEditMode && id) {
        return unitsService.update(id, data);
      }
      return unitsService.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      localStorage.removeItem(DRAFT_KEY);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      console.error('Error response:', error.response);

      // Use standardized error message extraction
      const errorMessage = extractErrorMessage(
        error,
        `Failed to ${isEditMode ? 'update' : 'create'} unit`
      );

      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Autosave draft
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
    }, 1500);

    return () => clearTimeout(timer);
  }, [formValues, isDirty, DRAFT_KEY]);

  // Load draft on mount
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

  // Check if responsible post has changed
  const hasResponsiblePostChanged = () => {
    return isEditMode &&
           originalResponsiblePostId.current &&
           currentResponsiblePostCode &&
           originalResponsiblePostId.current !== currentResponsiblePostCode;
  };

  // Handle history dialog close
  const handleHistoryDialogClose = () => {
    setShowHistoryDialog(false);
    setHistoryData({
      fromDate: new Date(),
      toDate: null,
      reason: '',
    });
  };

  // Handle form validation errors
  const onFormError = (errors: Record<string, unknown>) => {
    console.log('Form validation errors:', errors);
    const errorMessages = Object.entries(errors)
      .map(([field, error]) => `${field}: ${(error as { message?: string })?.message || 'Invalid'}`)
      .join(', ');

    toast.current?.show({
      severity: 'error',
      summary: 'Validation Error',
      detail: errorMessages || 'Please fill in all required fields',
      life: 10000,
    });
  };

  // Combined loading state for button disable
  const isSaving = mutation.isPending;

  // Form submission
  const onSubmit = async (data: UnitFormData) => {
    console.log('Form submitted with data:', data);
    // Validate user is logged in for create mode
    if (!isEditMode && !currentUser?._id) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'User not authenticated. Please log in again.',
        life: 10000,
      });
      return;
    }

    // Validate posts - at least one post required for create
    if (!isEditMode && posts.length === 0) {
      setPostsError('At least one post is required');
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'At least one post is required to create a unit',
        life: 10000,
      });
      return;
    }
    setPostsError(null);

    // Validate responsiblePostCode if provided - must exist in posts
    if (data.responsiblePostCode) {
      const postExists = posts.some((p) => p.postCode === data.responsiblePostCode);
      if (!postExists) {
        toast.current?.show({
          severity: 'error',
          summary: 'Validation Error',
          detail: 'Responsible post must exist in the posts list',
          life: 10000,
        });
        return;
      }
    }

    // Validate only one unit head
    const unitHeadCount = posts.filter((p) => p.isUnitHead).length;
    if (unitHeadCount > 1) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Only one post can be marked as Unit Head',
        life: 10000,
      });
      return;
    }

    // Check if responsible post has changed - show history dialog
    const changed = hasResponsiblePostChanged();

    if (changed) {
      setShowHistoryDialog(true);
      return;
    }

    // Proceed with submission
    await submitForm(data, null);
  };

  /**
   * Handle File Upload
   */
  const handleFileUpload = async (file: File, districtId: string): Promise<string> => {
    try {
      setUploadProgress(0);
      const fileId = await uploadFile(
        file,
        {
          district: districtId,
          uploadedBy: currentUser?._id || 'unknown',
          module: 'CORE',
        },
        (progress: number) => {
          setUploadProgress(progress);
        }
      );
      setUploadProgress(null);
      return fileId;
    } catch (error) {
      setUploadProgress(null);
      throw error;
    }
  };

  // Submit form with optional history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submitForm = async (data: UnitFormData, history: any) => {
    try {
      let logoId = data.logo;

      // Check if logo is a File object and needs uploading
      if (data.logo instanceof File) {
        try {
          logoId = await handleFileUpload(data.logo, data.districtId);
        } catch (error) {
          console.error('File upload failed:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Upload Error',
            detail: 'Failed to upload unit logo. Please try again.',
            life: 10000,
          });
          return; // Stop submission
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        ...data,
        phone: data.phone ? data.phone.split(',').map(p => p.trim()).filter(Boolean) : [],
        parentUnitId: data.parentUnitId || null,
        responsiblePostCode: data.responsiblePostCode || null,
        proxyUserId: data.proxyUserId || null,
        logo: logoId, // Use the ID (either existing string or new upload ID)
        // Filter out any empty values from unitPersonnelList
        unitPersonnelList: (data.unitPersonnelList || []).filter(id => id && id.trim() !== ''),
        // Remove designation fields - no longer used
        responsiblePersonTitle: null,
        // Unit code - only include if provided
        unitCode: data.unitCode || undefined,
        // Short code - only include if provided
        shortCode: data.shortCode || undefined,
        // Scope - only include if provided
        scope: data.scope || undefined,
        // Embedded posts - include for both create and update
        posts: posts,
      };

      // Remove responsiblePostId if it exists (old field)
      delete payload.responsiblePostId;

      // Note: createdBy/updatedBy are handled by backend from JWT token

      // Add history if responsible post changed
      if (history) {
        payload.responsiblePostHistory = [history]; // API expects an array
      }

      const savedUnit = await mutation.mutateAsync(payload);

      // After unit creation/update, create assignments for posts with assigned users
      // Use the unit ID from response (create mode) or from URL (edit mode)
      const unitId = savedUnit?._id || id;

      console.log('[UnitForm] Unit saved, checking for assignments to create...');
      console.log('[UnitForm] Unit ID:', unitId);
      console.log('[UnitForm] Total posts:', posts.length);
      console.log('[UnitForm] Posts with assignment data:', posts.map(p => ({
        postCode: p.postCode,
        assignedUser: p.assignedUser,
        assignmentType: p.assignmentType,
        startDate: p.startDate,
        hasAllFields: Boolean(p.assignedUser && p.assignmentType && p.startDate)
      })));

      if (unitId) {
        // Filter posts that have complete assignment data (user enabled "Assign Personnel?" and filled all fields)
        const postsWithAssignedUsers = posts.filter(
          (p) => p.assignedUser && p.assignmentType && p.startDate
        );

        console.log('[UnitForm] Posts matching filter (have assignedUser + assignmentType + startDate):', postsWithAssignedUsers.length);

        if (postsWithAssignedUsers.length > 0) {
          console.log('[UnitForm] Creating assignments for posts:', postsWithAssignedUsers.map(p => p.postCode));

          // Create assignments in parallel
          const assignmentPromises = postsWithAssignedUsers.map(async (post) => {
            try {
              const assignmentPayload: AssignmentCreateRequest = {
                userId: post.assignedUser!,
                unitId: unitId,
                postCode: post.postCode,
                assignmentType: post.assignmentType,
                isActive: true,
                startDate: post.startDate,
                endDate: post.endDate,
              };

              await assignmentService.create(assignmentPayload);
              console.log(`[UnitForm] Assignment created for post: ${post.postCode}`);
            } catch (assignmentError) {
              console.error(`[UnitForm] Failed to create assignment for post ${post.postCode}:`, assignmentError);
              // Continue with other assignments even if one fails
            }
          });

          await Promise.allSettled(assignmentPromises);
        }
      }

      // Show success toast
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Unit ${isEditMode ? 'updated' : 'created'} successfully`,
        life: 3000,
      });

      // Navigate after a short delay
      setTimeout(() => {
        navigateToList();
      }, 1000);
    } catch (error) {
      // Error is already handled by mutation's onError callback
      // But if it was a pre-submission error (like file upload), we catch it here?
      // Actually upload error handles itself above.
      console.error('Submission error:', error);
    }
  };

  // Handle history dialog submit
  const handleHistorySubmit = async () => {
    // Validate history data
    if (!historyData.toDate) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Please provide the "To" date',
        life: 10000,
      });
      return;
    }

    if (!historyData.reason.trim()) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Please provide a reason for the change',
        life: 10000,
      });
      return;
    }

    // Get the current responsible post title
    const title = getResponsiblePostTitle(currentResponsiblePostCode || '');

    // Build history object
    const history = {
      postCode: originalResponsiblePostId.current,
      from: historyData.fromDate?.toISOString() || new Date().toISOString(),
      to: historyData.toDate?.toISOString() || new Date().toISOString(),
      title: title,
      reason: historyData.reason.trim(),
      changedBy: currentUser?._id,
      changedAt: new Date().toISOString(),
    };

    // Close dialog
    handleHistoryDialogClose();

    // Submit form with history
    const formData = watch();
    await submitForm(formData, history);
  };

  // Handle cancel
  const handleCancel = () => {
    handleNavigate('/units');
  };

  // Dialog footer for history confirmation
  const historyDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={handleHistoryDialogClose} />
      <Button label="Confirm & Save" onClick={handleHistorySubmit} />
    </div>
  );

  // Initial loading state - only for first load, not for dependent dropdown refetches
  // We check if essential data is still loading on first render
  const isInitialLoading = unitLoading ||
    (departmentsLoading && departments.length === 0) ||
    (districtsLoading && districts.length === 0) ||
    (unitsLoading && units.length === 0);

  // Show full page loading only on initial load (when no data exists yet)
  if (isInitialLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <LoadingSpinner size="50px" />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.UNITS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900">
        {/* Header - Compact */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            >
              <i className="pi pi-arrow-left text-lg" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isEditMode ? 'Edit Unit' : 'Create New Unit'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditMode
                  ? 'Update unit information'
                  : preSelectedParentUnitName
                    ? `Creating child unit under: ${decodeURIComponent(preSelectedParentUnitName)}`
                    : 'Fill in the details below'}
              </p>
            </div>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadProgress !== null && (
          <div className="mb-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
             <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
               Uploading Logo... {uploadProgress}%
             </div>
             <ProgressBar value={uploadProgress} showValue={false} style={{ height: '6px' }} />
          </div>
        )}

        {/* Existing Logo Preview */}
        {/* Image Overlay Component - Hidden by default, toggled via ref */}
        <ImagePreviewOverlay 
            ref={imageOverlayRef} 
            imageUrl={previewImageUrl} 
        />

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

        {/* Form */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form id="unit-form" onSubmit={handleSubmit(onSubmit as any, onFormError)} noValidate>
          {/* Main Form Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">

            {/* Section: Basic Information */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Basic Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

                 <Controller
                  name="departmentId"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="Department"
                      options={departmentOptions}
                      placeholder="Select department"
                      required
                      filter
                      showClear
                      filterPlaceholder="Search department..."
                      error={!!errors.departmentId}
                      helperText={errors.departmentId?.message}
                      loading={departmentsLoading}
                    />
                  )}
                />
                {/* Row 1: Unit Type, Department, District */}
                <Controller
                  name="unitTypeId"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="Unit Type"
                      options={unitTypeOptions}
                      placeholder="Select unit type"
                      required
                      filter
                      showClear
                      filterPlaceholder="Search unit types..."
                      error={!!errors.unitTypeId}
                      helperText={errors.unitTypeId?.message}
                      loading={unitTypesLoading}
                    />
                  )}
                />

               

                <Controller
                  name="districtId"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value)}
                      label="District"
                      options={districtOptions}
                      placeholder="Select district"
                      required
                      filter
                      showClear
                      filterPlaceholder="Search districts..."
                      error={!!errors.districtId}
                      helperText={errors.districtId?.message as string}
                      loading={districtsLoading}
                    />
                  )}
                />

                {/* Row 2: Unit Name, Unit Code, Parent Unit */}
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      label="Unit Name"
                      placeholder="Enter unit name"
                      required
                      error={!!errors.name}
                      helperText={errors.name?.message}
                    />
                  )}
                />
             <Controller
                  name="shortCode"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Short Code"
                      placeholder="Enter short code"
                      error={!!errors.shortCode}
                      helperText={errors.shortCode?.message}
                      required
                    />
                  )}
                />
                <Controller
                  name="scope"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Scope"
                      placeholder="Enter scope"
                      error={!!errors.scope}
                      helperText={errors.scope?.message}
                    />
                  )}
                />
                <Controller
                  name="unitCode"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Unit Short Code"
                      placeholder="Auto-generated"
                      disabled
                      error={!!errors.unitCode}
                      helperText={errors.unitCode?.message || 'Auto-filled: Dept-UnitType-District-ShortCode'}
                    />
                  )}
                />

                <Controller
                  name="parentUnitId"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormSelect
                      {...field}
                      value={value || ''}
                      onChange={(e) => onChange(e.target.value || null)}
                      label="Parent Unit"
                      options={parentUnitOptions}
                      placeholder={selectedUnitTypeId ? 'Select parent unit' : 'Select unit type first'}
                      required
                      filter
                      showClear
                      filterPlaceholder="Search units..."
                      error={!!errors.parentUnitId}
                      helperText={
                        errors.parentUnitId?.message as string ||
                        (selectedUnitTypeLevel !== null ? `Showing units at level ${selectedUnitTypeLevel} or higher` : '')
                      }
                      loading={unitsLoading}
                    />
                  )}
                />

                {/* Row 3: Reference ID, Email */}
                <Controller
                  name="policeReferenceId"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Reference ID"
                      placeholder="Enter reference ID"
                      required
                      disabled={isEditMode}
                      error={!!errors.policeReferenceId}
                      helperText={errors.policeReferenceId?.message}
                    />
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
                      placeholder="Enter email address"
                      required
                      error={!!errors.email}
                      helperText={errors.email?.message}
                    />
                  )}
                />

                {/* Virtual Unit toggle switch */}
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Virtual Unit
                  </label>
                  <Controller
                    name="isVirtual"
                    control={control}
                    render={({ field: { value, onChange } }) => (
                      <div className="flex items-center gap-2 pt-1">
                        <span className={`text-xs ${!value ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>No</span>
                        <InputSwitch
                          checked={value || false}
                          onChange={(e: { value: boolean }) => onChange(e.value)}
                          style={{ transform: 'scale(0.75)' }}
                        />
                        <span className={`text-xs ${value ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Yes</span>
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Section: Address & Contact */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Address & Contact
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <Controller
                  name="address1"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Address Line 1"
                      error={!!errors.address1}
                      helperText={errors.address1?.message}
                    />
                  )}
                />

                <Controller
                  name="address2"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Address Line 2"
                      error={!!errors.address2}
                      helperText={errors.address2?.message}
                    />
                  )}
                />

                <Controller
                  name="city"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="City"
                      error={!!errors.city}
                      helperText={errors.city?.message}
                    />
                  )}
                />

                <Controller
                  name="zip"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="ZIP Code"
                      placeholder="123456"
                      error={!!errors.zip}
                      helperText={errors.zip?.message}
                    />
                  )}
                />

                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      {...field}
                      value={field.value || ''}
                      label="Phone Numbers"
                      placeholder="Comma separated"
                      error={!!errors.phone}
                      helperText={errors.phone?.message as string}
                    />
                  )}
                />
              </div>
            </div>

            {/* Section: Embedded Posts */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Posts {!isEditMode && <span className="text-red-500">*</span>}
                </h2>
                {/* Responsible Post Selection and Add Post button - inline */}
                <div className="flex items-end gap-3">
                  {/* {posts.length > 0 && (
                    <Controller
                      name="responsiblePostCode"
                      control={control}
                      render={({ field: { value, onChange, ...field } }) => (
                        <FormSelect
                          {...field}
                          value={value || ''}
                          onChange={(e) => onChange(e.target.value || null)}
                          label=""
                          options={responsiblePostOptions}
                          placeholder="Select Responsible Post"
                          showClear
                          error={!!errors.responsiblePostCode}
                          style={{ width: '220px' }}
                        />
                      )}
                    />
                  )} */}
                  <Button
                    type="button"
                    label="Add Post"
                    icon="pi pi-plus"
                    size="small"
                    onClick={() => postsManagerRef.current?.triggerAdd()}
                    style={{ whiteSpace: 'nowrap', minWidth: 'fit-content' }}
                  />
                </div>
              </div>
              {postsError && (
                <p className="text-red-500 text-sm mb-2">{postsError}</p>
              )}
              <PostsManager
                ref={postsManagerRef}
                posts={posts}
                onChange={(newPosts) => {
                  setPosts(newPosts);
                  setPostsError(null);
                }}
                roleNamesMap={roleNamesMap}
                userNamesMap={userNamesMap}
                showHeader={false}
                hideAddButton
                unitId={id || undefined}
                onUnitRefresh={() => {
                  // Invalidate the unit query to refresh posts from server
                  queryClient.invalidateQueries({ queryKey: ['unit', id] });
                }}
                onFetchUnitPosts={handleFetchUnitPosts}
                unitName={formValues.name || ''}
                unitShortCode={formValues.unitCode || ''}
                parentUnitId={formValues.parentUnitId || ''}
                parentUnitName={parentUnitOptions.find(u => u.value === formValues.parentUnitId)?.label || ''}
              />
            </div>

            {/* Section: Additional Details */}
            <div className="p-4">
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Additional Details
              </h2>
              <div className="flex flex-wrap items-center justify-between gap-6">
                <Controller
                  name="logo"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <FormFileUpload
                      name="logo"
                      label="Unit Logo"
                      value={value}
                      onChange={(file) => {
                        onChange(file);
                        // Clear logo metadata when file changes
                        if (file) {
                          setLogoMeta(null);
                        }
                      }}
                      accept="image/*"
                      displayName={logoMeta?.filename}
                      onPreview={
                        !uploadProgress && typeof value === 'string' && value && logoMeta?.url
                          ? (e) => {
                              const target = e.currentTarget;
                              // Use pre-built URL directly - no API call needed
                              setPreviewImageUrl(logoMeta.url);
                              imageOverlayRef.current?.show(e, target);
                            }
                          : undefined
                      }
                    />
                  )}
                />
                {/* Action buttons */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    label="Cancel"
                    severity="secondary"
                    outlined
                    onClick={handleCancel}
                    disabled={isSaving}
                  />
                  <Button
                    type="button"
                    label={isSaving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
                    icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
                    disabled={isSaving}
                    onClick={() => {
                      console.log('Submit button clicked');
                      handleSubmit(onSubmit as any, onFormError)();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* History Dialog */}
        <Dialog
          visible={showHistoryDialog}
          onHide={handleHistoryDialogClose}
          header={
            <div className="flex items-center gap-2">
              <i className="pi pi-history" style={{ fontSize: '1.25rem' }} />
              <span>Responsible User Change History</span>
            </div>
          }
          footer={historyDialogFooter}
          style={{ width: '500px' }}
        >
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            You are changing the responsible user. Please provide the transition details for record keeping.
          </p>

          <div className="flex flex-col gap-3">
            <Calendar
              value={historyData.fromDate}
              onChange={(e: { value: Date | null }) => setHistoryData({ ...historyData, fromDate: e.value })}
              label="From Date"
              dateFormat="dd/mm/yy"
              className="w-full"
            />

            <Calendar
              value={historyData.toDate}
              onChange={(e: { value: Date | null }) => setHistoryData({ ...historyData, toDate: e.value })}
              label="To Date"
              required
              dateFormat="dd/mm/yy"
              className="w-full"
            />

            <TextArea
              value={historyData.reason}
              onChange={(value: string) => setHistoryData({ ...historyData, reason: value })}
              rows={3}
              label="Reason for Change"
              required
              placeholder="Enter the reason for changing the responsible user..."
              style={{ width: '100%' }}
            />
          </div>
        </Dialog>

        {/* Leave Confirmation Dialog */}
        <DiscardChangesDialog
          visible={showLeaveDialog}
          onStay={cancelLeave}
          onLeave={confirmLeave}
          testId="UnitForm.Dialog.Leave"
        />
      </div>
    </PermissionGuard>
  );
};

export default UnitForm;
