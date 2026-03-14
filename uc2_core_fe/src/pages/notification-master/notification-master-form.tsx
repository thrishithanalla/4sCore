/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useFieldArray, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useNavigationBlocker } from '../../hooks/useNavigationBlocker';

import { Toast } from 'mainFe/Toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { InputSwitch } from 'primereact/inputswitch';
import { Dropdown } from 'primereact/dropdown';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';

import FormInput from '../../components/forms/form-input';
import DiscardChangesDialog from '../../components/dialogs/discard-changes-dialog';
import FormMultiSelect from '../../components/forms/form-multi-select';
import FormSelect from '../../components/forms/form-select';

import { notificationsService } from '../../services/notifications-master.service';
import { notificationValueSetsService, type ValueSetItem } from '../../services/notification-value-sets.service';
import { getModulesForDropdown } from '../../services/feedback-master.service';
import type { NotificationMaster, NotificationChannel, NotificationPriority } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type DropdownOption = { value: string; label: string };

/** Convert ValueSetItem[] to dropdown options */
const toDropdownOptions = (items: ValueSetItem[]): DropdownOption[] =>
  items.map((item) => ({ value: item.code, label: item.name }));

// Channel labels (fallback if API doesn't return)
const defaultChannelLabels: Record<string, string> = {
  inApp: 'In-App',
  webPush: 'Web Push',
  push: 'Mobile Push (FCM)',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

// -----------------------------------------------------------------------------
// Zod Schema
// -----------------------------------------------------------------------------

// Template schema - fields are optional in Zod, custom validation in validateTemplates()
const notificationTemplateSchema = z.object({
  title: z.string().optional().default(''),
  body: z.string().optional().default(''),
});

const notificationParameterSchema = z.object({
  name: z.string().min(1, 'Parameter name is required'),
  type: z.string().default('string'),
  required: z.boolean().default(true),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  description: z.string().optional(),
});

const notificationActionSchema = z.object({
  actionId: z.string().min(1, 'Action ID is required').trim(),
  label: z.string().min(1, 'Label is required').trim(),
  actionType: z.enum(['button', 'link', 'deeplink', 'api', 'navigate', 'dismiss', 'custom']).default('link'),
  url: z.string().nullable().optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).nullable().optional(),
  payload: z.any().nullable().optional(),
  style: z.enum(['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'text']).default('primary'),
  icon: z.string().nullable().optional(),
  requiresMemo: z.boolean().default(false),
  confirmMessage: z.string().nullable().optional(),
});

// Channel-specific template schemas
const emailTemplateSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
  htmlBody: z.string().optional(),
});

const pushTemplateSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
});

const smsTemplateSchema = z.object({
  body: z.string().optional(),
});

const whatsappComponentSchema = z.object({
  type: z.enum(['header', 'body', 'button']),
  parameters: z.array(z.string()).default([]),
});

const whatsappTemplateSchema = z.object({
  templateName: z.string().optional(),
  templateLanguage: z.string().default('en'),
  components: z.array(whatsappComponentSchema).optional(),
});

const inAppTemplateSchema = z.object({
  title: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

// Channel-specific config schemas
// Priority uses preprocess to handle null, undefined, empty string, and invalid values from API
const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const prioritySchema = z.preprocess(
  (val) => {
    // Convert empty, null, undefined to undefined
    if (val === '' || val === null || val === undefined) return undefined;
    // If it's a valid priority string, pass it through
    if (typeof val === 'string' && validPriorities.includes(val)) return val;
    // Any other value (numbers, objects, invalid strings) -> undefined
    return undefined;
  },
  z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional()
);

const inAppChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: prioritySchema,
  template: inAppTemplateSchema.nullable().optional(),
});

const emailChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: prioritySchema,
  template: emailTemplateSchema.nullable().optional(),
});

const pushChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: prioritySchema,
  template: pushTemplateSchema.nullable().optional(),
});

const smsChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: prioritySchema,
  template: smsTemplateSchema.nullable().optional(),
});

const whatsappChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  priority: prioritySchema,
  template: whatsappTemplateSchema.nullable().optional(),
});

const throttleSchema = z.object({
  enabled: z.boolean().nullable().optional().default(false),
  maxPerHour: z.number().nullable().optional(),
  maxPerDay: z.number().nullable().optional(),
});

const settingsSchema = z.object({
  allowUserOptOut: z.boolean().nullable().optional(),
  retryOnFailure: z.boolean().nullable().optional(),
  maxRetries: z.number().nullable().optional(),
  retryDelayMinutes: z.number().nullable().optional(),
  expiresAfterMinutes: z.number().nullable().optional(),
  throttle: throttleSchema.nullable().optional(),
});

const batchTemplateSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
});

const notificationSchema = z.object({
  moduleId: z.string().min(1, 'Module is required'),
  notificationType: z
    .string()
    .min(1, 'Notification Type is required')
    .max(120, 'Must be ≤ 120 characters')
    .trim()
    .refine((val) => /^[A-Z0-9_]+$/.test(val), {
      message: 'Use UPPER_SNAKE_CASE format (e.g., ORDER_CONFIRMED, ALERT_123)',
    }),
  name: z.string().min(1, 'Name is required').max(200, 'Must be ≤ 200 characters').trim(),
  description: z.string().optional().default(''),
  category: z.string().optional(),
  defaultChannels: z.array(z.string()).min(1, 'Select at least one channel'),
  channels: z.object({
    inApp: inAppChannelConfigSchema.nullable().optional(),
    webPush: pushChannelConfigSchema.nullable().optional(),
    push: pushChannelConfigSchema.nullable().optional(),
    email: emailChannelConfigSchema.nullable().optional(),
    sms: smsChannelConfigSchema.nullable().optional(),
    whatsapp: whatsappChannelConfigSchema.nullable().optional(),
  }).nullable().optional(),
  notificationTemplate: notificationTemplateSchema.optional(),
  notificationParameters: z.array(notificationParameterSchema).optional().default([]),
  priority: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 'NORMAL';
      if (typeof val === 'string' && validPriorities.includes(val)) return val;
      return 'NORMAL';
    },
    z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  ),
  notificationActions: z.array(notificationActionSchema).optional().default([]),
  settings: settingsSchema.optional(),
  canBeBatched: z.boolean().optional(),
  batchWindowMinutes: z.number().nullable().optional(),
  batchTemplate: batchTemplateSchema.nullable().optional(),
  active: z.boolean().default(true),
});

