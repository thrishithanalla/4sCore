/**
 * Route Permissions Configuration
 * Maps routes to their required job permissions
 * Frontend-controlled - no backend dependency
 */

export interface RoutePermission {
  route: string;
  job: string;
}

// Route to Job mapping - defines which job permission is required for each route
export const ROUTE_PERMISSIONS: RoutePermission[] = [
  // Dashboard - no specific permission required (authenticated users can access)
  { route: '/dashboard', job: '' },

  // ============== Core Module ==============
  // Monitoring
  { route: '/error-logs', job: 'errorlogs' },
  { route: '/log-transaction', job: 'logtransaction' },
  { route: '/prompt-executions', job: 'promptexecutions' },
  { route: '/feedbacks', job: 'feedbacks' },
  { route: '/notifications', job: 'notifications' },

  // Masters
  { route: '/units', job: 'units' },
  { route: '/personnel', job: 'personnel' },
  { route: '/user-onboarding', job: 'personnel' }, // User onboarding uses personnel job
  { route: '/unit-villages', job: 'unitvillages' },
  { route: '/districts', job: 'district' },
  { route: '/mandals', job: 'mandals' },
  { route: '/departments', job: 'departments' },
  { route: '/rank', job: 'rank' },
  { route: '/unit-types', job: 'unittype' },
  { route: '/levels', job: 'levels' },
  { route: '/posts', job: 'post' },
  { route: '/modules', job: 'modules' },
  { route: '/jobs', job: 'jobs' },
  { route: '/permissions', job: 'permissions' },
  { route: '/error-master', job: 'errormaster' },
  { route: '/log-master', job: 'logmaster' },
  { route: '/notification-master', job: 'notificationmaster' },
  { route: '/feedback-master', job: 'feedbackmaster' },
  { route: '/designation-master', job: 'designationmaster' },
  { route: '/approval-flow-master', job: 'approvalflowmaster' },
  { route: '/prompt-table', job: 'prompttable' },
  { route: '/module-job-mappings', job: 'modulejobmappings' },

  // Configurations
  { route: '/roles', job: 'roles' },
  { route: '/system-roles', job: 'systemroles' },
  { route: '/post-role-mappings', job: 'postrolemappings' },
  { route: '/value-sets', job: 'valuesets' },
  { route: '/permission-mappings', job: 'permissionmappings' },
  { route: '/user-role-mappings', job: 'userrolepermissions' },
  { route: '/user-role-permissions', job: 'userrolepermissions' },
  { route: '/approval-chains', job: 'approvalchain' },

  // Other Core
  { route: '/file-uploads', job: 'fileupload' },
  { route: '/module-hierarchy', job: 'modulehierarchy' },
  { route: '/test_masters', job: 'testmaster' },

  // ============== 91CrPC Module ==============
  { route: '/crpc-requestss', job: 'crpcrequests' },
  { route: '/crpc-request-pipeliness', job: 'crpcrequestpipelines' },
  { route: '/upload', job: 'datareceived' },
  { route: '/consolidate-data', job: 'consolidatedrequests' },
  { route: '/service-master', job: 'servicemaster' },
  { route: '/operator-list-master', job: 'operatorslist' },
  { route: '/operator-service-mapping-master', job: 'operatorsservicelist' },
  { route: '/data-received-filess', job: 'datareceivedfiles' },
  { route: '/crpc-request-generators', job: 'crpcrequestgenerator' },
  { route: '/pending-approvals', job: 'mypendingapprovals' },
  { route: '/my-requests', job: 'myrequest' },
  { route: '/service-management', job: 'servicemanagement' },

  // ============== CDR IPDR Module ==============
  { route: '/investigation-documents', job: 'investigationdocument' },
  { route: '/investigation-task-executions', job: 'investigationtaskexecution' },
  { route: '/investigations', job: 'investigation' },
  { route: '/investigation-document-types', job: 'investigationdocumenttype' },
  { route: '/investigation-tasks', job: 'investigationtask' },
];

/**
 * Get the required job for a route path
 * Matches the base route (ignores /create, /:id, /edit suffixes)
 * Handles /core prefix when accessed via main_fe
 */
export const getJobForRoute = (pathname: string): string | null => {
  // Normalize path - get base route
  const segments = pathname.split('/').filter(Boolean);

  // If first segment is 'core' (MFE prefix), use second segment
  // e.g., /core/personnel/:id -> personnel
  const baseSegment = segments[0] === 'core' && segments.length > 1
    ? segments[1]
    : segments[0];

  const basePath = '/' + baseSegment;

  const permission = ROUTE_PERMISSIONS.find(p => p.route === basePath);
  return permission?.job ?? null;
};

/**
 * Check if a job exists in user's permissions
 * First checks currentModuleJobs, then falls back to full permissions array for Core module
 */
export const hasJobPermission = (
  jobName: string,
  permissionsData: any
): boolean => {
  if (!jobName) return true; // Empty job = no permission required

  const normalizedJobName = jobName.toLowerCase().replace(/[-_\s]/g, '');

  // First, check currentModuleJobs if it's for Core module
  if (
    permissionsData?.currentModuleJobs?.moduleName?.toLowerCase() === 'core' &&
    permissionsData?.currentModuleJobs?.jobs?.length > 0
  ) {
    return permissionsData.currentModuleJobs.jobs.some((job: any) => {
      const normalized = job.jobName.toLowerCase().replace(/[-_\s]/g, '');
      return normalized === normalizedJobName;
    });
  }

  // Fallback: Check the full permissions array for Core module
  // This handles the case when navigating from another module and currentModuleJobs hasn't updated yet
  if (permissionsData?.permissions?.length > 0) {
    const coreModule = permissionsData.permissions.find(
      (module: any) => module.moduleName?.toLowerCase() === 'core'
    );
    if (coreModule?.jobs?.length > 0) {
      return coreModule.jobs.some((job: any) => {
        const normalized = job.jobName.toLowerCase().replace(/[-_\s]/g, '');
        return normalized === normalizedJobName;
      });
    }
  }

  return false;
};
