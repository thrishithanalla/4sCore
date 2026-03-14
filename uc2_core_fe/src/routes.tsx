/**
 * Route configuration for data router (createBrowserRouter)
 * This enables useBlocker and other data router features
 */

import { Navigate, RouteObject } from 'react-router-dom';
import ProtectedRoute from './components/layout/protected-route';
import MainLayout from './components/layout/main-layout';

// Pages
import Dashboard from './pages/dashboard';
import LogsPage from './pages/app-logs';
import ErrorLogsPage from './pages/app-logs/error-logs';
import ErrorMasterForm from './pages/error-master/error-master-form';
import ErrorMasterList from './pages/error-master/error-master-list';
import ErrorMasterView from './pages/error-master/error-master-view';
import NotificationMasterForm from './pages/notification-master/notification-master-form';
import NotificationMastersList from './pages/notification-master/notification-master-list';
import NotificationMasterView from './pages/notification-master/notification-mater-view';
import PersonnelForm from './pages/personnel/personnel-form';
import PersonnelList from './pages/personnel/personnel-list';
import PersonnelView from './pages/personnel/personnel-view';
import UnitVillageForm from './pages/unit-villages/unit-village-form';
import UnitVillageView from './pages/unit-villages/unit-village-view';
import UnitVillagesList from './pages/unit-villages/unit-villages-list';
import UnitForm from './pages/units/unit-form';
import UnitView from './pages/units/unit-view';
import UnitsList from './pages/units/units-list';
import ValueSetForm from './pages/value-sets/value-set-form';
import ValueSetView from './pages/value-sets/value-set-view';
import ValueSetsList from './pages/value-sets/value-sets-list';
import PromptForm from './pages/prompts/prompt-form';
import PromptList from './pages/prompts/prompt-list';
import PromptView from './pages/prompts/prompt-view';
import RolesList from './pages/roles/roles-list';
import RoleForm from './pages/roles/role-form';
import RoleView from './pages/roles/role-view';
import DistrictsList from './pages/districts/districts-list';
import DistrictForm from './pages/districts/district-form';
import DistrictView from './pages/districts/district-view';
import MandalsList from './pages/mandals/mandals-list';
import MandalForm from './pages/mandals/mandal-form';
import MandalView from './pages/mandals/mandal-view';
import UnitTypesList from './pages/unit-types/unit-type-list';
import UnitTypeForm from './pages/unit-types/unit-type-form';
import UnitTypeView from './pages/unit-types/unit-type-view';
import LevelsList from './pages/levels/level-list';
import LevelForm from './pages/levels/level-form';
import LevelView from './pages/levels/level-view';
import PostsList from './pages/posts/post-list';
import PostForm from './pages/posts/post-form';
import PostView from './pages/posts/post-view';
import DepartmentsList from './pages/departments/department-list';
import DepartmentForm from './pages/departments/department-form';
import DepartmentView from './pages/departments/department-view';
import RanksList from './pages/ranks/rank-list';
import RankForm from './pages/ranks/rank-form';
import RankView from './pages/ranks/rank-view';
import ModulesList from './pages/modules/module-list';
import ModuleForm from './pages/modules/module-form';
import ModuleView from './pages/modules/module-view';
import JobsList from './pages/jobs/job-list';
import JobForm from './pages/jobs/job-form';
import JobView from './pages/jobs/job-view';
import PermissionsList from './pages/permissions/permission-list';
import PermissionForm from './pages/permissions/permission-form';
import PermissionView from './pages/permissions/permission-view';
import LogMasterList from './pages/log-master/log-master-list';
import LogMasterForm from './pages/log-master/log-master-form';
import LogMasterView from './pages/log-master/log-master-view';
import UserRoleMappingList from './pages/user-role-mappings/user-role-mapping-list';
import UserRoleMappingForm from './pages/user-role-mappings/user-role-mapping-form';
import UserRoleMappingView from './pages/user-role-mappings/user-role-mapping-view';
import PermissionMappingList from './pages/permission-mappings/permission-mapping-list';
import PermissionMappingForm from './pages/permission-mappings/permission-mapping-form';
import PermissionMappingView from './pages/permission-mappings/permission-mapping-view';
import ModuleJobMappingList from './pages/module-job-mappings/module-job-mapping-list';
import ModuleJobMappingForm from './pages/module-job-mappings/module-job-mapping-form';
import ModuleJobMappingView from './pages/module-job-mappings/module-job-mapping-view';
import FeedbackMasterList from './pages/feedback-master/feedback-master-list';
import FeedbackMasterForm from './pages/feedback-master/feedback-master-form';
import FeedbackMasterView from './pages/feedback-master/feedback-master-view';
import DesignationMasterList from './pages/designation-master/designation-master-list';
import DesignationMasterForm from './pages/designation-master/designation-master-form';
import DesignationMasterView from './pages/designation-master/designation-master-view';
import ApprovalFlowMasterList from './pages/approval-flow-master/approval-flow-master-list';
import ApprovalFlowMasterForm from './pages/approval-flow-master/approval-flow-master-form';
import ApprovalFlowMasterView from './pages/approval-flow-master/approval-flow-master-view';
import LogTransactionList from './pages/log-transaction/log-transaction-list';
import ModuleHierarchyList from './pages/module-hierarchy/module-hierarchy-list';
import FileUploadList from './pages/file-upload/file-upload-list';
import ErrorLogsMonitorList from './pages/error-logs-monitor/error-logs-monitor-list';
import PromptExecutionsList from './pages/prompt-executions/prompt-executions-list';
import UserOnboarding from './pages/user-onboarding/user-onboarding';
import OrgStructureView from './pages/org-structure/org-structure-view';
import NotFound from './pages/not-found';

