import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface BreadcrumbContextValue {
  entityTitle: string | null;
  setEntityTitle: (title: string | null) => void;
  clearEntityTitle: () => void;
}

const BreadcrumbCtx = createContext<BreadcrumbContextValue>({
  entityTitle: null,
  setEntityTitle: () => {},
  clearEntityTitle: () => {},
});

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entityTitle, setEntityTitle] = useState<string | null>(null);
  const clearEntityTitle = useCallback(() => setEntityTitle(null), []);

  return (
    <BreadcrumbCtx.Provider value={{ entityTitle, setEntityTitle, clearEntityTitle }}>
      {children}
    </BreadcrumbCtx.Provider>
  );
};

export const useBreadcrumbContext = () => useContext(BreadcrumbCtx);

export function useBreadcrumbTitle(title: string | null | undefined): void {
  const { setEntityTitle, clearEntityTitle } = useBreadcrumbContext();

  useEffect(() => {
    if (title) {
      setEntityTitle(title);
    }
    return () => {
      clearEntityTitle();
    };
  }, [title, setEntityTitle, clearEntityTitle]);
}
