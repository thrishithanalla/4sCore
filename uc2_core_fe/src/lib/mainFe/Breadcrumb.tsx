import React from 'react';
import { useLocation, Link } from 'react-router-dom';

interface BreadcrumbConfig {
  basePath?: string;
  moduleName?: string;
  routeLabels?: Record<string, string>;
  dashboardPath?: string;
  mfeDashboardPath?: string;
}

interface BreadcrumbProps {
  config: BreadcrumbConfig;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ config }) => {
  const location = useLocation();
  const { routeLabels = {}, moduleName = '', dashboardPath = '/dashboard' } = config;

  // Build breadcrumb items from current path
  const pathSegments = location.pathname
    .replace(/^\/core/, '') // strip /core prefix if present
    .split('/')
    .filter(Boolean);

  const crumbs = pathSegments.map((segment, index) => {
    const path = '/' + pathSegments.slice(0, index + 1).join('/');
    const label = routeLabels[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const isLast = index === pathSegments.length - 1;
    return { label, path, isLast };
  });

  return (
    <div className="px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 text-sm">
        {moduleName && (
          <>
            <Link
              to={dashboardPath}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {moduleName}
            </Link>
            {crumbs.length > 0 && <i className="pi pi-chevron-right text-xs text-gray-400" />}
          </>
        )}
        {crumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 0 && <i className="pi pi-chevron-right text-xs text-gray-400" />}
            {crumb.isLast ? (
              <span className="text-gray-600 dark:text-gray-300 font-medium">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.path}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default Breadcrumb;
