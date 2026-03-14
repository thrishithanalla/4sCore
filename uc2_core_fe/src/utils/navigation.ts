/**
 * Navigation utility for handling routes
 */

/**
 * Get the base path (empty for standalone app)
 */
export const getBasePath = (): string => {
  return '';
};

/**
 * Convert a route path to the correct format
 * @param path - The route path (e.g., '/dashboard', '/units')
 * @returns The full path
 */
export const getRoutePath = (path: string): string => {
  return path.startsWith('/') ? path : `/${path}`;
};
