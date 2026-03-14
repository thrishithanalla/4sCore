import { ReactNode, useMemo, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Breadcrumb } from '../../lib/mainFe/Breadcrumb';
import { SideMenuLayout } from '../../lib/mainFe/SideMenuLayout';
import type { MenuItem, MenuGroup } from '../../lib/mainFe/SideMenuLayout';
import { useAppNavigate } from '../../hooks/useAppNavigate';

interface MainLayoutProps {
  children: ReactNode;
}

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  units: 'Units',
  personnel: 'Personnel',
  assignments: 'Assignments',
  'unit-villages': 'Unit Villages',
  'value-sets': 'Value Sets',
  'error-master': 'Error Master',
  prompts: 'Prompts',
  notifications: '',
  masters: 'Notification Master',
  'notification-master': 'Notification Master',
  create: 'Create',
  edit: 'Edit',
  logs: 'Logs',
  roles: 'Roles',
  'system-roles': 'System Roles',
  'post-role-mappings': 'Post Role Mappings',
  departments: 'Departments',
  districts: 'Districts',
  mandals: 'Mandals',
  'unit-types': 'Unit Types',
  levels: 'Levels',
  posts: 'Posts',
  ranks: 'Ranks',
  modules: 'Modules',
  jobs: 'Jobs',
  permissions: 'Permissions',
  'log-master': 'Log Master',
  'user-role-mappings': 'User Role Mappings',
  'permission-mappings': 'Permission Mappings',
  'module-job-mappings': 'Module Job Mappings',
  'user-role-permissions': 'User Role Permissions',
  'module-hierarchy': 'Module Hierarchy',
  'log-transaction': 'Log Transaction',
  'error-logs': 'Error Logs',
  'prompt-table': 'Prompt Table',
  'feedback-master': 'Feedback Master',
  'designation-master': 'Designation Master',
  'approval-flow-master': 'Approval Flow Master',
  'file-uploads': 'File Uploads',
  'user-onboarding': 'Personnel Onboarding',
  'approval-chains': 'Approval Chains',
  'test-master': 'Test Master',
  feedbacks: 'Feedbacks',
};

