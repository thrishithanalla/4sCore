/**
 * Shared Theme Utility
 * Provides consistent theme management across all MFEs
 */

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'themeMode';

/**
 * Get the current theme from localStorage
 */
export const getTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return (savedTheme as ThemeMode) || 'light';
};

/**
 * Set the theme and apply it to the document
 */
export const setTheme = (mode: ThemeMode): void => {
  if (typeof window === 'undefined') return;

  // Save to localStorage
  localStorage.setItem(THEME_STORAGE_KEY, mode);

  // Apply to document
  applyThemeToDocument(mode);

  // Dispatch storage event to notify other windows/tabs and MFEs
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: THEME_STORAGE_KEY,
      newValue: mode,
      oldValue: mode === 'light' ? 'dark' : 'light',
    })
  );
};

/**
 * Apply theme to document element
 */
export const applyThemeToDocument = (mode: ThemeMode): void => {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;

  // Set data-theme attribute
  root.setAttribute('data-theme', mode);

  // Toggle dark class for Tailwind
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

/**
 * Toggle between light and dark themes
 */
export const toggleTheme = (): ThemeMode => {
  const currentTheme = getTheme();
  const newTheme: ThemeMode = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
  return newTheme;
};

/**
 * Initialize theme on app startup
 */
export const initializeTheme = (): ThemeMode => {
  const theme = getTheme();
  applyThemeToDocument(theme);
  return theme;
};

/**
 * Listen for theme changes from other sources (main_fe or other tabs)
 * Returns a cleanup function to remove the listener
 */
export const subscribeToThemeChanges = (
  callback: (theme: ThemeMode) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && e.newValue) {
      const newTheme = e.newValue as ThemeMode;
      applyThemeToDocument(newTheme);
      callback(newTheme);
    }
  };

  window.addEventListener('storage', handleStorageChange);

  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
};