// Helper to wrap a component with ProtectedRoute and MainLayout
const withLayout = (Component: React.ComponentType) => (
  <ProtectedRoute>
    <MainLayout>
      <Component />
    </MainLayout>
  </ProtectedRoute>
);

export const routes: RouteObject[] = [
  // Dashboard
  { path: '/dashboard', element: withLayout(Dashboard) },

  // Logs Routes
  { path: '/logs', element: withLayout(LogsPage) },
  { path: '/error-logs', element: withLayout(ErrorLogsMonitorList) },

  // Units Routes
  { path: '/units', element: withLayout(UnitsList) },
  { path: '/units/create', element: withLayout(UnitForm) },
  { path: '/units/:id', element: withLayout(UnitView) },
  { path: '/units/:id/edit', element: withLayout(UnitForm) },

  // Personnel Routes
  { path: '/personnel', element: withLayout(PersonnelList) },
  { path: '/personnel/create', element: withLayout(PersonnelForm) },
  { path: '/personnel/:id', element: withLayout(PersonnelView) },
  { path: '/personnel/:id/edit', element: withLayout(PersonnelForm) },

  // Unit Villages Routes
  { path: '/unit-villages', element: withLayout(UnitVillagesList) },
  { path: '/unit-villages/create', element: withLayout(UnitVillageForm) },
  { path: '/unit-villages/:id', element: withLayout(UnitVillageView) },
  { path: '/unit-villages/:id/edit', element: withLayout(UnitVillageForm) },

  // Value Sets Routes
  { path: '/value-sets', element: withLayout(ValueSetsList) },
  { path: '/value-sets/create', element: withLayout(ValueSetForm) },
  { path: '/value-sets/:key/edit', element: withLayout(ValueSetForm) },
  { path: '/value-sets/:key', element: withLayout(ValueSetView) },

  // Error Master Routes
  { path: '/error-master', element: withLayout(ErrorMasterList) },
  { path: '/error-master/create', element: withLayout(ErrorMasterForm) },
  { path: '/error-master/:id', element: withLayout(ErrorMasterView) },
  { path: '/error-master/:id/edit', element: withLayout(ErrorMasterForm) },

  // Prompts Routes
  { path: '/prompt-table', element: withLayout(PromptList) },
  { path: '/prompt-table/create', element: withLayout(PromptForm) },
  { path: '/prompt-table/:id', element: withLayout(PromptView) },
  { path: '/prompt-table/:id/edit', element: withLayout(PromptForm) },

  // Notification Master Routes
  { path: '/notification-master', element: withLayout(NotificationMastersList) },
  { path: '/notification-master/create', element: withLayout(NotificationMasterForm) },
  { path: '/notification-master/:id', element: withLayout(NotificationMasterView) },
  { path: '/notification-master/:id/edit', element: withLayout(NotificationMasterForm) },

  // Roles Routes
  { path: '/roles', element: withLayout(RolesList) },
  { path: '/roles/create', element: withLayout(RoleForm) },
  { path: '/roles/:id', element: withLayout(RoleView) },
  { path: '/roles/:id/edit', element: withLayout(RoleForm) },

  // Districts Routes
  { path: '/districts', element: withLayout(DistrictsList) },
  { path: '/districts/create', element: withLayout(DistrictForm) },
  { path: '/districts/:id', element: withLayout(DistrictView) },
  { path: '/districts/:id/edit', element: withLayout(DistrictForm) },

  // Mandals Routes
  { path: '/mandals', element: withLayout(MandalsList) },
  { path: '/mandals/create', element: withLayout(MandalForm) },
  { path: '/mandals/:id', element: withLayout(MandalView) },
  { path: '/mandals/:id/edit', element: withLayout(MandalForm) },

  // Unit Types Routes
  { path: '/unit-types', element: withLayout(UnitTypesList) },
  { path: '/unit-types/create', element: withLayout(UnitTypeForm) },
  { path: '/unit-types/:id', element: withLayout(UnitTypeView) },
  { path: '/unit-types/:id/edit', element: withLayout(UnitTypeForm) },

  // Levels (Hierarchy Levels) Routes
  { path: '/levels', element: withLayout(LevelsList) },
  { path: '/levels/create', element: withLayout(LevelForm) },
  { path: '/levels/:id', element: withLayout(LevelView) },
  { path: '/levels/:id/edit', element: withLayout(LevelForm) },

  // Posts Routes
  { path: '/posts', element: withLayout(PostsList) },
  { path: '/posts/create', element: withLayout(PostForm) },
  { path: '/posts/:id', element: withLayout(PostView) },
  { path: '/posts/:id/edit', element: withLayout(PostForm) },

  // Departments Routes
  { path: '/departments', element: withLayout(DepartmentsList) },
  { path: '/departments/create', element: withLayout(DepartmentForm) },
  { path: '/departments/:id', element: withLayout(DepartmentView) },
  { path: '/departments/:id/edit', element: withLayout(DepartmentForm) },

  // Ranks Routes
  { path: '/rank', element: withLayout(RanksList) },
  { path: '/rank/create', element: withLayout(RankForm) },
  { path: '/rank/:id', element: withLayout(RankView) },
  { path: '/rank/:id/edit', element: withLayout(RankForm) },

  // Modules Routes
  { path: '/modules', element: withLayout(ModulesList) },
  { path: '/modules/create', element: withLayout(ModuleForm) },
  { path: '/modules/:id', element: withLayout(ModuleView) },
  { path: '/modules/:id/edit', element: withLayout(ModuleForm) },

  // Jobs Routes
  { path: '/jobs', element: withLayout(JobsList) },
  { path: '/jobs/create', element: withLayout(JobForm) },
  { path: '/jobs/:id', element: withLayout(JobView) },
  { path: '/jobs/:id/edit', element: withLayout(JobForm) },

  // Permissions Routes
  { path: '/permissions', element: withLayout(PermissionsList) },
  { path: '/permissions/create', element: withLayout(PermissionForm) },
  { path: '/permissions/:id', element: withLayout(PermissionView) },
  { path: '/permissions/:id/edit', element: withLayout(PermissionForm) },

  // Log Master Routes
  { path: '/log-master', element: withLayout(LogMasterList) },
  { path: '/log-master/create', element: withLayout(LogMasterForm) },
  { path: '/log-master/:id', element: withLayout(LogMasterView) },
  { path: '/log-master/:id/edit', element: withLayout(LogMasterForm) },

  // User Role Mappings Routes
  { path: '/user-role-mappings', element: withLayout(UserRoleMappingList) },
  { path: '/user-role-mappings/create', element: withLayout(UserRoleMappingForm) },
  { path: '/user-role-mappings/:id', element: withLayout(UserRoleMappingView) },
  { path: '/user-role-mappings/:id/edit', element: withLayout(UserRoleMappingForm) },

  // User Role Permissions Routes (alias)
  { path: '/user-role-permissions', element: withLayout(UserRoleMappingList) },
  { path: '/user-role-permissions/create', element: withLayout(UserRoleMappingForm) },
  { path: '/user-role-permissions/:id', element: withLayout(UserRoleMappingView) },
  { path: '/user-role-permissions/:id/edit', element: withLayout(UserRoleMappingForm) },

  // Permission Mappings Routes
  { path: '/permission-mappings', element: withLayout(PermissionMappingList) },
  { path: '/permission-mappings/create', element: withLayout(PermissionMappingForm) },
  { path: '/permission-mappings/:id', element: withLayout(PermissionMappingView) },
  { path: '/permission-mappings/:id/edit', element: withLayout(PermissionMappingForm) },

  // Module-Job Mappings Routes
  { path: '/module-job-mappings', element: withLayout(ModuleJobMappingList) },
  { path: '/module-job-mappings/create', element: withLayout(ModuleJobMappingForm) },
  { path: '/module-job-mappings/:id', element: withLayout(ModuleJobMappingView) },
  { path: '/module-job-mappings/:id/edit', element: withLayout(ModuleJobMappingForm) },

  // Feedback Master Routes
  { path: '/feedback-master', element: withLayout(FeedbackMasterList) },
  { path: '/feedback-master/create', element: withLayout(FeedbackMasterForm) },
  { path: '/feedback-master/:id', element: withLayout(FeedbackMasterView) },
  { path: '/feedback-master/:id/edit', element: withLayout(FeedbackMasterForm) },

  // Designation Master Routes
  { path: '/designation-master', element: withLayout(DesignationMasterList) },
  { path: '/designation-master/create', element: withLayout(DesignationMasterForm) },
  { path: '/designation-master/:id', element: withLayout(DesignationMasterView) },
  { path: '/designation-master/:id/edit', element: withLayout(DesignationMasterForm) },

  // Approval Flow Master Routes
  { path: '/approval-flow-master', element: withLayout(ApprovalFlowMasterList) },
  { path: '/approval-flow-master/create', element: withLayout(ApprovalFlowMasterForm) },
  { path: '/approval-flow-master/:id', element: withLayout(ApprovalFlowMasterView) },
  { path: '/approval-flow-master/:id/edit', element: withLayout(ApprovalFlowMasterForm) },

  // Log Transaction Routes
  { path: '/log-transaction', element: withLayout(LogTransactionList) },

  // Module Hierarchy Routes
  { path: '/module-hierarchy', element: withLayout(ModuleHierarchyList) },

  // File Upload Routes
  { path: '/file-uploads', element: withLayout(FileUploadList) },

  // Prompt Executions Routes (AI Prompts Monitor)
  { path: '/prompt-executions', element: withLayout(PromptExecutionsList) },

  // User Onboarding Route
  { path: '/user-onboarding', element: withLayout(UserOnboarding) },

  // Organizational Structure Route (No RBAC)
  { path: '/org-structure', element: withLayout(OrgStructureView) },

  // Default Route
  { path: '/', element: <Navigate to="dashboard" replace /> },

  // 404 Not Found
  { path: '*', element: <NotFound /> },
];
