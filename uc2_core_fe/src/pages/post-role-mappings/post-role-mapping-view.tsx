/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from 'react';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { postRoleMappingsService } from '../../services/post-role-mappings.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import type { PostRoleMapping } from '../../types/post-role-mapping.types';

const PostRoleMappingView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'post-role-mappings',
    basePath: '/post-role-mappings',
  });
  const toast = useRef<Toast>(null);
  const canUpdate = useCanUpdate(JOB_NAMES.POST_ROLE_MAPPINGS);
  const canDelete = useCanDelete(JOB_NAMES.POST_ROLE_MAPPINGS);

  const [data, setData] = useState<PostRoleMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Set breadcrumb title
  useBreadcrumbTitle(data?.postName);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(data?.createdBy, data?.updatedBy);

  useEffect(() => {
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await postRoleMappingsService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch post role mapping'));
      } finally {
        setLoading(false);
      }
    })();
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
      setDeleteLoading(true);
      await postRoleMappingsService.delete(id);
      setDeleteDialogOpen(false);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Post role mapping deleted successfully',
        life: 3000,
      });
      setTimeout(() => {
        navigateToList();
      }, 1000);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete post role mapping'));
      setDeleteDialogOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Message severity="error" text={error || 'Post role mapping not found'} className="mb-4 w-full" />
        <Button
          label="Back to Post Role Mappings"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.POST_ROLE_MAPPINGS}>
      <Toast ref={toast} position="top-right" />
      <div className="py-8 px-6" data-testid="SCR-PostRoleMapping-View">
        {/* Header Section */}
        <div className="mb-6">
          <Button
            label="Back to Post Role Mappings"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            onClick={() => navigateToList()}
            className="mb-4"
          />

          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">
                Post Role Mapping Details
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                View complete mapping and permission details
              </p>
            </div>

            <div className="flex gap-2">
              {!data.isDelete && (
                <>
                  {canUpdate && (
                    <Button
                      label="Edit"
                      icon="pi pi-pencil"
                      severity="secondary"
                      outlined
                      onClick={handleEdit}
                    />
                  )}
                  {canDelete && (
                    <Button
                      label="Delete"
                      icon="pi pi-trash"
                      severity="danger"
                      outlined
                      onClick={handleDeleteClick}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mapping Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-link text-purple-600 dark:text-purple-400" style={{ fontSize: '1.5rem' }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {data.postName}
              </h2>
              {data.isDelete ? (
                <Tag value="Deleted" severity="danger" />
              ) : (
                <Tag value="Active" severity="success" />
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Mapped to: {data.systemRoleName} ({data.systemRoleShortCode})
            </p>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Basic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Post Name
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.postName || '-'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  System Role
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.systemRoleName || '-'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Short Code
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  <Tag value={data.systemRoleShortCode || '-'} severity="info" />
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Status
                </label>
                <p className="text-sm mt-1">
                  {data.isDelete ? (
                    <Tag value="Deleted" severity="danger" />
                  ) : data.isActive ? (
                    <Tag value="Active" severity="success" />
                  ) : (
                    <Tag value="Inactive" severity="warning" />
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Audit Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Audit Information
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Created At
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {formatDateTime(data.createdAt)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Created By
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {createdByName}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Updated At
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {formatDateTime(data.updatedAt)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Updated By
                </label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {updatedByName}
                </p>
              </div>
            </div>
          </div>

          {/* System Role Details */}
          {data.systemRoleData && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                System Role Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.systemRoleData.roleBinding?.map((perm, index) => (
                  <div
                    key={`${perm.moduleId}-${index}`}
                    className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {perm.moduleName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Role: {perm.roleName}
                        </p>
                      </div>
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <i className="pi pi-box text-blue-600 dark:text-blue-400 text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Permissions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <i className="pi pi-plus-circle text-green-500" />
              Additional Permissions
              <Tag value={data.additionalPermissions?.length || 0} severity="success" />
            </h2>

            {!data.additionalPermissions || data.additionalPermissions.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No additional permissions configured.
              </p>
            ) : (
              <Accordion multiple>
                {data.additionalPermissions.map((module) => (
                  <AccordionTab
                    key={module.moduleId}
                    header={
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{module.moduleName}</span>
                        <Tag value={`${module.jobs.length} jobs`} severity="info" />
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {module.jobs.map((job) => (
                        <div key={job.jobName} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <p className="font-medium text-sm mb-2">{job.jobName}</p>
                          <div className="flex flex-wrap gap-2">
                            {job.permissions.map((perm) => (
                              <Tag
                                key={perm.name}
                                value={`+ ${perm.name}${perm.isSelf ? ' (self)' : ''}`}
                                severity="success"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionTab>
                ))}
              </Accordion>
            )}
          </div>

          {/* Exclusion Permissions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <i className="pi pi-minus-circle text-orange-500" />
              Exclusion Permissions
              <Tag value={data.exclusionPermissions?.length || 0} severity="warning" />
            </h2>

            {!data.exclusionPermissions || data.exclusionPermissions.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No exclusion permissions configured.
              </p>
            ) : (
              <Accordion multiple>
                {data.exclusionPermissions.map((module) => (
                  <AccordionTab
                    key={module.moduleId}
                    header={
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{module.moduleName}</span>
                        <Tag value={`${module.jobs.length} jobs`} severity="info" />
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {module.jobs.map((job) => (
                        <div key={job.jobName} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <p className="font-medium text-sm mb-2">{job.jobName}</p>
                          <div className="flex flex-wrap gap-2">
                            {job.permissions.map((perm) => (
                              <Tag
                                key={perm.name}
                                value={`- ${perm.name}`}
                                severity="danger"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionTab>
                ))}
              </Accordion>
            )}
          </div>

          {/* Consolidated Permissions (Final Result) */}
          {data.permissions && data.permissions.length > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <i className="pi pi-check-circle text-blue-500" />
                Consolidated Permissions (Final Result)
              </h2>

              <Accordion multiple activeIndex={[0]}>
                {data.permissions.map((module) => (
                  <AccordionTab
                    key={module.moduleId}
                    header={
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-600">{module.moduleName}</span>
                        <Tag value={`${module.jobs.length} jobs`} severity="info" />
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {module.jobs.map((job, jobIndex) => (
                        <div
                          key={job.jobName}
                          className={`p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg ${
                            jobIndex < module.jobs.length - 1 ? 'border-b border-gray-200 dark:border-gray-600' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <i className="pi pi-briefcase text-gray-500" />
                            <p className="font-medium text-gray-900 dark:text-white">{job.jobName}</p>
                            {job.isMenu !== undefined && (
                              <Tag
                                value={job.isMenu ? 'Menu' : 'Hidden'}
                                severity={job.isMenu ? 'success' : 'secondary'}
                                className="text-xs"
                              />
                            )}
                            {job.displayOrder !== undefined && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                Order: {job.displayOrder}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {job.permissions.map((perm) => (
                              <Tag
                                key={perm.name}
                                value={perm.name}
                                severity={perm.isSelf ? 'warning' : 'success'}
                              />
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
          message="Are you sure you want to delete this post role mapping? The linked system role will NOT be deleted."
          testId="PostRoleMappingView.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default PostRoleMappingView;
