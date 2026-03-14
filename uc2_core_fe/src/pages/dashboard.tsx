import { useState, useEffect, useCallback, useMemo } from 'react';
import { dashboardService, type DashboardCountsResponse } from '../services/dashboard.service';
import { RefreshButton } from 'mainFe/RefreshButton';

// Convert camelCase/PascalCase to readable format
const formatName = (name: string): string => {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

// Menu metadata - icons, colors, and categories
const MENU_METADATA: Record<string, { icon: string; bgColor: string; category: string }> = {
  // Organization
  units: { icon: 'pi pi-building', bgColor: 'bg-blue-600', category: 'organization' },
  personnel: { icon: 'pi pi-users', bgColor: 'bg-green-600', category: 'organization' },
  departments: { icon: 'pi pi-sitemap', bgColor: 'bg-cyan-600', category: 'organization' },
  assignment: { icon: 'pi pi-sitemap', bgColor: 'bg-purple-600', category: 'organization' },
  post: { icon: 'pi pi-id-card', bgColor: 'bg-cyan-500', category: 'organization' },

  // Masters
  district: { icon: 'pi pi-globe', bgColor: 'bg-emerald-600', category: 'masters' },
  mandals: { icon: 'pi pi-map', bgColor: 'bg-lime-600', category: 'masters' },
  rank: { icon: 'pi pi-star', bgColor: 'bg-yellow-600', category: 'masters' },
  unittype: { icon: 'pi pi-tags', bgColor: 'bg-pink-600', category: 'masters' },
  levels: { icon: 'pi pi-sitemap', bgColor: 'bg-indigo-500', category: 'masters' },
  unitvillages: { icon: 'pi pi-map-marker', bgColor: 'bg-purple-600', category: 'masters' },
  designationmaster: { icon: 'pi pi-id-card', bgColor: 'bg-amber-600', category: 'masters' },
  errormaster: { icon: 'pi pi-exclamation-triangle', bgColor: 'bg-red-600', category: 'masters' },
  feedbackmaster: { icon: 'pi pi-comment', bgColor: 'bg-teal-500', category: 'masters' },
  logmaster: { icon: 'pi pi-file-edit', bgColor: 'bg-rose-600', category: 'masters' },
  notificationmaster: { icon: 'pi pi-bell', bgColor: 'bg-teal-600', category: 'masters' },
  prompttable: { icon: 'pi pi-comments', bgColor: 'bg-indigo-600', category: 'masters' },

  // Configurations
  approvalchain: { icon: 'pi pi-check-circle', bgColor: 'bg-green-500', category: 'configurations' },
  modulejobmappings: { icon: 'pi pi-link', bgColor: 'bg-indigo-600', category: 'configurations' },
  permissionmappings: { icon: 'pi pi-key', bgColor: 'bg-cyan-600', category: 'configurations' },
  roles: { icon: 'pi pi-shield', bgColor: 'bg-amber-600', category: 'configurations' },
  systemroles: { icon: 'pi pi-verified', bgColor: 'bg-indigo-600', category: 'configurations' },
  postrolemappings: { icon: 'pi pi-link', bgColor: 'bg-purple-600', category: 'configurations' },
  userrolepermissions: { icon: 'pi pi-id-card', bgColor: 'bg-pink-600', category: 'configurations' },
  valuesets: { icon: 'pi pi-cog', bgColor: 'bg-orange-600', category: 'configurations' },
  jobs: { icon: 'pi pi-briefcase', bgColor: 'bg-sky-600', category: 'configurations' },
  modules: { icon: 'pi pi-box', bgColor: 'bg-violet-600', category: 'configurations' },
  permissions: { icon: 'pi pi-lock', bgColor: 'bg-emerald-600', category: 'configurations' },

  // Monitoring
  errorlogs: { icon: 'pi pi-exclamation-circle', bgColor: 'bg-red-500', category: 'monitoring' },
  feedbacks: { icon: 'pi pi-comments', bgColor: 'bg-blue-400', category: 'monitoring' },
  logtransaction: { icon: 'pi pi-history', bgColor: 'bg-slate-600', category: 'monitoring' },
  notifications: { icon: 'pi pi-bell', bgColor: 'bg-yellow-500', category: 'monitoring' },
  promptexecutions: { icon: 'pi pi-play-circle', bgColor: 'bg-purple-500', category: 'monitoring' },

  // Other
  fileupload: { icon: 'pi pi-upload', bgColor: 'bg-gray-500', category: 'masters' },
  testmaster: { icon: 'pi pi-wrench', bgColor: 'bg-gray-500', category: 'masters' },
};

const normalizeName = (name: string): string => name.toLowerCase().replace(/[-_\s]/g, '');

const getMetadata = (name: string) => {
  const normalized = normalizeName(name);
  return MENU_METADATA[normalized] || { icon: 'pi pi-box', bgColor: 'bg-gray-600', category: 'masters' };
};

interface DashboardItem {
  name: string;
  displayName: string;
  count: number;
  route: string;
  icon: string;
  bgColor: string;
  category: string;
}

const Dashboard = () => {
  const [counts, setCounts] = useState<DashboardCountsResponse>({ platform: {}, application: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCounts = useCallback(async () => {
    try {
      const data = await dashboardService.getCounts();
      setCounts(data);
    } catch (error) {
      console.error('Failed to fetch dashboard counts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCounts();
  };

  // Process and categorize items
  const processedItems = useMemo(() => {
    const platformItems: DashboardItem[] = Object.entries(counts.platform)
      .filter(([, item]) => item.isMenu === true && item.route)
      .map(([name, item]) => {
        const meta = getMetadata(name);
        return {
          name,
          displayName: item.displayName?.replace(/_/g, ' ') || formatName(name),
          count: item.count,
          route: `/${item.route}`,
          icon: meta.icon,
          bgColor: meta.bgColor,
          category: meta.category,
        };
      });

    const applicationItems: DashboardItem[] = Object.entries(counts.application)
      .filter(([, item]) => item.isMenu === true && item.route)
      .map(([name, item]) => {
        const meta = getMetadata(name);
        return {
          name,
          displayName: item.displayName?.replace(/_/g, ' ') || formatName(name),
          count: item.count,
          route: `/${item.route}`,
          icon: meta.icon,
          bgColor: meta.bgColor,
          category: meta.category,
        };
      });

    return [...platformItems, ...applicationItems];
  }, [counts]);

  // Helper to find count from raw API data by key name (case-insensitive)
  const getCountFromRawData = useCallback((searchKey: string): number => {
    const normalizedSearch = searchKey.toLowerCase();

    // Search in platform data
    for (const [key, item] of Object.entries(counts.platform)) {
      if (key.toLowerCase().includes(normalizedSearch)) {
        return item.count;
      }
    }

    // Search in application data
    for (const [key, item] of Object.entries(counts.application)) {
      if (key.toLowerCase().includes(normalizedSearch)) {
        return item.count;
      }
    }

    return 0;
  }, [counts]);

  // Calculate summary stats - only Modules, Personnel, Units
  const summaryStats = useMemo(() => {
    const totalModules = getCountFromRawData('modules');//processedItems.length;
    const personnelCount = getCountFromRawData('personnel');
    const unitsCount = getCountFromRawData('units');

    return { totalModules, personnelCount, unitsCount };
  }, [processedItems, getCountFromRawData]);

  // Render summary stat card
  const renderStatCard = (
    title: string,
    value: number | string,
    icon: string,
    gradient: string,
    subtitle?: string
  ) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
          <i className={`${icon} text-white text-xl`} />
        </div>
      </div>
    </div>
  );

  // Render skeleton loading
  const renderSkeleton = () => (
    <div className="animate-pulse">
      {/* Summary Stats Skeleton - 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              </div>
              <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="SCR-Dashboard-Main">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Core Services Master Data Overview
            </p>
          </div>
          <RefreshButton onClick={handleRefresh} loading={refreshing} />
        </div>

        {/* Loading State */}
        {loading && renderSkeleton()}

        {/* Dashboard Content */}
        {!loading && processedItems.length > 0 && (
          <>
            {/* Summary Stats - Only Modules, Personnel, Units */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {renderStatCard(
                'Modules',
                summaryStats.totalModules,
                'pi pi-th-large',
                'from-emerald-500 to-emerald-600',
                'Configured & active'
              )}
              {renderStatCard(
                'Personnel',
                summaryStats.personnelCount,
                'pi pi-users',
                'from-purple-500 to-purple-600',
                'Total personnel records'
              )}
              {renderStatCard(
                'Units',
                summaryStats.unitsCount,
                'pi pi-building',
                'from-amber-500 to-amber-600',
                'Active organizational units'
              )}
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && processedItems.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <i className="pi pi-inbox text-gray-400 text-3xl" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Data Available</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Dashboard data is not available at the moment. Please try refreshing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
