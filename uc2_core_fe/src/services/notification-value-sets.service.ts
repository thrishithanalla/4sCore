import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// Notification Value Sets Service
// Uses the core-notifications base URL for value sets

const NOTIFICATIONS_API_BASE_URL =
  import.meta.env.VITE_NOTIFICATIONS_API_BASE_URL || 'https://devapi.ai4andhrapolice.com/core-notifications';

// ValueSet keys for notification-related enums
export const NOTIFICATION_VALUE_SET_KEYS = {
  NOTIFICATION_CATEGORY: 'notificationCategory',
  NOTIFICATION_PARAMETER_TYPE: 'notificationParameterType',
  NOTIFICATION_PRIORITY: 'notificationPriority',
  NOTIFICATION_CHANNEL: 'notificationChannel',
  NOTIFICATION_ACTION_TYPE: 'notificationActionType',
  NOTIFICATION_ACTION_STYLE: 'notificationActionStyle',
} as const;

// Create axios instance for notifications API
const notificationsValueSetsApi: AxiosInstance = axios.create({
  baseURL: NOTIFICATIONS_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
notificationsValueSetsApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
notificationsValueSetsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const token = localStorage.getItem('accessToken');

      if (token && !currentPath.includes('/core/login')) {
        localStorage.removeItem('accessToken');
        window.location.href = '/core/login';
      }
    }
    return Promise.reject(error);
  }
);

// ValueSet item interface
export interface ValueSetItem {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  order?: number;
}

// ValueSet response interface
interface ValueSetResponse {
  data?: ValueSetItem[];
  items?: ValueSetItem[];
}

/**
 * Fetch value set by key from the notifications service
 * GET /api/v1/value-sets/{key}
 */
export const getNotificationValueSet = async (key: string): Promise<ValueSetItem[]> => {
  try {
    const res = await notificationsValueSetsApi.get<ValueSetResponse | ValueSetItem[]>(
      `/api/v1/value-sets/${key}`
    );

    // Handle different response formats
    if (Array.isArray(res.data)) {
      return res.data;
    }
    return res.data?.data || res.data?.items || [];
  } catch (error) {
    console.error(`Failed to fetch value set: ${key}`, error);
    return [];
  }
};

// Convenience functions for specific value sets
export const notificationValueSetsService = {
  /**
   * Get notification categories (TRANSACTIONAL, PROMOTIONAL, SYSTEM, ALERT)
   */
  getCategories: () => getNotificationValueSet(NOTIFICATION_VALUE_SET_KEYS.NOTIFICATION_CATEGORY),

  /**
   * Get notification parameter types (string, number, boolean, date, object, array)
   */
  getParameterTypes: () => getNotificationValueSet(NOTIFICATION_VALUE_SET_KEYS.NOTIFICATION_PARAMETER_TYPE),

  /**
   * Get notification priorities (LOW, NORMAL, HIGH, URGENT)
   */
  getPriorities: () => getNotificationValueSet(NOTIFICATION_VALUE_SET_KEYS.NOTIFICATION_PRIORITY),

  /**
   * Get notification channels (inApp, webPush, push, email, sms, whatsapp)
   */
  getChannels: () => getNotificationValueSet(NOTIFICATION_VALUE_SET_KEYS.NOTIFICATION_CHANNEL),

  /**
   * Get notification action types (navigate, api, dismiss, custom)
   */
  getActionTypes: () => getNotificationValueSet(NOTIFICATION_VALUE_SET_KEYS.NOTIFICATION_ACTION_TYPE),

  /**
   * Get notification action styles (primary, secondary, danger, text)
   */
  getActionStyles: () => getNotificationValueSet(NOTIFICATION_VALUE_SET_KEYS.NOTIFICATION_ACTION_STYLE),
};

export default notificationValueSetsService;
