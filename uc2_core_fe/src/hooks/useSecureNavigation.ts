/**
 * useSecureNavigation Hook (Local Fallback)
 * Provides navigation with encoded IDs in URLs
 * This is a local implementation to avoid Module Federation dependency issues
 */

import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useCallback, useMemo, useState, useEffect } from 'react';

// Known MFE prefixes that should be preserved in navigation
const MFE_PREFIXES = ['core', '91crpc', 'cdr-ipdr', 'pocso', 'investigation-copilot', 'docs2data', 'whatsapp-summary', 'news-digest'];

interface UseSecureNavigationOptions {
  /** Entity name for the current page (e.g., 'personnel', 'units') */
  entity: string;
  /** Base path for navigation (e.g., '/personnel') */
  basePath: string;
}

interface UseSecureNavigationReturn {
  /** The resolved (decoded) ID from URL params */
  id: string | null;
  /** Whether the ID has been fully decoded and is ready to use */
  isReady: boolean;
  /** Navigate to view page with encoded ID */
  navigateToView: (id: string) => void;
  /** Navigate to edit page with encoded ID */
  navigateToEdit: (id: string) => void;
  /** Navigate to create page */
  navigateToCreate: () => void;
  /** Navigate to list page */
  navigateToList: () => void;
  /** Navigate back */
  goBack: () => void;
  /** Get encoded URL for an ID (for links) */
  getViewUrl: (id: string) => string;
  /** Get encoded edit URL for an ID */
  getEditUrl: (id: string) => string;
}

/**
 * Checks if a string looks like a MongoDB ObjectId (24 hex characters)
 */
const isMongoId = (id: string): boolean => /^[a-f0-9]{24}$/i.test(id);

/**
 * Checks if a string looks like an encoded ID
 */
const isEncodedId = (id: string): boolean => {
  return /^[A-Za-z0-9_-]{20,}$/.test(id) && !isMongoId(id);
};

/**
 * Encode an ID for URL safety (Base64 URL-safe encoding)
 */
const encodeUrlId = (id: string): string => {
  try {
    return btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch {
    return id;
  }
};

/**
 * Decode a URL-safe encoded ID
 */
const decodeUrlId = (encodedId: string): string => {
  try {
    let base64 = encodedId.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding) base64 += '='.repeat(4 - padding);
    return atob(base64);
  } catch {
    return encodedId;
  }
};

/**
 * Resolve an ID - decodes if encoded, returns as-is if already decoded
 */
const resolveUrlId = (id: string): string => {
  if (isEncodedId(id)) {
    const decoded = decodeUrlId(id);
    if (isMongoId(decoded)) {
      return decoded;
    }
  }
  return id;
};

/**
 * Hook for navigation with encoded IDs
 *
 * @example
 * ```tsx
 * // In list page
 * const { navigateToView, navigateToEdit } = useSecureNavigation({
 *   entity: 'prompt',
 *   basePath: '/prompt-table',
 * });
 * <Button onClick={() => navigateToView(row._id)} />
 *
 * // In view/edit page
 * const { id } = useSecureNavigation({
 *   entity: 'prompt',
 *   basePath: '/prompt-table',
 * });
 * // id is the decoded MongoDB ObjectId
 * ```
 */
export function useSecureNavigation({
  entity: _entity,
  basePath,
}: UseSecureNavigationOptions): UseSecureNavigationReturn {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const location = useLocation();

  // State for decoded ID
  const [decodedId, setDecodedId] = useState<string | null>(null);

  // Detect MFE prefix from current URL path
  const mfePrefix = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length > 0 && MFE_PREFIXES.includes(segments[0])) {
      return '/' + segments[0];
    }
    return '';
  }, [location.pathname]);

  // Compute full path with MFE prefix
  const fullBasePath = useMemo(() => {
    return mfePrefix + basePath;
  }, [mfePrefix, basePath]);

  // Resolve the ID from URL params
  const syncId = useMemo(() => {
    if (!params.id) return null;
    return resolveUrlId(params.id);
  }, [params.id]);

  // Decode the ID
  useEffect(() => {
    if (!params.id) {
      setDecodedId(null);
      return;
    }
    setDecodedId(resolveUrlId(params.id));
  }, [params.id]);

  // Return decoded ID if available, otherwise sync version
  const id = decodedId ?? syncId;

  // Check if ID is ready
  const isReady = !params.id || (id !== null && isMongoId(id));

  // Navigate to view page with encoded ID
  const navigateToView = useCallback(
    (originalId: string) => {
      const encodedId = encodeUrlId(originalId);
      navigate(`${fullBasePath}/${encodedId}`);
    },
    [navigate, fullBasePath]
  );

  // Navigate to edit page with encoded ID
  const navigateToEdit = useCallback(
    (originalId: string) => {
      const encodedId = encodeUrlId(originalId);
      navigate(`${fullBasePath}/${encodedId}/edit`);
    },
    [navigate, fullBasePath]
  );

  // Navigate to create page
  const navigateToCreate = useCallback(() => {
    navigate(`${fullBasePath}/create`);
  }, [navigate, fullBasePath]);

  // Navigate to list page
  const navigateToList = useCallback(() => {
    navigate(fullBasePath);
  }, [navigate, fullBasePath]);

  // Go back
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Get view URL for an ID
  const getViewUrl = useCallback(
    (originalId: string) => {
      const encodedId = encodeUrlId(originalId);
      return `${fullBasePath}/${encodedId}`;
    },
    [fullBasePath]
  );

  // Get edit URL for an ID
  const getEditUrl = useCallback(
    (originalId: string) => {
      const encodedId = encodeUrlId(originalId);
      return `${fullBasePath}/${encodedId}/edit`;
    },
    [fullBasePath]
  );

  return {
    id,
    isReady,
    navigateToView,
    navigateToEdit,
    navigateToCreate,
    navigateToList,
    goBack,
    getViewUrl,
    getEditUrl,
  };
}

export default useSecureNavigation;
