import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/layout/protected-route';
import MainLayout from './components/layout/main-layout';
import Login from './pages/login';

// Pages - Static imports
import Dashboard from './pages/dashboard';
import LogsPage from './pages/app-logs';
import ErrorMasterForm from './pages/error-master/error-master-form';
import ErrorMasterList from './pages/error-master/error-master-list';
import ErrorMasterView from './pages/error-master/error-master-view';
import NotificationMasterForm from './pages/notification-master/notification-master-form';
// import NotificationMasterNotWorking from './pages/notification-master/notification-master-not-working';
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
import SystemRolesList from './pages/system-roles/system-roles-list';
import SystemRoleForm from './pages/system-roles/system-role-form';
import SystemRoleView from './pages/system-roles/system-role-view';
import PostRoleMappingsList from './pages/post-role-mappings/post-role-mappings-list';
import PostRoleMappingForm from './pages/post-role-mappings/post-role-mapping-form';
import PostRoleMappingView from './pages/post-role-mappings/post-role-mapping-view';
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
import FeedbackPageView from './pages/feedback/feedback-page-view';

import NotFound from './pages/not-found';
import UserOnboarding from './pages/user-onboarding/user-onboarding';
import AssignmentsList from './pages/assignments/assignments-list';
import AssignmentForm from './pages/assignments/assignment-form';
import AssignmentView from './pages/assignments/assignment-view';
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
import NotificationsList from './pages/notifications/notifications-list';
import ApprovalChainsList from './pages/approval-chains/approval-chains-list';
import TestMastersList from './pages/test-masters/test-masters-list';
import OrgStructureView from './pages/org-structure/org-structure-view';