export type NotificationFormData = z.infer<typeof notificationSchema>;

// Fallback options if API fails
const fallbackPriorityOptions: DropdownOption[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const fallbackCategoryOptions: DropdownOption[] = [
  { value: 'TRANSACTIONAL', label: 'Transactional' },
  { value: 'PROMOTIONAL', label: 'Promotional' },
  { value: 'SYSTEM', label: 'System' },
  { value: 'ALERT', label: 'Alert' },
];

const fallbackParameterTypeOptions: DropdownOption[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'object', label: 'Object' },
  { value: 'array', label: 'Array' },
];

const fallbackChannelOptions: DropdownOption[] = [
  { value: 'inApp', label: 'In-App' },
  { value: 'webPush', label: 'Web Push' },
  { value: 'push', label: 'Mobile Push (FCM)' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const actionTypeOptions: DropdownOption[] = [
  { value: 'link', label: 'Link' },
  { value: 'button', label: 'Button' },
  { value: 'deeplink', label: 'Deep Link' },
  { value: 'api', label: 'API Call' },
  { value: 'navigate', label: 'Navigate (Legacy)' },
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'custom', label: 'Custom' },
];

const actionStyleOptions: DropdownOption[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'success', label: 'Success' },
  { value: 'danger', label: 'Danger' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'text', label: 'Text' },
];

const httpMethodOptions: DropdownOption[] = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
];

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

