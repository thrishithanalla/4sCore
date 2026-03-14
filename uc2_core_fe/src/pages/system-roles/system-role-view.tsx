/**
 * System Role View Component
 * Displays detailed information about a system role
 * Following Unit Details design pattern
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { systemRolesService } from '../../services/system-roles.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import type { SystemRole } from '../../types/system-role.types';

const SystemRoleView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'system-roles',
    basePath: '/system-roles',
  });
  const toast = useRef<Toast>(null);
  const canUpdate = useCanUpdate(JOB_NAMES.SYSTEM_ROLES);
  const canDelete = useCanDelete(JOB_NAMES.SYSTEM_ROLES);

  const [data, setData] = useState<SystemRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Set breadcrumb title to show role name instead of UUID
  useBreadcrumbTitle(data?.roleName);

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
        const res = await systemRolesService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch system role'));
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
      await systemRolesService.delete(id);
      setDeleteDialogOpen(false);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'System role deleted successfully',
        life: 3000,
      });
      setTimeout(() => {
        navigateToList();
      }, 1000);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete system role'));
      setDeleteDialogOpen(false);
    } finally {
      setDeleteLoading(false);
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
        <Message severity="error" text={error || 'System role not found'} className="mb-4 w-full" />
        <Button
          label="Back to System Roles"
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
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} loading={deleteLoading} />
    </div>
  );

  return (
    <div className="p-3" data-testid="SCR-SystemRole-View">
      <Toast ref={toast} position="top-right" />

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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">System Role Details</h1>
        </div>
      </div>

      {/* Role Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-shield text-indigo-600 dark:text-indigo-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.roleName}</h2>
              {data.roleShortCode && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {data.roleShortCode}
                </span>
              )}
              {data.isDelete ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data.roleBinding?.length || 0} module permission{(data.roleBinding?.length || 0) !== 1 ? 's' : ''} assigned
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with role name row */}
        {!data.isDelete && (
          <div className="flex gap-1.5 sm:self-center">
            {canUpdate && (
              <Button
                label="Edit"
                icon="pi pi-pencil"
                onClick={handleEdit}
                size="small"
                testId="SystemRoleView.Action.Edit"
              />
            )}
            {canDelete && (
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                onClick={handleDeleteClick}
                size="small"
                testId="SystemRoleView.Action.Delete"
              />
            )}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Role Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.roleName || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Short Code</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.roleShortCode || '-'}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Description</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {data.description || 'No description'}
              </p>
            </div>
          </div>
        </div>

        {/* Audit Information - Commented out per standard */}
        {/* <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Audit Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
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

        {/* Module Permissions */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Module Permissions ({data.roleBinding?.length || 0})
            </h2>
          </div>

          {!data.roleBinding || data.roleBinding.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <i className="pi pi-shield text-3xl text-gray-400 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No permissions assigned to this system role.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.roleBinding.map((perm, index) => (
                <div
                  key={`${perm.moduleId}-${index}`}
                  className="flex items-start justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {perm.moduleName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Role: {perm.roleName}
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <i className="pi pi-box text-blue-600 dark:text-blue-400" style={{ fontSize: '0.75rem' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={() => setDeleteDialogOpen(false)}
        header="Delete System Role"
        footer={deleteDialogFooter}
        style={{ width: '400px' }}
        modal
        dismissableMask
        data-testid="SystemRoleView.Dialog.Delete"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <i className="pi pi-exclamation-triangle text-red-600" style={{ fontSize: '1.25rem' }} />
          </div>
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Are you sure you want to delete <strong>{data.roleName}</strong>?
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              This action cannot be undone.
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default SystemRoleView;
