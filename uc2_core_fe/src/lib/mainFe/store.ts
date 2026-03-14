import { fetchCurrentUser } from '../../features/auth/authSlice';

// Re-export fetchCurrentUser as getCurrentUser for compatibility
export const getCurrentUser = fetchCurrentUser;
