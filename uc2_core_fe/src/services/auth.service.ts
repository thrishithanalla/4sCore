import { api } from './api';
import type { LoginRequest, AuthResponse, User } from '../types';

export const authService = {
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/api/v1/auth/login', credentials);
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/api/v1/auth/refresh', { refreshToken });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<{ data: User } | User>('/api/v1/auth/me');
    // Handle both wrapped and unwrapped response formats
    const userData = (response.data as { data?: User }).data || response.data;
    console.log('Auth /me API response:', userData);
    return userData as User;
  },
};