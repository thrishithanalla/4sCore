import { useEffect, useCallback, useState, useRef } from 'react';
import { useLocation, useNavigate, NavigateOptions } from 'react-router-dom';
import { getRoutePath } from '../utils/navigation';

interface UseNavigationBlockerOptions {
  /** Condition to block navigation (e.g., isDirty from react-hook-form) */
  when: boolean;
}

interface UseNavigationBlockerReturn {
  /** Whether navigation is currently blocked and dialog should be shown */
  showLeaveDialog: boolean;
  /** Call this to confirm leaving (proceed with navigation) */
  confirmLeave: () => void;
  /** Call this to cancel leaving (stay on page) */
  cancelLeave: () => void;
  /**
   * Use this instead of navigate() for Cancel button, Back button, Breadcrumb clicks.
   * It will show confirmation dialog if there are unsaved changes.
   */
  handleNavigate: (path: string | number, options?: NavigateOptions) => void;
}

/**
 * Hook to block navigation when there are unsaved changes.
 * Handles browser refresh (beforeunload), browser back/forward (popstate),
 * and programmatic navigation (via handleNavigate).
 *
 * @example
 * const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });
 *
 * // Use handleNavigate for Cancel/Back buttons:
 * <Button onClick={() => handleNavigate('/list')} label="Cancel" />
 *
 * // Use handleNavigate for breadcrumb clicks:
 * <BreadCrumb onItemClick={(e) => handleNavigate(e.item.url)} />
 */
export const useNavigationBlocker = ({ when }: UseNavigationBlockerOptions): UseNavigationBlockerReturn => {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<string | number | null>(null);
  const [pendingOptions, setPendingOptions] = useState<NavigateOptions | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();
  const isBlocking = useRef(when);

  // Keep ref in sync with when prop
  useEffect(() => {
    isBlocking.current = when;
  }, [when]);

  // Dispatch custom event for cross-MFE communication (e.g., Breadcrumb in main_fe)
  useEffect(() => {
    console.log('[NavigationBlocker] Form dirty state changed:', when);
    const event = new CustomEvent('mfe-form-dirty-state', {
      detail: { isDirty: when }
    });
    window.dispatchEvent(event);

    // Cleanup: dispatch isDirty=false when component unmounts
    return () => {
      const cleanupEvent = new CustomEvent('mfe-form-dirty-state', {
        detail: { isDirty: false }
      });
      window.dispatchEvent(cleanupEvent);
    };
  }, [when]);

  // Handle beforeunload (browser refresh/close/navigate away)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (when) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [when]);

  // Block browser back/forward navigation using popstate
  useEffect(() => {
    if (!when) return;

    const currentPath = location.pathname + location.search + location.hash;

    const handlePopState = () => {
      if (isBlocking.current) {
        // Push back to current location to prevent navigation
        window.history.pushState(null, '', currentPath);
        // Show dialog
        setShowLeaveDialog(true);
        setPendingLocation('__back__');
      }
    };

    // Push state to enable popstate interception
    window.history.pushState(null, '', currentPath);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [when, location.pathname, location.search, location.hash]);

  /**
   * Navigate with blocking check - use this for Cancel, Back, Breadcrumb clicks
   */
  const handleNavigate = useCallback((path: string | number, options?: NavigateOptions) => {
    console.log('[NavigationBlocker] handleNavigate called, path:', path, 'isBlocking:', isBlocking.current);
    if (!isBlocking.current) {
      // No unsaved changes, navigate immediately
      if (typeof path === 'number') {
        navigate(path);
      } else {
        const fullPath = getRoutePath(path);
        navigate(fullPath, options);
      }
    } else {
      // Has unsaved changes, show dialog
      console.log('[NavigationBlocker] Showing leave dialog');
      setShowLeaveDialog(true);
      setPendingLocation(path);
      setPendingOptions(options);
    }
  }, [navigate]);

  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    isBlocking.current = false;

    if (pendingLocation === '__back__') {
      window.history.go(-1);
    } else if (typeof pendingLocation === 'number') {
      navigate(pendingLocation);
    } else if (pendingLocation) {
      const fullPath = getRoutePath(pendingLocation);
      navigate(fullPath, pendingOptions);
    }

    setPendingLocation(null);
    setPendingOptions(undefined);
  }, [pendingLocation, pendingOptions, navigate]);

  const cancelLeave = useCallback(() => {
    setShowLeaveDialog(false);
    setPendingLocation(null);
    setPendingOptions(undefined);
  }, []);

  return {
    showLeaveDialog,
    confirmLeave,
    cancelLeave,
    handleNavigate,
  };
};

export default useNavigationBlocker;
