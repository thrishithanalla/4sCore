import React from 'react';
import { Button } from 'primereact/button';

export interface AccessDeniedProps {
  title?: string;
  resourceName?: string;
  message?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  backUrl?: string;
  homeUrl?: string;
  className?: string;
  variant?: 'page' | 'inline';
  actions?: React.ReactNode;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  title = 'Access Denied',
  message = "You don't have permission to access this resource.",
  showBackButton = true,
  showHomeButton = true,
  homeUrl = '/',
  className,
  variant = 'page',
  actions,
}) => (
  <div className={`flex flex-col justify-center items-center ${variant === 'page' ? 'min-h-screen' : 'py-12'} bg-gray-50 dark:bg-gray-900 ${className || ''}`}>
    <div className="text-center max-w-md">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
        <i className="pi pi-lock text-4xl text-red-500" />
      </div>
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
      {actions || (
        <div className="flex gap-3 justify-center">
          {showBackButton && (
            <Button label="Go Back" icon="pi pi-arrow-left" severity="secondary" onClick={() => window.history.back()} />
          )}
          {showHomeButton && (
            <Button label="Home" icon="pi pi-home" onClick={() => (window.location.href = homeUrl)} />
          )}
        </div>
      )}
    </div>
  </div>
);

export default AccessDenied;
