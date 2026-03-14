/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import {
  getUserRoleMappingById,
  deleteUserRoleMapping,
  type UserRoleMapping,
} from '../../services/user-role-mapping.service';
import { masterService } from '../../services/master.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';

const UserRoleMappingView = () => {
  const navigate = useAppNavigate();
  const location = useLocation();

  // Determine base path based on current URL
  const basePath = location.pathname.includes('user-role-permissions')
    ? '/user-role-permissions'
    : '/user-role-mappings';
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'user-role-mappings',
    basePath: basePath,
  });

  const [data, setData] = useState<UserRoleMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show user name instead of UUID
  useBreadcrumbTitle(data?.user?.firstName ? `${data.user.firstName} ${data.user.lastName}` : null);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(data?.createdBy, data?.updatedBy);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await getUserRoleMappingById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch user role mapping'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await deleteUserRoleMapping(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete user role mapping'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'User role mapping not found'} className="mb-4 w-full" />
        <Button
          label="Back to User Role Mappings"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Count permissions
  const additionalPermCount = data.additionalPermissions?.reduce(
    (acc, module) => acc + module.jobs.reduce((jAcc, job) => jAcc + job.permissions.length, 0),
    0
  ) || 0;

  const exclusionPermCount = data.exclusionPermissions?.reduce(
    (acc, module) => acc + module.jobs.reduce((jAcc, job) => jAcc + job.permissions.length, 0),
    0
  ) || 0;

  return (
    <div className="py-4 px-4" data-testid="SCR-UserRoleMapping-View">
      {/* Header Section */}
      <div className="mb-3">
        <Button
          label="Back to User Role Mappings"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          onClick={() => navigateToList()}
          className="mb-3"
        />

        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">User Role Mapping Details</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">View role assignment and custom permissions</p>
          </div>

          {/* Hide Edit/Delete buttons for deleted records */}
          {!((data as any).isDelete || data.isDeleted) && (
            <div className="flex gap-2">
              <Button
                label="Edit"
                icon="pi pi-pencil"
                severity="secondary"
                outlined
                onClick={handleEdit}
              />
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                outlined
                onClick={handleDeleteClick}
              />
            </div>
          )}
        </div>
      </div>

      {/* User Header */}
      <div className="flex items-start gap-4 mb-3">
        <div className="w-16 h-16 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
          <i className="pi pi-users text-indigo-600 dark:text-indigo-400" style={{ fontSize: '1.5rem' }} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {data.user?.name || `${data.user?.firstName} ${data.user?.lastName}` || 'Unknown User'}
            </h2>
            {(data as any).isDelete || data.isDeleted ? (
              <Tag value="Deleted" severity="danger" />
            ) : (
              <Tag value="Active" severity="success" />
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {data.user?.userId || '-'} &bull; {data.role?.name || 'No role'}
          </p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">User</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {data.user?.name || `${data.user?.firstName} ${data.user?.lastName}` || '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">User ID</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.user?.userId || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Assigned Role</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.role?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Unit</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.unit?.name || '-'}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Permission Summary</label>
              <div className="flex gap-2 mt-1">
                <Tag value={`+${additionalPermCount} additional`} severity="success" />
                <Tag value={`-${exclusionPermCount} excluded`} severity="warning" />
              </div>
            </div>
          </div>
        </div>

        {/* Audit Information */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{formatDateTime(data.createdAt)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{createdByName}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{formatDateTime(data.updatedAt)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{updatedByName}</p>
            </div>
          </div>
        </div>

        {/* Additional Permissions Section */}
        {data.additionalPermissions && data.additionalPermissions.length > 0 && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Additional Permissions</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Extra permissions granted beyond the assigned role
            </p>

            <Accordion multiple>
              {data.additionalPermissions.map((module) => (
                <AccordionTab
                  key={module.moduleId}
                  header={
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">{module.moduleName}</span>
                      <Tag value={`${module.jobs.length} Jobs`} severity="success" />
                    </div>
                  }
                >
                  <div className="pl-4">
                    {module.jobs.map((job, jobIndex) => (
                      <div key={job.jobName} className={jobIndex < module.jobs.length - 1 ? 'mb-4 pb-4 border-b border-gray-200 dark:border-gray-700' : ''}>
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-medium text-gray-900 dark:text-white">{job.jobName}</p>
                          <Tag
                            value={job.isMenu ? 'Menu' : 'Hidden'}
                            severity={job.isMenu ? 'success' : 'secondary'}
                            className="text-xs"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Order: {job.displayOrder ?? 0}
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {job.permissions.map((perm) => (
                            <Tag key={perm.name} value={perm.name} severity="success" className="capitalize" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionTab>
              ))}
            </Accordion>
          </div>
        )}

        {/* Exclusion Permissions Section */}
        {data.exclusionPermissions && data.exclusionPermissions.length > 0 && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Excluded Permissions</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Permissions removed from the assigned role
            </p>

            <Accordion multiple>
              {data.exclusionPermissions.map((module) => (
                <AccordionTab
                  key={module.moduleId}
                  header={
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-orange-600">{module.moduleName}</span>
                      <Tag value={`${module.jobs.length} Jobs`} severity="warning" />
                    </div>
                  }
                >
                  <div className="pl-4">
                    {module.jobs.map((job, jobIndex) => (
                      <div key={job.jobName} className={jobIndex < module.jobs.length - 1 ? 'mb-4 pb-4 border-b border-gray-200 dark:border-gray-700' : ''}>
                        <div className="flex items-center gap-3 mb-2">
                          <p className="font-medium text-gray-900 dark:text-white">{job.jobName}</p>
                          <Tag
                            value={job.isMenu ? 'Menu' : 'Hidden'}
                            severity={job.isMenu ? 'warning' : 'secondary'}
                            className="text-xs"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Order: {job.displayOrder ?? 0}
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {job.permissions.map((perm) => (
                            <Tag key={perm.name} value={perm.name} severity="warning" className="capitalize line-through" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionTab>
              ))}
            </Accordion>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        visible={deleteDialogOpen}
        onCancel={handleDeleteCancel}
        onDelete={handleDeleteConfirm}
        message="Are you sure you want to delete this user role mapping? This action cannot be undone."
        testId="UserRoleMappingView.Dialog.Delete"
      />
    </div>
  );
};

export default UserRoleMappingView;
