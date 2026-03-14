import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// Separate API instance for audit log service
// Base URL: https://devapi.ai4andhrapolice.com/core-auditlog/
const AUDITLOG_API_BASE_URL =
  import.meta.env.VITE_AUDITLOG_API_BASE_URL || 'https://devapi.ai4andhrapolice.com/core-auditlog';

export const auditlogApi: AxiosInstance = axios.create({
  baseURL: AUDITLOG_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
auditlogApi.interceptors.request.use(
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
auditlogApi.interceptors.response.use(
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

export default auditlogApi;