export default function CoreService() {
  return (
    <Routes>
      {/* Login Route */}
      <Route path="/login" element={<Login />} />

      {/* All routes are protected */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Dashboard />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Logs Route */}
      <Route
        path="/logs"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LogsPage />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Error Logs Route */}
      <Route
        path="/error-logs"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ErrorLogsMonitorList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Units Routes */}
      <Route
        path="/units"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/units/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/units/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/units/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Personnel Routes */}
      <Route
        path="/personnel"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PersonnelList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personnel/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PersonnelForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personnel/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PersonnelView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/personnel/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserOnboarding />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Assignments Routes */}
      <Route
        path="/assignments"
        element={
          <ProtectedRoute>
            <MainLayout>
              <AssignmentsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assignments/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <AssignmentForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assignments/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <AssignmentView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assignments/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <AssignmentForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Unit Villages Routes */}
      <Route
        path="/unit-villages"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitVillagesList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/unit-villages/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitVillageForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/unit-villages/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitVillageView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/unit-villages/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitVillageForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Value Sets Routes */}
      <Route
        path="/value-sets"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ValueSetsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/value-sets/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ValueSetForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/value-sets/:key/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ValueSetForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/value-sets/:key"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ValueSetView />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Error Master Routes */}
      <Route
        path="/error-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ErrorMasterList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/error-master/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ErrorMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/error-master/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ErrorMasterView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/error-master/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ErrorMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Prompts Routes */}
      <Route
        path="/prompt-table"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PromptList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prompt-table/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PromptForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prompt-table/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PromptView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prompt-table/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PromptForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Notification Master Routes */}
      <Route
        path="/notification-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <NotificationMastersList />
              {/* <NotificationMasterNotWorking /> */}
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notification-master/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <NotificationMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notification-master/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <NotificationMasterView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notification-master/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <NotificationMasterForm />
              {/* <NotificationMasterNotWorking /> */}
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Roles Routes */}
      <Route
        path="/roles"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RolesList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/roles/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RoleForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/roles/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RoleView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/roles/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RoleForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* System Roles Routes */}
      <Route
        path="/system-roles"
        element={
          <ProtectedRoute>
            <MainLayout>
              <SystemRolesList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/system-roles/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <SystemRoleForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/system-roles/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <SystemRoleView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/system-roles/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <SystemRoleForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Post Role Mappings Routes */}
      <Route
        path="/post-role-mappings"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostRoleMappingsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/post-role-mappings/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostRoleMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/post-role-mappings/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostRoleMappingView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/post-role-mappings/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostRoleMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Districts Routes */}
      <Route
        path="/districts"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DistrictsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/districts/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DistrictForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/districts/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DistrictView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/districts/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DistrictForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Mandals Routes */}
      <Route
        path="/mandals"
        element={
          <ProtectedRoute>
            <MainLayout>
              <MandalsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mandals/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <MandalForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mandals/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <MandalView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/mandals/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <MandalForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Unit Types Routes */}
      <Route
        path="/unit-types"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitTypesList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/unit-types/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitTypeForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/unit-types/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitTypeView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/unit-types/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UnitTypeForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Levels (Hierarchy Levels) Routes */}
      <Route
        path="/levels"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LevelsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/levels/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LevelForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/levels/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LevelView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/levels/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LevelForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Posts Routes */}
      <Route
        path="/posts"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/posts/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/posts/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/posts/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PostForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Departments Routes */}
      <Route
        path="/departments"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DepartmentsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/departments/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DepartmentForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/departments/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DepartmentView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/departments/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DepartmentForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Ranks Routes */}
      <Route
        path="/rank"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RanksList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/rank/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RankForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/rank/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RankView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/rank/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <RankForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Modules Routes */}
      <Route
        path="/modules"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModulesList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Jobs Routes */}
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <MainLayout>
              <JobsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <JobForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <JobView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <JobForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Permissions Routes */}
      <Route
        path="/permissions"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/permissions/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/permissions/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/permissions/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Log Master Routes */}
      <Route
        path="/log-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LogMasterList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/log-master/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LogMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/log-master/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LogMasterView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/log-master/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LogMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* User Role Mappings Routes */}
      <Route
        path="/user-role-mappings"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-role-mappings/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-role-mappings/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-role-mappings/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* User Role Permissions Routes - Alias for User Role Mappings */}
      <Route
        path="/user-role-permissions"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-role-permissions/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-role-permissions/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-role-permissions/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserRoleMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Permission Mappings Routes */}
      <Route
        path="/permission-mappings"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionMappingList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/permission-mappings/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/permission-mappings/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionMappingView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/permission-mappings/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PermissionMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Module-Job Mappings Routes */}
      <Route
        path="/module-job-mappings"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleJobMappingList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/module-job-mappings/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleJobMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/module-job-mappings/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleJobMappingView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/module-job-mappings/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleJobMappingForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Feedback Master Routes */}
      <Route
        path="/feedback-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FeedbackMasterList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/feedback-master/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FeedbackMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/feedback-master/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FeedbackMasterView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/feedback-master/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FeedbackMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
    {/* Feedback Page Routes */}
      <Route
        path="/feedbacks"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FeedbackPageView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Designation Master Routes - Full CRUD with name and designationCd */}
      {/* List: /designation-master - Shows all designations */}
      <Route
        path="/designation-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DesignationMasterList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Create: /designation-master/create - Create new designation */}
      <Route
        path="/designation-master/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DesignationMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* View: /designation-master/:id - Shows designation details */}
      <Route
        path="/designation-master/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DesignationMasterView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Edit: /designation-master/:id/edit - Updates designation */}
      <Route
        path="/designation-master/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <DesignationMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Approval Flow Master Routes - Full CRUD with module, unit, role associations */}
      {/* List: /approval-flow-master - Shows all approval flows */}
      <Route
        path="/approval-flow-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ApprovalFlowMasterList />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Create: /approval-flow-master/create - Create new approval flow */}
      <Route
        path="/approval-flow-master/create"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ApprovalFlowMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* View: /approval-flow-master/:id - Shows approval flow details */}
      <Route
        path="/approval-flow-master/:id"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ApprovalFlowMasterView />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      {/* Edit: /approval-flow-master/:id/edit - Updates approval flow */}
      <Route
        path="/approval-flow-master/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ApprovalFlowMasterForm />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Log Transaction Routes - Application Logs Monitor */}
      <Route
        path="/log-transaction"
        element={
          <ProtectedRoute>
            <MainLayout>
              <LogTransactionList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Module Hierarchy Routes - View modules, jobs, and permissions */}
      <Route
        path="/module-hierarchy"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ModuleHierarchyList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* File Upload Routes - File management */}
      <Route
        path="/file-uploads"
        element={
          <ProtectedRoute>
            <MainLayout>
              <FileUploadList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Prompt Executions Routes - AI Prompts Monitor */}
      <Route
        path="/prompt-executions"
        element={
          <ProtectedRoute>
            <MainLayout>
              <PromptExecutionsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* User Onboarding Routes - Create/Edit Personnel with Role Assignment */}
      <Route
        path="/user-onboarding"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserOnboarding />
            </MainLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-onboarding/:id/edit"
        element={
          <ProtectedRoute>
            <MainLayout>
              <UserOnboarding />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Notifications Route - Work in Progress */}
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <MainLayout>
              <NotificationsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Approval Chains Route - Work in Progress */}
      <Route
        path="/approval-chains"
        element={
          <ProtectedRoute>
            <MainLayout>
              <ApprovalChainsList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Test Masters Route - Work in Progress */}
      <Route
        path="/test-master"
        element={
          <ProtectedRoute>
            <MainLayout>
              <TestMastersList />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Organizational Structure Route */}
      <Route
        path="/org-structure"
        element={
          <ProtectedRoute>
            <MainLayout>
              <OrgStructureView />
            </MainLayout>
          </ProtectedRoute>
        }
      />

      {/* Default Route */}
      <Route path="/" element={<Navigate to="dashboard" replace />} />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
