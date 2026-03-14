import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { initializeTheme, subscribeToThemeChanges, toggleTheme as toggleThemeUtil, ThemeMode } from './theme.utils';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [mode, setMode] = useState<ThemeMode>(() => initializeTheme());

  // Subscribe to theme changes from main_fe or other sources
  useEffect(() => {
    const unsubscribe = subscribeToThemeChanges((newTheme) => {
      setMode(newTheme);
    });

    return unsubscribe;
  }, []);

  const toggleTheme = () => {
    const newTheme = toggleThemeUtil();
    setMode(newTheme);
  };

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({ mode, toggleTheme }), [mode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};
