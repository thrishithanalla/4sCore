/**
 * Protected Route Component
 * Uses local authentication store
 * Includes route-level permission checking
 */

import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'primereact/button';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchCurrentUser } from '../../features/auth/authSlice';
import { getJobForRoute, hasJobPermission } from '../../config/route-permissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { isAuthenticated, user, loading, token } = useAppSelector((state) => state.auth);

  // Access permissionsData if it exists on the auth state
  const permissionsData = useAppSelector((state) => (state.auth as any).permissionsData);

  // Fetch user data if authenticated but user data is missing
  useEffect(() => {
    if (isAuthenticated && !user && token) {
      dispatch(fetchCurrentUser());
    }
  }, [isAuthenticated, user, token, dispatch]);

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Show loading spinner while fetching user data
  if (isAuthenticated && !user && loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <ProgressSpinner style={{ width: '50px', height: '50px' }} />
      </div>
    );
  }

  // RBAC DISABLED: skip route-level permission check (backend has no RBAC)

  return <>{children}</>;
};

export default ProtectedRoute;
