/**
 * Role View Component
 * Displays detailed information about a role
 * Following Unit Details design pattern
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { getRoleById, deleteRole, type Role, type RoleJobExtended } from '../../services/roles.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';

const RoleView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'roles',
    basePath: '/roles',
  });
  const canUpdate = useCanUpdate('roles');
  const canDelete = useCanDelete('roles');

  const [data, setData] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show role name instead of UUID
  useBreadcrumbTitle(data?.name);

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
        const res = await getRoleById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch role'));
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

  // Get permission badge CSS class based on permission name
  const getPermissionBadgeClass = (permissionName: string): string => {
    const name = permissionName.toLowerCase();
    if (name === 'create') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    if (name === 'read') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    if (name === 'update') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    if (name === 'delete') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
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
      await deleteRole(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete role'));
      setDeleteDialogOpen(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Role not found'} className="mb-4 w-full" />
        <Button
          label="Back to Roles"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={() => setDeleteDialogOpen(false)} />
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} />
    </div>
  );

  return (
    <PermissionGuard jobName="roles">
      <div className="p-3" data-testid="SCR-Role-View">
        {/* Header Section */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Button
              icon="pi pi-arrow-left"
              severity="secondary"
              text
              rounded
              onClick={() => navigateToList()}
              className="p-0"
              style={{ width: '28px', height: '28px' }}
            />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Role Details</h1>
          </div>
        </div>

        {/* Role Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className="w-12 h-12 rounded bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-shield text-amber-600 dark:text-amber-400" style={{ fontSize: '1.25rem' }} />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h2>
                {data.shortCode && (
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                    {data.shortCode}
                  </span>
                )}
                {(data as any).isDelete ? (
                  <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
                ) : (
                  <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
                )}
                <Tag
                  value={`${data.permissions.length} Module${data.permissions.length !== 1 ? 's' : ''}`}
                  severity="info"
                  className="text-xs px-1.5 py-0.5"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data.description || 'No description'}
              </p>
            </div>
          </div>

          {/* Edit/Delete buttons */}
          {!((data as any).isDelete) && (
            <div className="flex gap-1.5 sm:self-center">
              {canUpdate && (
                <Button
                  label="Edit"
                  icon="pi pi-pencil"
                  onClick={handleEdit}
                  size="small"
                  testId="RoleView.Action.Edit"
                />
              )}
              {canDelete && (
                <Button
                  label="Delete"
                  icon="pi pi-trash"
                  severity="danger"
                  onClick={handleDeleteClick}
                  size="small"
                  testId="RoleView.Action.Delete"
                />
              )}
            </div>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 gap-2">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.name || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Short Code</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.shortCode || '-'}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Description</label>
                <p className="text-sm text-gray-900 dark:text-white">
                  {data.description || 'No description'}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Section */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Permissions ({data.permissions.length} Modules)
              </h2>
            </div>

            {data.permissions.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                No permissions assigned to this role.
              </p>
            ) : (
              <Accordion multiple activeIndex={[0]}>
                {data.permissions.map((module) => (
                  <AccordionTab
                    key={module.moduleId}
                    header={
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {module.moduleName}
                        </span>
                        <Tag value={`${module.jobs.length} Jobs`} severity="info" className="text-xs px-1.5 py-0.5" />
                      </div>
                    }
                  >
                    <div className="pl-4">
                      {module.jobs.map((job) => {
                        const extendedJob = job as RoleJobExtended;
                        return (
                          <div
                            key={job.jobName}
                            className="py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                          >
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {extendedJob.displayName || job.jobName}
                              </p>
                              {extendedJob.displayName && extendedJob.displayName !== job.jobName && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({job.jobName})
                                </span>
                              )}
                              <Tag
                                value={job.isMenu ? 'Menu' : 'Hidden'}
                                severity={job.isMenu ? 'success' : 'secondary'}
                                className="text-xs px-1.5 py-0.5"
                              />
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                Order: {job.displayOrder ?? 0}
                              </span>
                              {extendedJob.route && (
                                <span className="text-xs text-blue-600 dark:text-blue-400">
                                  /{extendedJob.route}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {job.permissions.map((perm) => (
                                <span
                                  key={perm.name}
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getPermissionBadgeClass(perm.name)}`}
                                >
                                  {perm.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionTab>
                ))}
              </Accordion>
            )}
          </div>

          {/* Audit Information - Commented */}
          {/* <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Audit Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created At</label>
                <p className="text-sm text-gray-900 dark:text-white">{formatDateTime(data.createdAt)}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created By</label>
                <p className="text-sm text-gray-900 dark:text-white">{createdByName}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated At</label>
                <p className="text-sm text-gray-900 dark:text-white">{formatDateTime(data.updatedAt)}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated By</label>
                <p className="text-sm text-gray-900 dark:text-white">{updatedByName}</p>
              </div>
            </div>
          </div> */}
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog
          visible={deleteDialogOpen}
          onHide={() => setDeleteDialogOpen(false)}
          header="Delete Role"
          footer={deleteDialogFooter}
          style={{ width: '400px' }}
          modal
          dismissableMask
          data-testid="RoleView.Dialog.Delete"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <i className="pi pi-exclamation-triangle text-red-600" style={{ fontSize: '1.25rem' }} />
            </div>
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Are you sure you want to delete <strong>{data.name}</strong>?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                This action cannot be undone.
              </p>
            </div>
          </div>
        </Dialog>
      </div>
    </PermissionGuard>
  );
};

export default RoleView;
