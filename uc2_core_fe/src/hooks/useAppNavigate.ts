/**
 * Custom navigation hook that handles both standalone and MFE modes
 */

import { useNavigate, NavigateOptions } from 'react-router-dom';
import { getRoutePath } from '../utils/navigation';

export const useAppNavigate = () => {
  const navigate = useNavigate();

  /**
   * Navigate to a path, automatically adding base path if running in MFE mode
   * @param path - The route path (e.g., '/dashboard', '/units')
   * @param options - Navigation options
   */
  const appNavigate = (path: string | number, options?: NavigateOptions) => {
    // If path is a number (for going back/forward), use as-is
    if (typeof path === 'number') {
      navigate(path);
      return;
    }

    // Get the full path with base path if needed
    const fullPath = getRoutePath(path);
    navigate(fullPath, options);
  };

  return appNavigate;
};