const NotificationMasterForm = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToList } = useSecureNavigation({
    entity: 'notificationMaster',
    basePath: '/notification-master',
  });
  const isEditMode = Boolean(id);
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);

  const [showTemplateSection, setShowTemplateSection] = useState(false);
  const [showChannelsConfig, setShowChannelsConfig] = useState(false);
  const [showSettingsSection, setShowSettingsSection] = useState(false);
  const [showBatchingSection, setShowBatchingSection] = useState(false);

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: getModulesForDropdown,
    staleTime: 5 * 60 * 1000,
  });

  const moduleOptions = modules.map((m) => ({
    label: m.name,
    value: m._id,
  }));

  // Fetch value sets from API
  const { data: categoryOptions = fallbackCategoryOptions } = useQuery({
    queryKey: ['notification-valueset', 'category'],
    queryFn: async () => {
      const items = await notificationValueSetsService.getCategories();
      return items.length > 0 ? toDropdownOptions(items) : fallbackCategoryOptions;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: parameterTypeOptions = fallbackParameterTypeOptions } = useQuery({
    queryKey: ['notification-valueset', 'parameterType'],
    queryFn: async () => {
      const items = await notificationValueSetsService.getParameterTypes();
      return items.length > 0 ? toDropdownOptions(items) : fallbackParameterTypeOptions;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: priorityOptions = fallbackPriorityOptions } = useQuery({
    queryKey: ['notification-valueset', 'priority'],
    queryFn: async () => {
      const items = await notificationValueSetsService.getPriorities();
      return items.length > 0 ? toDropdownOptions(items) : fallbackPriorityOptions;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: channelOptions = fallbackChannelOptions } = useQuery({
    queryKey: ['notification-valueset', 'channel'],
    queryFn: async () => {
      const items = await notificationValueSetsService.getChannels();
      return items.length > 0 ? toDropdownOptions(items) : fallbackChannelOptions;
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema) as Resolver<NotificationFormData>,
    defaultValues: {
      moduleId: '',
      notificationType: '',
      name: '',
      description: '',
      category: undefined,
      defaultChannels: ['inApp'],
      channels: {},
      notificationTemplate: undefined,
      notificationParameters: [],
      priority: 'NORMAL',
      notificationActions: [],
      settings: {
        allowUserOptOut: true,
        retryOnFailure: true,
        maxRetries: 3,
        retryDelayMinutes: 5,
        expiresAfterMinutes: 1440,
        throttle: {
          enabled: false,
          maxPerHour: undefined,
          maxPerDay: undefined,
        },
      },
      canBeBatched: false,
      batchWindowMinutes: null,
      batchTemplate: null,
      active: true,
    },
    mode: 'onChange',
  });

  const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });

  // Watch selected channels to show per-channel config
  const selectedChannels = watch('defaultChannels') || [];
  const watchedChannels = watch('channels');

  // Auto-enable channels when they are added to default_channels
  useEffect(() => {
    if (showChannelsConfig && selectedChannels.length > 0) {
      const currentChannels = getValues('channels') || {};
      let hasChanges = false;

      selectedChannels.forEach((channel: string) => {
        const channelKey = channel as NotificationChannel;
        // If channel doesn't exist or is not enabled, enable it
        if (!currentChannels[channelKey]?.enabled) {
          setValue(`channels.${channelKey}.enabled`, true, { shouldDirty: true });
          hasChanges = true;
        }
      });
    }
  }, [selectedChannels, showChannelsConfig, setValue, getValues]);

  // Compute if any channel has per-channel config enabled
  const isAnyChannelEnabled = showChannelsConfig && watchedChannels &&
    Object.values(watchedChannels).some((ch: any) => ch?.enabled);

  // Field arrays for parameters and actions
  const {
    fields: parameterFields,
    append: appendParameter,
    remove: removeParameter,
  } = useFieldArray({
    control,
    name: 'notificationParameters',
  });

  const {
    fields: actionFields,
    append: appendAction,
    remove: removeAction,
  } = useFieldArray({
    control,
    name: 'notificationActions',
  });

  // Fetch existing entity when editing - wait for ID decryption
  const { data: existing, isLoading: fetchLoading } = useQuery<NotificationMaster>({
    queryKey: ['notifications', 'masters', id],
    queryFn: async () => (await notificationsService.getById(id!)) as unknown as NotificationMaster,
    enabled: isEditMode && isReady && !!id,
  });

  // Set breadcrumb title to show notification type instead of UUID in edit mode
  useBreadcrumbTitle(isEditMode ? existing?.notificationType : null);

  useEffect(() => {
    if (existing && isEditMode) {
      const channels = existing.defaultChannels || ['inApp'];
      const hasTemplate = existing.notificationTemplate?.title || existing.notificationTemplate?.body;
      const hasChannelsConfig = existing.channels && Object.keys(existing.channels).length > 0;
      const hasSettings = existing.settings && Object.keys(existing.settings).length > 0;
      const hasBatching = existing.canBeBatched;

      setShowTemplateSection(!!hasTemplate);
      setShowChannelsConfig(!!hasChannelsConfig);
      setShowSettingsSection(!!hasSettings);
      setShowBatchingSection(!!hasBatching);

      reset({
        moduleId: existing.moduleId || '',
        notificationType: existing.notificationType || '',
        name: existing.name || '',
        description: existing.description ?? '',
        category: existing.category as any,
        defaultChannels: channels as string[],
        channels: existing.channels || {},
        notificationTemplate: existing.notificationTemplate || undefined,
        notificationParameters: (existing.notificationParameters || []).map((p: any) => ({
          name: p.name,
          type: p.type || 'string',
          required: p.required ?? true,
          default: p.default,
          description: p.description,
        })),
        priority: (existing.priority ?? 'NORMAL') as NotificationPriority,
        notificationActions: (existing.notificationActions || []).map((a: any) => ({
          actionId: a.actionId,
          label: a.label,
          actionType: a.actionType || 'navigate',
          url: a.url || null,
          method: a.method || null,
          payload: a.payload || null,
          style: a.style || 'primary',
          icon: a.icon || null,
          requiresMemo: a.requiresMemo ?? false,
          confirmMessage: a.confirmMessage || null,
        })),
        settings: existing.settings || {
          allowUserOptOut: true,
          retryOnFailure: true,
          maxRetries: 3,
          retryDelayMinutes: 5,
          expiresAfterMinutes: 1440,
          throttle: { enabled: false },
        },
        canBeBatched: existing.canBeBatched ?? false,
        batchWindowMinutes: existing.batchWindowMinutes ?? null,
        batchTemplate: existing.batchTemplate || null,
        active: existing.active ?? true,
      });
    }
  }, [existing, isEditMode, reset]);

  // Mutations
  const createMut = useMutation({
    mutationFn: (payload: any) => notificationsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'masters'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Notification Master created successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, 'Failed to save Notification Master');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: any) => notificationsService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'masters'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'masters', id] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Notification Master updated successfully', life: 3000 });
      setTimeout(() => navigateToList(), 800);
    },
    onError: (error: any) => {
      const errorMessage = extractErrorMessage(error, 'Failed to save Notification Master');
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 10000,
      });
    },
  });

  // Combined loading state for button disable
  const isSaving = createMut.isPending || updateMut.isPending;

  // Submit
  // State for template validation errors
  const [templateErrors, setTemplateErrors] = useState<Record<string, string>>({});

  // Validate templates based on configuration mode
  const validateTemplates = (data: NotificationFormData): Record<string, string> => {
    const errors: Record<string, string> = {};
    const selectedDefaultChannels = data.defaultChannels || [];

    if (showChannelsConfig && selectedDefaultChannels.length > 0) {
      // Per-Channel Configuration is ON
      // Validate template fields for ALL selected channels in default_channels
      const channels = data.channels as any;

      // Email: subject + body required when email is in default_channels
      if (selectedDefaultChannels.includes('email')) {
        if (!channels?.email?.template?.subject?.trim()) {
          errors['email.subject'] = 'Email subject is required';
        }
        if (!channels?.email?.template?.body?.trim()) {
          errors['email.body'] = 'Email body is required';
        }
      }

      // SMS: body required when sms is in default_channels
      if (selectedDefaultChannels.includes('sms')) {
        if (!channels?.sms?.template?.body?.trim()) {
          errors['sms.body'] = 'SMS body is required';
        }
      }

      // WhatsApp: templateName required when whatsapp is in default_channels
      if (selectedDefaultChannels.includes('whatsapp')) {
        if (!channels?.whatsapp?.template?.templateName?.trim()) {
          errors['whatsapp.templateName'] = 'WhatsApp template name is required';
        }
      }

      // Push: title + body required when push is in default_channels
      if (selectedDefaultChannels.includes('push')) {
        if (!channels?.push?.template?.title?.trim()) {
          errors['push.title'] = 'Push notification title is required';
        }
        if (!channels?.push?.template?.body?.trim()) {
          errors['push.body'] = 'Push notification body is required';
        }
      }

      // WebPush: title + body required when webPush is in default_channels
      if (selectedDefaultChannels.includes('webPush')) {
        if (!channels?.webPush?.template?.title?.trim()) {
          errors['webPush.title'] = 'Web push title is required';
        }
        if (!channels?.webPush?.template?.body?.trim()) {
          errors['webPush.body'] = 'Web push body is required';
        }
      }

      // InApp: title + body required when inApp is in default_channels
      if (selectedDefaultChannels.includes('inApp')) {
        if (!channels?.inApp?.template?.title?.trim()) {
          errors['inApp.title'] = 'In-app notification title is required';
        }
        if (!channels?.inApp?.template?.body?.trim()) {
          errors['inApp.body'] = 'In-app notification body is required';
        }
      }
    } else {
      // Per-Channel Configuration is OFF
      // Default Template is REQUIRED
      if (!data.notificationTemplate?.title?.trim()) {
        errors['default.title'] = 'Default template title is required when per-channel configuration is not enabled';
      }
      if (!data.notificationTemplate?.body?.trim()) {
        errors['default.body'] = 'Default template body is required when per-channel configuration is not enabled';
      }
    }

    return errors;
  };

  const onSubmit = (data: NotificationFormData) => {
    // Validate templates first (default or per-channel based on config)
    const validationErrors = validateTemplates(data);
    if (Object.keys(validationErrors).length > 0) {
      setTemplateErrors(validationErrors);
      // Determine appropriate error message
      const hasDefaultErrors = validationErrors['default.title'] || validationErrors['default.body'];
      const errorDetail = hasDefaultErrors
        ? 'Default Template is required when Per-Channel Configuration is not enabled'
        : 'Please fill in all required channel template fields';
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: errorDetail,
        life: 5000,
      });
      return;
    }
    setTemplateErrors({});

    const payload: any = {
      moduleId: data.moduleId,
      notificationType: data.notificationType,
      name: data.name,
      description: data.description || undefined,
      category: data.category || undefined,
      defaultChannels: data.defaultChannels,
      priority: data.priority,
      active: data.active,
    };

    // Add channels config if enabled
    if (showChannelsConfig && data.channels) {
      payload.channels = data.channels;
    }

    // Add template if provided
    if (showTemplateSection && data.notificationTemplate?.title && data.notificationTemplate?.body) {
      payload.notificationTemplate = data.notificationTemplate;
    }

    // Add parameters if any
    if (data.notificationParameters && data.notificationParameters.length > 0) {
      payload.notificationParameters = data.notificationParameters;
    }

    // Add actions if any
    if (data.notificationActions && data.notificationActions.length > 0) {
      payload.notificationActions = data.notificationActions;
    }

    // Add settings if enabled
    if (showSettingsSection && data.settings) {
      // Clean up null values in settings
      const cleanSettings: any = {};

      if (data.settings.allowUserOptOut !== null && data.settings.allowUserOptOut !== undefined) {
        cleanSettings.allowUserOptOut = data.settings.allowUserOptOut;
      }
      if (data.settings.retryOnFailure !== null && data.settings.retryOnFailure !== undefined) {
        cleanSettings.retryOnFailure = data.settings.retryOnFailure;
      }
      if (data.settings.maxRetries !== null && data.settings.maxRetries !== undefined) {
        cleanSettings.maxRetries = data.settings.maxRetries;
      }
      if (data.settings.retryDelayMinutes !== null && data.settings.retryDelayMinutes !== undefined) {
        cleanSettings.retryDelayMinutes = data.settings.retryDelayMinutes;
      }
      if (data.settings.expiresAfterMinutes !== null && data.settings.expiresAfterMinutes !== undefined) {
        cleanSettings.expiresAfterMinutes = data.settings.expiresAfterMinutes;
      }

      // Clean up throttle object
      if (data.settings.throttle) {
        const cleanThrottle: any = {};
        if (data.settings.throttle.enabled !== null && data.settings.throttle.enabled !== undefined) {
          cleanThrottle.enabled = data.settings.throttle.enabled;
        }
        if (data.settings.throttle.maxPerHour !== null && data.settings.throttle.maxPerHour !== undefined) {
          cleanThrottle.maxPerHour = data.settings.throttle.maxPerHour;
        }
        if (data.settings.throttle.maxPerDay !== null && data.settings.throttle.maxPerDay !== undefined) {
          cleanThrottle.maxPerDay = data.settings.throttle.maxPerDay;
        }

        // Only add throttle if it has at least one property
        if (Object.keys(cleanThrottle).length > 0) {
          cleanSettings.throttle = cleanThrottle;
        }
      }

      payload.settings = cleanSettings;
    }

    // Add batching config if enabled
    if (showBatchingSection) {
      payload.canBeBatched = data.canBeBatched;
      if (data.canBeBatched) {
        payload.batchWindowMinutes = data.batchWindowMinutes;
        if (data.batchTemplate?.title || data.batchTemplate?.body) {
          payload.batchTemplate = data.batchTemplate;
        }
      }
    }

    if (isEditMode) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  // Get channel label
  const getChannelLabel = (channelValue: string) => {
    const opt = channelOptions.find((c) => c.value === channelValue);
    return opt?.label || defaultChannelLabels[channelValue] || channelValue;
  };

  // Handle form validation errors (from Zod)
  const onFormError = (formErrors: any) => {
    console.error('Form validation errors:', formErrors);
    // Get the first error message
    const firstErrorKey = Object.keys(formErrors)[0];
    const firstError = formErrors[firstErrorKey];
    const errorMessage = firstError?.message || firstError?.root?.message || 'Please fix the validation errors';

    toast.current?.show({
      severity: 'error',
      summary: 'Validation Error',
      detail: errorMessage,
      life: 5000,
    });
  };

  // Loading state
  if (fetchLoading) {
    return (
      <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900 flex justify-center items-center">
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4 lg:px-6 bg-gray-50 dark:bg-gray-900 min-h-screen" data-testid="SCR-NotificationMaster-Form">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleNavigate('/notification-master')}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
          >
            <i className="pi pi-arrow-left text-lg" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isEditMode ? 'Edit Notification Master' : 'Create Notification Master'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isEditMode ? 'Update notification template configuration' : 'Create a new notification template'}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4">
        <form onSubmit={handleSubmit(onSubmit, onFormError)}>
          <div className="space-y-4">
          {/* Basic Information */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              {/* Module Dropdown */}
              <Controller
                name="moduleId"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      <small className="text-red-500 text-xs mt-1">{errors.moduleId.message}</small>
                    )}
                  </div>
                )}
              />

              {/* Notification Type */}
              <Controller
                name="notificationType"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    label="Notification Type"
                    value={field.value ?? ''}
                    onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                    error={!!errors.notificationType}
                    helperText={errors.notificationType?.message as string}
                    required
                    disabled={isEditMode}
                    placeholder="e.g., ORDER_CONFIRMED"
                  />
                )}
              />

              {/* Name */}
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <FormInput
                    name={field.name}
                    label="Name"
                    value={field.value ?? ''}
                    onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                    error={!!errors.name}
                    helperText={errors.name?.message as string}
                    required
                    placeholder="e.g., Order Confirmed"
                  />
                )}
              />

              {/* Description */}
              <div className="md:col-span-3">
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <FormInput
                      name={field.name}
                      label="Description"
                      value={field.value ?? ''}
                      onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                      error={!!errors.description}
                      helperText={errors.description?.message as string}
                      multiline
                      rows={2}
                      placeholder="Brief description of when this notification is sent"
                    />
                  )}
                />
              </div>

              {/* Category */}
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-col">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Category
                    </label>
                    <Dropdown
                      value={field.value}
                      options={categoryOptions}
                      onChange={(e) => field.onChange(e.value)}
                      placeholder="Select Category (Optional)"
                      className="w-full"
                      showClear
                    />
                  </div>
                )}
              />

              {/* Priority */}
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <FormSelect
                    name={field.name}
                    label="Priority"
                    value={field.value ?? 'NORMAL'}
                    onChange={(e) => field.onChange(e.target.value)}
                    options={priorityOptions}
                    error={!!errors.priority}
                    helperText={errors.priority?.message as string}
                    required
                  />
                )}
              />

              {/* Default Channels */}
              <Controller
                name="defaultChannels"
                control={control}
                render={({ field }) => (
                  <FormMultiSelect
                    name={field.name}
                    label="Default Channels"
                    value={Array.isArray(field.value) ? field.value : []}
                    onChange={(vals: string[]) => field.onChange(vals)}
                    options={channelOptions}
                    error={!!errors.defaultChannels}
                    helperText={(errors.defaultChannels as any)?.message}
                    required
                    placeholder="Select channels"
                  />
                )}
              />

            </div>
          </div>

          {/* Per-Channel Configuration */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Per-Channel Configuration
              </h3>
              <div className="flex items-center gap-2">
                <InputSwitch
                  checked={showChannelsConfig}
                  onChange={(e) => setShowChannelsConfig(e.value)}
                />
                <label className="text-sm text-gray-600 dark:text-gray-400">Enable</label>
              </div>
            </div>

            {showChannelsConfig && selectedChannels.length > 0 ? (
              <Accordion multiple>
                {selectedChannels.map((channel: string) => (
                  <AccordionTab
                    key={channel}
                    header={
                      <div className="flex items-center gap-2">
                        <i className={`pi ${channel === 'email' ? 'pi-envelope' : channel === 'sms' ? 'pi-mobile' : channel === 'whatsapp' ? 'pi-whatsapp' : channel === 'push' || channel === 'webPush' ? 'pi-bell' : 'pi-inbox'}`} />
                        <span>{getChannelLabel(channel)}</span>
                      </div>
                    }
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Controller
                        name={`channels.${channel as NotificationChannel}.enabled`}
                        control={control}
                        render={({ field }) => (
                          <div className="flex items-center gap-3">
                            <InputSwitch checked={!!field.value} onChange={(e) => field.onChange(e.value)} />
                            <label className="text-sm text-gray-700 dark:text-gray-300">Enabled</label>
                          </div>
                        )}
                      />

                      {/* Channel-specific Template Fields */}
                      <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Channel-specific Template
                          <span className="text-gray-400 font-normal ml-2">(Required when channel is enabled)</span>
                        </p>

                        {/* Email Channel - subject, body, htmlBody */}
                        {channel === 'email' && (
                          <div className="grid grid-cols-1 gap-3">
                            <Controller
                              name="channels.email.template.subject"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Subject <span className="text-red-500">*</span>
                                  </label>
                                  <FormInput
                                    name={field.name}
                                    value={field.value ?? ''}
                                    onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                    placeholder="Email subject line (e.g., Your Order #{orderId} is Confirmed!)"
                                    error={!!templateErrors['email.subject']}
                                    helperText={templateErrors['email.subject']}
                                  />
                                </div>
                              )}
                            />
                            <Controller
                              name="channels.email.template.body"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Plain Text Body <span className="text-red-500">*</span>
                                  </label>
                                  <InputTextarea
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    rows={3}
                                    placeholder="Plain text email body..."
                                    className={`w-full ${templateErrors['email.body'] ? 'p-invalid' : ''}`}
                                  />
                                  {templateErrors['email.body'] && (
                                    <small className="text-red-500 mt-1">{templateErrors['email.body']}</small>
                                  )}
                                </div>
                              )}
                            />
                            <Controller
                              name="channels.email.template.htmlBody"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    HTML Body <span className="text-gray-400 font-normal">(Optional)</span>
                                  </label>
                                  <InputTextarea
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    rows={4}
                                    placeholder="<h1>Order Confirmed</h1><p>Dear {userName}...</p>"
                                    className="w-full font-mono text-sm"
                                  />
                                  <small className="text-gray-500 mt-1">
                                    HTML template for rich email content
                                  </small>
                                </div>
                              )}
                            />
                          </div>
                        )}

                        {/* SMS Channel - body only (max 160 chars) */}
                        {channel === 'sms' && (
                          <div className="grid grid-cols-1 gap-3">
                            <Controller
                              name="channels.sms.template.body"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    SMS Body <span className="text-red-500">*</span> <span className="text-amber-500">(Max 160 characters)</span>
                                  </label>
                                  <InputTextarea
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    rows={2}
                                    maxLength={160}
                                    placeholder="Order #{orderId} confirmed. Track: {trackingUrl}"
                                    className={`w-full ${templateErrors['sms.body'] ? 'p-invalid' : ''}`}
                                  />
                                  <div className="flex justify-between mt-1">
                                    {templateErrors['sms.body'] ? (
                                      <small className="text-red-500">{templateErrors['sms.body']}</small>
                                    ) : (
                                      <span></span>
                                    )}
                                    <small className={`${(field.value?.length || 0) > 140 ? 'text-amber-500' : 'text-gray-500'}`}>
                                      {field.value?.length || 0}/160 characters
                                    </small>
                                  </div>
                                </div>
                              )}
                            />
                          </div>
                        )}

                        {/* WhatsApp Channel - templateName, templateLanguage, components */}
                        {channel === 'whatsapp' && (
                          <div className="grid grid-cols-1 gap-3">
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-2">
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                <i className="pi pi-info-circle mr-2" />
                                WhatsApp requires pre-approved message templates. Enter your approved template details below.
                              </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Controller
                                name="channels.whatsapp.template.templateName"
                                control={control}
                                render={({ field }) => (
                                  <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      Template Name <span className="text-red-500">*</span>
                                    </label>
                                    <FormInput
                                      name={field.name}
                                      value={field.value ?? ''}
                                      onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                      placeholder="e.g., order_confirmation"
                                      error={!!templateErrors['whatsapp.templateName']}
                                      helperText={templateErrors['whatsapp.templateName']}
                                    />
                                  </div>
                                )}
                              />
                              <Controller
                                name="channels.whatsapp.template.templateLanguage"
                                control={control}
                                render={({ field }) => (
                                  <FormInput
                                    name={field.name}
                                    label="Template Language"
                                    value={field.value ?? 'en'}
                                    onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                    placeholder="e.g., en, hi, te"
                                  />
                                )}
                              />
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              <p className="mb-1">Template parameters will be extracted from the notification payload based on the components defined in your WhatsApp Business template.</p>
                            </div>
                          </div>
                        )}

                        {/* Push/WebPush Channel - title, body, image, icon */}
                        {(channel === 'push' || channel === 'webPush') && (
                          <div className="grid grid-cols-1 gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Controller
                                name={`channels.${channel}.template.title`}
                                control={control}
                                render={({ field }) => (
                                  <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      Title <span className="text-red-500">*</span>
                                    </label>
                                    <FormInput
                                      name={field.name}
                                      value={field.value ?? ''}
                                      onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                      placeholder="Push notification title"
                                      error={!!templateErrors[`${channel}.title`]}
                                      helperText={templateErrors[`${channel}.title`]}
                                    />
                                  </div>
                                )}
                              />
                              <Controller
                                name={`channels.${channel}.template.icon`}
                                control={control}
                                render={({ field }) => (
                                  <FormInput
                                    name={field.name}
                                    label="Icon URL (Optional)"
                                    value={field.value ?? ''}
                                    onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                    placeholder="https://example.com/icon.png"
                                  />
                                )}
                              />
                            </div>
                            <Controller
                              name={`channels.${channel}.template.body`}
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Body <span className="text-red-500">*</span>
                                  </label>
                                  <InputTextarea
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    rows={2}
                                    placeholder="Push notification body text"
                                    className={`w-full ${templateErrors[`${channel}.body`] ? 'p-invalid' : ''}`}
                                  />
                                  {templateErrors[`${channel}.body`] && (
                                    <small className="text-red-500 mt-1">{templateErrors[`${channel}.body`]}</small>
                                  )}
                                </div>
                              )}
                            />
                            <Controller
                              name={`channels.${channel}.template.image`}
                              control={control}
                              render={({ field }) => (
                                <FormInput
                                  name={field.name}
                                  label="Image URL (Optional)"
                                  value={field.value ?? ''}
                                  onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                  placeholder="https://example.com/notification-image.jpg"
                                />
                              )}
                            />
                          </div>
                        )}

                        {/* InApp Channel - title, body, icon, color */}
                        {channel === 'inApp' && (
                          <div className="grid grid-cols-1 gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <Controller
                                name="channels.inApp.template.title"
                                control={control}
                                render={({ field }) => (
                                  <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                      Title <span className="text-red-500">*</span>
                                    </label>
                                    <FormInput
                                      name={field.name}
                                      value={field.value ?? ''}
                                      onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                      placeholder="In-app notification title"
                                      error={!!templateErrors['inApp.title']}
                                      helperText={templateErrors['inApp.title']}
                                    />
                                  </div>
                                )}
                              />
                              <Controller
                                name="channels.inApp.template.icon"
                                control={control}
                                render={({ field }) => (
                                  <FormInput
                                    name={field.name}
                                    label="Icon (Optional)"
                                    value={field.value ?? ''}
                                    onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                    placeholder="e.g., pi pi-check or icon URL"
                                  />
                                )}
                              />
                            </div>
                            <Controller
                              name="channels.inApp.template.body"
                              control={control}
                              render={({ field }) => (
                                <div className="flex flex-col">
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Body <span className="text-red-500">*</span>
                                  </label>
                                  <InputTextarea
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    rows={2}
                                    placeholder="In-app notification body"
                                    className={`w-full ${templateErrors['inApp.body'] ? 'p-invalid' : ''}`}
                                  />
                                  {templateErrors['inApp.body'] && (
                                    <small className="text-red-500 mt-1">{templateErrors['inApp.body']}</small>
                                  )}
                                </div>
                              )}
                            />
                            <Controller
                              name="channels.inApp.template.color"
                              control={control}
                              render={({ field }) => (
                                <FormInput
                                  name={field.name}
                                  label="Accent Color (Optional)"
                                  value={field.value ?? ''}
                                  onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                                  placeholder="e.g., #22c55e or green"
                                />
                              )}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionTab>
                ))}
              </Accordion>
            ) : showChannelsConfig ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Select channels in "Default Channels" to configure per-channel settings.
              </p>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Enable to configure per-channel settings like priority overrides and channel-specific templates.
              </p>
            )}
          </div>

          {/* Notification Template */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Default Notification Template
                {!isAnyChannelEnabled && <span className="text-red-500 ml-1">*</span>}
              </h3>
              <div className="flex items-center gap-2">
                <InputSwitch
                  checked={showTemplateSection}
                  onChange={(e) => setShowTemplateSection(e.value)}
                />
                <label className="text-sm text-gray-600 dark:text-gray-400">Enable</label>
              </div>
            </div>

            {/* Info message about when default template is required */}
            <div className={`mb-3 p-3 rounded-lg text-sm ${isAnyChannelEnabled ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'}`}>
              <i className={`pi ${isAnyChannelEnabled ? 'pi-info-circle' : 'pi-exclamation-triangle'} mr-2`} />
              {isAnyChannelEnabled ? (
                <span>Default template is optional when per-channel configuration is enabled. It serves as a fallback for channels without custom templates.</span>
              ) : (
                <span><strong>Required:</strong> Default template is required when no per-channel configuration is enabled. This template will be used for all selected channels.</span>
              )}
            </div>

            {showTemplateSection ? (
              <div className="grid grid-cols-1 gap-3">
                <Controller
                  name="notificationTemplate.title"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Template Title {!isAnyChannelEnabled && <span className="text-red-500">*</span>}
                      </label>
                      <FormInput
                        name={field.name}
                        value={field.value ?? ''}
                        onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                        error={!!(errors as any)?.notificationTemplate?.title || !!templateErrors['default.title']}
                        helperText={(errors as any)?.notificationTemplate?.title?.message || templateErrors['default.title']}
                        placeholder="e.g., Order Confirmed - Use {variableName} for placeholders"
                      />
                    </div>
                  )}
                />

                <Controller
                  name="notificationTemplate.body"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-col">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Template Body {!isAnyChannelEnabled && <span className="text-red-500">*</span>}
                      </label>
                      <InputTextarea
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        rows={4}
                        placeholder="Hi {userName}, your order #{orderId} has been confirmed."
                        className={`w-full ${(errors as any)?.notificationTemplate?.body || templateErrors['default.body'] ? 'p-invalid' : ''}`}
                      />
                      {((errors as any)?.notificationTemplate?.body || templateErrors['default.body']) && (
                        <small className="text-red-500 mt-1">
                          {(errors as any)?.notificationTemplate?.body?.message || templateErrors['default.body']}
                        </small>
                      )}
                      <small className="text-gray-500 mt-1">
                        Use {'{variableName}'} syntax for dynamic content placeholders
                      </small>
                    </div>
                  )}
                />
              </div>
            ) : !isAnyChannelEnabled ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                  <i className="pi pi-exclamation-circle" />
                  <span>Please enable the Default Template. It is required when Per-Channel Configuration is not set up.</span>
                </p>
                {(templateErrors['default.title'] || templateErrors['default.body']) && (
                  <ul className="mt-2 text-red-600 dark:text-red-400 text-sm list-disc list-inside">
                    {templateErrors['default.title'] && <li>{templateErrors['default.title']}</li>}
                    {templateErrors['default.body'] && <li>{templateErrors['default.body']}</li>}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Enable template to define the notification title and body with variable placeholders. This will be used as a fallback for channels without custom templates.
              </p>
            )}
          </div>

          {/* Notification Parameters */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Template Parameters
              </h3>
              <Button
                type="button"
                label="Add"
                icon="pi pi-plus"
                severity="secondary"
                outlined
                size="small"
                onClick={() => appendParameter({ name: '', type: 'string', required: true, default: null, description: '' })}
              />
            </div>

            {parameterFields.length > 0 ? (
              <div className="space-y-3">
                {parameterFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                      <Controller
                        name={`notificationParameters.${index}.name`}
                        control={control}
                        render={({ field: f }) => (
                          <FormInput
                            name={f.name}
                            label="Name"
                            value={f.value ?? ''}
                            onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                            error={!!(errors.notification_parameters as any)?.[index]?.name}
                            helperText={(errors.notification_parameters as any)?.[index]?.name?.message}
                            placeholder="e.g., userName"
                          />
                        )}
                      />

                      <Controller
                        name={`notificationParameters.${index}.type`}
                        control={control}
                        render={({ field: f }) => (
                          <div className="flex flex-col">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Type
                            </label>
                            <Dropdown
                              value={f.value}
                              options={parameterTypeOptions}
                              onChange={(e) => f.onChange(e.value)}
                              placeholder="Select Type"
                              className="w-full"
                            />
                          </div>
                        )}
                      />

                      <Controller
                        name={`notificationParameters.${index}.default`}
                        control={control}
                        render={({ field: f }) => (
                          <FormInput
                            name={f.name}
                            label="Default"
                            value={f.value !== null && f.value !== undefined ? String(f.value) : ''}
                            onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                            placeholder="Default value"
                          />
                        )}
                      />

                      <Controller
                        name={`notificationParameters.${index}.description`}
                        control={control}
                        render={({ field: f }) => (
                          <FormInput
                            name={f.name}
                            label="Description"
                            value={f.value ?? ''}
                            onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                            placeholder="Description"
                          />
                        )}
                      />

                      <Controller
                        name={`notificationParameters.${index}.required`}
                        control={control}
                        render={({ field: f }) => (
                          <div className="flex items-center gap-3 pt-6">
                            <InputSwitch checked={!!f.value} onChange={(e) => f.onChange(e.value)} />
                            <label className="text-sm text-gray-700 dark:text-gray-300">Required</label>
                          </div>
                        )}
                      />

                      <div className="flex justify-end pt-6">
                        <i
                          className="pi pi-trash text-red-500 cursor-pointer hover:text-red-700 transition-colors"
                          onClick={() => removeParameter(index)}
                          title="Remove parameter"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No parameters defined. Add parameters to define the variables used in your notification template.
              </p>
            )}
          </div>

          {/* Notification Actions */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Notification Actions
              </h3>
              <Button
                type="button"
                label="Add"
                icon="pi pi-plus"
                severity="secondary"
                outlined
                size="small"
                onClick={() => appendAction({
                  actionId: '',
                  label: '',
                  actionType: 'navigate',
                  url: null,
                  method: null,
                  payload: null,
                  style: 'primary',
                  icon: null,
                  requiresMemo: false,
                  confirmMessage: null,
                })}
              />
            </div>

            {actionFields.length > 0 ? (
              <div className="space-y-3">
                {actionFields.map((field, index) => {
                  const actionType = watch(`notificationActions.${index}.actionType`);
                  return (
                    <div
                      key={field.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-2">
                        <Controller
                          name={`notificationActions.${index}.actionId`}
                          control={control}
                          render={({ field: f }) => (
                            <FormInput
                              name={f.name}
                              label="Action ID"
                              value={f.value ?? ''}
                              onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                              error={!!(errors.notification_actions as any)?.[index]?.actionId}
                              helperText={(errors.notification_actions as any)?.[index]?.actionId?.message}
                              placeholder="e.g., view_order"
                            />
                          )}
                        />

                        <Controller
                          name={`notificationActions.${index}.label`}
                          control={control}
                          render={({ field: f }) => (
                            <FormInput
                              name={f.name}
                              label="Label"
                              value={f.value ?? ''}
                              onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                              error={!!(errors.notification_actions as any)?.[index]?.label}
                              helperText={(errors.notification_actions as any)?.[index]?.label?.message}
                              placeholder="e.g., View Order"
                            />
                          )}
                        />

                        <Controller
                          name={`notificationActions.${index}.actionType`}
                          control={control}
                          render={({ field: f }) => (
                            <div className="flex flex-col">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Action Type
                              </label>
                              <Dropdown
                                value={f.value}
                                options={actionTypeOptions}
                                onChange={(e) => f.onChange(e.value)}
                                placeholder="Select Type"
                                className="w-full"
                              />
                            </div>
                          )}
                        />

                        <Controller
                          name={`notificationActions.${index}.style`}
                          control={control}
                          render={({ field: f }) => (
                            <div className="flex flex-col">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Style
                              </label>
                              <Dropdown
                                value={f.value}
                                options={actionStyleOptions}
                                onChange={(e) => f.onChange(e.value)}
                                placeholder="Select Style"
                                className="w-full"
                              />
                            </div>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-2">
                        {(actionType === 'navigate' || actionType === 'api') && (
                          <Controller
                            name={`notificationActions.${index}.url`}
                            control={control}
                            render={({ field: f }) => (
                              <FormInput
                                name={f.name}
                                label="URL"
                                value={f.value ?? ''}
                                onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                                placeholder={actionType === 'api' ? '/api/endpoint' : '/path/to/page'}
                              />
                            )}
                          />
                        )}

                        {actionType === 'api' && (
                          <Controller
                            name={`notificationActions.${index}.method`}
                            control={control}
                            render={({ field: f }) => (
                              <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  HTTP Method
                                </label>
                                <Dropdown
                                  value={f.value}
                                  options={httpMethodOptions}
                                  onChange={(e) => f.onChange(e.value)}
                                  placeholder="Select Method"
                                  className="w-full"
                                />
                              </div>
                            )}
                          />
                        )}

                        <Controller
                          name={`notificationActions.${index}.icon`}
                          control={control}
                          render={({ field: f }) => (
                            <FormInput
                              name={f.name}
                              label="Icon"
                              value={f.value ?? ''}
                              onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                              placeholder="e.g., pi pi-check"
                            />
                          )}
                        />

                        <Controller
                          name={`notificationActions.${index}.confirmMessage`}
                          control={control}
                          render={({ field: f }) => (
                            <FormInput
                              name={f.name}
                              label="Confirm Message"
                              value={f.value ?? ''}
                              onChange={(e: any) => f.onChange(e.target?.value ?? e)}
                              placeholder="Are you sure?"
                            />
                          )}
                        />

                        <Controller
                          name={`notificationActions.${index}.requiresMemo`}
                          control={control}
                          render={({ field: f }) => (
                            <div className="flex items-center gap-3 pt-6">
                              <InputSwitch checked={!!f.value} onChange={(e) => f.onChange(e.value)} />
                              <label className="text-sm text-gray-700 dark:text-gray-300">Requires Memo</label>
                            </div>
                          )}
                        />
                      </div>

                      <div className="flex justify-end">
                        <i
                          className="pi pi-trash text-red-500 cursor-pointer hover:text-red-700 transition-colors"
                          onClick={() => removeAction(index)}
                          title="Remove action"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No actions defined. Add actions to allow users to interact with this notification.
              </p>
            )}
          </div>

          {/* Settings */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Settings
              </h3>
              <div className="flex items-center gap-2">
                <InputSwitch
                  checked={showSettingsSection}
                  onChange={(e) => setShowSettingsSection(e.value)}
                />
                <label className="text-sm text-gray-600 dark:text-gray-400">Enable</label>
              </div>
            </div>

            {showSettingsSection ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <Controller
                    name="settings.allowUserOptOut"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-3">
                        <InputSwitch checked={!!field.value} onChange={(e) => field.onChange(e.value)} />
                        <label className="text-sm text-gray-700 dark:text-gray-300">Allow User Opt-Out</label>
                      </div>
                    )}
                  />

                  <Controller
                    name="settings.retryOnFailure"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-3">
                        <InputSwitch checked={!!field.value} onChange={(e) => field.onChange(e.value)} />
                        <label className="text-sm text-gray-700 dark:text-gray-300">Retry on Failure</label>
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <Controller
                    name="settings.maxRetries"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Retries
                        </label>
                        <InputNumber
                          value={field.value ?? 3}
                          onValueChange={(e) => field.onChange(e.value)}
                          min={0}
                          max={10}
                          className="w-full"
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="settings.retryDelayMinutes"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Retry Delay (minutes)
                        </label>
                        <InputNumber
                          value={field.value ?? 5}
                          onValueChange={(e) => field.onChange(e.value)}
                          min={1}
                          max={60}
                          className="w-full"
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="settings.expiresAfterMinutes"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Expires After (minutes)
                        </label>
                        <InputNumber
                          value={field.value ?? 1440}
                          onValueChange={(e) => field.onChange(e.value)}
                          min={1}
                          className="w-full"
                        />
                      </div>
                    )}
                  />
                </div>

                {/* Throttle Config */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Throttle Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <Controller
                      name="settings.throttle.enabled"
                      control={control}
                      render={({ field }) => (
                        <div className="flex items-center gap-3">
                          <InputSwitch checked={!!field.value} onChange={(e) => field.onChange(e.value)} />
                          <label className="text-sm text-gray-700 dark:text-gray-300">Enable Throttle</label>
                        </div>
                      )}
                    />

                    <Controller
                      name="settings.throttle.maxPerHour"
                      control={control}
                      render={({ field }) => (
                        <div className="flex flex-col">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Max Per Hour
                          </label>
                          <InputNumber
                            value={field.value}
                            onValueChange={(e) => field.onChange(e.value)}
                            min={1}
                            className="w-full"
                            placeholder="No limit"
                          />
                        </div>
                      )}
                    />

                    <Controller
                      name="settings.throttle.maxPerDay"
                      control={control}
                      render={({ field }) => (
                        <div className="flex flex-col">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Max Per Day
                          </label>
                          <InputNumber
                            value={field.value}
                            onValueChange={(e) => field.onChange(e.value)}
                            min={1}
                            className="w-full"
                            placeholder="No limit"
                          />
                        </div>
                      )}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Enable to configure retry settings, expiration, and throttling options.
              </p>
            )}
          </div>

          {/* Batching */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Batching
              </h3>
              <div className="flex items-center gap-2">
                <InputSwitch
                  checked={showBatchingSection}
                  onChange={(e) => setShowBatchingSection(e.value)}
                />
                <label className="text-sm text-gray-600 dark:text-gray-400">Enable</label>
              </div>
            </div>

            {showBatchingSection ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <Controller
                    name="canBeBatched"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-3">
                        <InputSwitch checked={!!field.value} onChange={(e) => field.onChange(e.value)} />
                        <label className="text-sm text-gray-700 dark:text-gray-300">Can Be Batched</label>
                      </div>
                    )}
                  />

                  <Controller
                    name="batchWindowMinutes"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-col">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Batch Window (minutes)
                        </label>
                        <InputNumber
                          value={field.value ?? undefined}
                          onValueChange={(e) => field.onChange(e.value)}
                          min={1}
                          className="w-full"
                          placeholder="e.g., 30"
                        />
                      </div>
                    )}
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Batch Template</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <Controller
                      name="batchTemplate.title"
                      control={control}
                      render={({ field }) => (
                        <FormInput
                          name={field.name}
                          label="Batch Title"
                          value={field.value ?? ''}
                          onChange={(e: any) => field.onChange(e.target?.value ?? e)}
                          placeholder="e.g., You have {count} new notifications"
                        />
                      )}
                    />

                    <Controller
                      name="batchTemplate.body"
                      control={control}
                      render={({ field }) => (
                        <div className="flex flex-col">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Batch Body
                          </label>
                          <InputTextarea
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value)}
                            rows={3}
                            placeholder="Summary of batched notifications..."
                            className="w-full"
                          />
                        </div>
                      )}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Enable to configure batching for grouping multiple notifications together.
              </p>
            )}
          </div>
          </div>

          {/* Form Actions */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 rounded-b-lg mt-4">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => handleNavigate('/notification-master')}
              disabled={isSaving}
              size="small"
            />
            <Button
              type="button"
              label={isSaving ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update' : 'Create')}
              icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              disabled={isSaving}
              size="small"
              onClick={handleSubmit(onSubmit, onFormError)}
              testId="NotificationMasterForm.Button.Submit"
            />
          </div>
        </form>
        </div>
      </div>

      {/* Leave confirmation */}
      <DiscardChangesDialog
        visible={showLeaveDialog}
        onStay={cancelLeave}
        onLeave={confirmLeave}
        testId="NotificationMasterForm.Dialog.Leave"
      />
    </>
  );
};

export default NotificationMasterForm;