// Menu metadata with icons, colors, groupings, and routes (frontend-controlled)
const MENU_METADATA: Record<string, { icon: string; iconBgColor: string; group: string; order: number; route: string }> = {
  // Configurations
  approvalchain: { icon: 'pi pi-check-circle', iconBgColor: 'bg-green-500', group: 'Configurations', order: 1, route: '/approval-chains' },
  modulejobmappings: { icon: 'pi pi-link', iconBgColor: 'bg-indigo-600', group: 'Configurations', order: 2, route: '/module-job-mappings' },
  permissionmappings: { icon: 'pi pi-key', iconBgColor: 'bg-cyan-600', group: 'Configurations', order: 3, route: '/permission-mappings' },
  roles: { icon: 'pi pi-shield', iconBgColor: 'bg-amber-600', group: 'Configurations', order: 4, route: '/roles' },
  systemroles: { icon: 'pi pi-verified', iconBgColor: 'bg-indigo-600', group: 'Configurations', order: 4.5, route: '/system-roles' },
  postrolemappings: { icon: 'pi pi-link', iconBgColor: 'bg-purple-600', group: 'Configurations', order: 4.6, route: '/post-role-mappings' },
  userrolepermissions: { icon: 'pi pi-id-card', iconBgColor: 'bg-pink-600', group: 'Configurations', order: 5, route: '/user-role-permissions' },
  valuesets: { icon: 'pi pi-cog', iconBgColor: 'bg-orange-600', group: 'Configurations', order: 6, route: '/value-sets' },

  // Masters
  assignment: { icon: 'pi pi-sitemap', iconBgColor: 'bg-purple-600', group: 'Masters', order: 0.5, route: '/assignments' },
  approvalflowmaster: { icon: 'pi pi-sitemap', iconBgColor: 'bg-blue-500', group: 'Masters', order: 1, route: '/approval-flow-master' },
  departments: { icon: 'pi pi-sitemap', iconBgColor: 'bg-cyan-600', group: 'Masters', order: 2, route: '/departments' },
  designationmaster: { icon: 'pi pi-id-card', iconBgColor: 'bg-amber-600', group: 'Masters', order: 3, route: '/designation-master' },
  district: { icon: 'pi pi-globe', iconBgColor: 'bg-emerald-600', group: 'Masters', order: 4, route: '/districts' },
  errormaster: { icon: 'pi pi-exclamation-triangle', iconBgColor: 'bg-red-600', group: 'Masters', order: 5, route: '/error-master' },
  feedbackmaster: { icon: 'pi pi-comment', iconBgColor: 'bg-teal-500', group: 'Masters', order: 6, route: '/feedback-master' },
  jobs: { icon: 'pi pi-briefcase', iconBgColor: 'bg-sky-600', group: 'Masters', order: 7, route: '/jobs' },
  logmaster: { icon: 'pi pi-file-edit', iconBgColor: 'bg-rose-600', group: 'Masters', order: 8, route: '/log-master' },
  mandals: { icon: 'pi pi-map', iconBgColor: 'bg-lime-600', group: 'Masters', order: 9, route: '/mandals' },
  modules: { icon: 'pi pi-box', iconBgColor: 'bg-violet-600', group: 'Masters', order: 10, route: '/modules' },
  notificationmaster: { icon: 'pi pi-bell', iconBgColor: 'bg-teal-600', group: 'Masters', order: 11, route: '/notification-master' },
  permissions: { icon: 'pi pi-lock', iconBgColor: 'bg-emerald-600', group: 'Masters', order: 12, route: '/permissions' },
  personnel: { icon: 'pi pi-users', iconBgColor: 'bg-green-600', group: 'Masters', order: 13, route: '/personnel' },
  prompttable: { icon: 'pi pi-comments', iconBgColor: 'bg-indigo-600', group: 'Masters', order: 14, route: '/prompt-table' },
  rank: { icon: 'pi pi-star', iconBgColor: 'bg-yellow-600', group: 'Masters', order: 15, route: '/rank' },
  unittype: { icon: 'pi pi-tags', iconBgColor: 'bg-pink-600', group: 'Masters', order: 16, route: '/unit-types' },
  levels: { icon: 'pi pi-sitemap', iconBgColor: 'bg-indigo-500', group: 'Masters', order: 16.5, route: '/levels' },
  post: { icon: 'pi pi-id-card', iconBgColor: 'bg-cyan-500', group: 'Masters', order: 16.6, route: '/posts' },
  unitvillages: { icon: 'pi pi-map-marker', iconBgColor: 'bg-purple-600', group: 'Masters', order: 17, route: '/unit-villages' },
  units: { icon: 'pi pi-building', iconBgColor: 'bg-blue-600', group: 'Masters', order: 18, route: '/units' },

  // Monitoring
  errorlogs: { icon: 'pi pi-exclamation-circle', iconBgColor: 'bg-red-500', group: 'Monitoring', order: 1, route: '/error-logs' },
  feedbacks: { icon: 'pi pi-comments', iconBgColor: 'bg-blue-400', group: 'Monitoring', order: 2, route: '/feedbacks' },
  logtransaction: { icon: 'pi pi-history', iconBgColor: 'bg-slate-600', group: 'Monitoring', order: 3, route: '/log-transaction' },
  notifications: { icon: 'pi pi-bell', iconBgColor: 'bg-yellow-500', group: 'Monitoring', order: 4, route: '/notifications' },
  promptexecutions: { icon: 'pi pi-play-circle', iconBgColor: 'bg-purple-500', group: 'Monitoring', order: 5, route: '/prompt-executions' },

  // To be disabled
  fileupload: { icon: 'pi pi-upload', iconBgColor: 'bg-gray-400', group: 'To be disabled', order: 1, route: '/file-uploads' },
  modulehierarchy: { icon: 'pi pi-sitemap', iconBgColor: 'bg-gray-400', group: 'To be disabled', order: 2, route: '/module-hierarchy' },
  testmaster: { icon: 'pi pi-wrench', iconBgColor: 'bg-gray-400', group: 'To be disabled', order: 3, route: '/test-master' },
};

// Helper to normalize job name for lookup
const normalizeJobName = (name: string): string => name.toLowerCase().replace(/[-_\s]/g, '');

// Capitalize job name for display
const capitalizeJobName = (name: string): string => {
  return name
    .split(/[-_\s]/g)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const MainLayout = ({ children }: MainLayoutProps) => {
  const location = useLocation();
  const navigate = useAppNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scroll to top on route change
  useEffect(() => {
    const scrollableContent = document.querySelector('[class*="scrollableContent"]');
    if (scrollableContent) {
      scrollableContent.scrollTop = 0;
    }
  }, [location.pathname]);

  // Access permissions data from Redux store
  const permissionsData = useSelector((state: any) => state.auth?.permissionsData);
  const currentModuleJobs = permissionsData?.currentModuleJobs;

  // Generate menu items from permissions
  const menuGroups: MenuGroup[] = useMemo(() => {
    let jobs: any[] = [];

    if (currentModuleJobs?.jobs && currentModuleJobs.jobs.length > 0) {
      jobs = currentModuleJobs.jobs;
    } else if (permissionsData?.permissions) {
      const coreModule = permissionsData.permissions.find(
        (module: any) => module.moduleName.toLowerCase() === 'core'
      );
      if (coreModule?.jobs) {
        jobs = coreModule.jobs;
      }
    }

    // Start with Dashboard in main group
    const groups: MenuGroup[] = [
      {
        id: 'main',
        title: '',
        items: [
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: 'pi pi-home',
            iconBgColor: 'bg-blue-600',
            route: '/dashboard',
          },
        ],
      },
    ];

    // If no permissions data, show all menu items from metadata
    if (jobs.length === 0) {
      const groupedItems: Record<string, MenuItem[]> = {};
      Object.entries(MENU_METADATA).forEach(([key, metadata]) => {
        const menuItem: MenuItem = {
          id: key,
          label: capitalizeJobName(key),
          icon: metadata.icon,
          iconBgColor: metadata.iconBgColor,
          route: metadata.route,
        };
        if (!groupedItems[metadata.group]) {
          groupedItems[metadata.group] = [];
        }
        groupedItems[metadata.group].push(menuItem);
      });

      const groupOrder = ['Monitoring', 'Masters', 'Configurations', 'To be disabled'];
      groupOrder
        .filter((groupName) => groupedItems[groupName]?.length > 0)
        .forEach((groupName) => {
          groups.push({
            id: groupName.toLowerCase().replace(/\s+/g, '-'),
            title: groupName,
            items: groupedItems[groupName],
          });
        });

      return groups;
    }

    // Group jobs by category
    const groupedItems: Record<string, MenuItem[]> = {};

    jobs.forEach((job: any) => {
      if (job.isMenu === false) return;
      const jobNameNormalized = normalizeJobName(job.jobName);
      const metadata = MENU_METADATA[jobNameNormalized];
      if (!metadata) return;

      const menuItem: MenuItem & { displayOrder?: number } = {
        id: jobNameNormalized,
        label: job.displayName || capitalizeJobName(job.jobName),
        icon: metadata.icon,
        iconBgColor: metadata.iconBgColor,
        route: metadata.route,
      };

      (menuItem as any).displayOrder = job.displayOrder ?? 99;

      if (!groupedItems[metadata.group]) {
        groupedItems[metadata.group] = [];
      }
      groupedItems[metadata.group].push(menuItem);
    });

    const groupOrder = ['Monitoring', 'Masters', 'Configurations', 'To be disabled', 'Other'];

    groupOrder
      .filter((groupName) => groupedItems[groupName] && groupedItems[groupName].length > 0)
      .forEach((groupName) => {
        groups.push({
          id: groupName.toLowerCase().replace(/\s+/g, '-'),
          title: groupName,
          items: groupedItems[groupName].sort((a, b) => {
            const orderA = (a as any).displayOrder ?? 99;
            const orderB = (b as any).displayOrder ?? 99;
            return orderA - orderB;
          }),
        });
      });

    return groups;
  }, [currentModuleJobs, permissionsData]);

  // Get current route for active state
  const currentRoute = location.pathname;

  // Handle menu item click
  const handleMenuItemClick = useCallback((item: MenuItem) => {
    if (item.route) {
      navigate(item.route);
    }
  }, [navigate]);

  // Content container style
  const contentContainerStyle = {
    width: '100%',
    padding: '0.5rem 1rem',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
  };

  return (
    <SideMenuLayout
      menuItems={menuGroups}
      activeRoute={currentRoute}
      useNavLink={false}
      onMenuItemClick={handleMenuItemClick}
      maxVisibleItems={10}
      showSearch={true}
      searchPlaceholder="Search menu..."
      collapsible={true}
      defaultCollapsed={false}
      sidebarWidth={240}
      testId="CoreService.SideMenu"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <Breadcrumb
        config={{
          basePath: '',
          moduleName: 'AI & Engineering foundation',
          routeLabels: routeLabels,
          dashboardPath: '/dashboard',
          mfeDashboardPath: '/dashboard',
        }}
      />
      <div style={contentContainerStyle}>
        {children}
      </div>
    </SideMenuLayout>
  );
};

export default MainLayout;
