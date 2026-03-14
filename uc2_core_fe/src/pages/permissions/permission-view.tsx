/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { permissionsService } from '../../services/permissions.service';
import { masterService } from '../../services/master.service';
import type { Permission } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';

const PermissionView = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'permissions',
    basePath: '/permissions',
  });

  const [data, setData] = useState<Permission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show permission name instead of UUID
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
        const res = await permissionsService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch permission'));
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
      await permissionsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete permission'));
    }
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
        <Message severity="error" text={error || 'Permission not found'} className="mb-4 w-full" />
        <Button
          label="Back to Permissions"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  return (
    <div className="py-4 px-4" data-testid="SCR-Permission-View">
      {/* Header Section */}
      <div className="mb-3">
        <Button
          label="Back to Permissions"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          onClick={() => navigateToList()}
          className="mb-3"
        />

        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">Permission Details</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">View complete information for this permission</p>
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

      {/* Permission Header */}
      <div className="flex items-start gap-4 mb-3">
        <div className="w-16 h-16 rounded bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
          <i className="pi pi-shield text-emerald-600 dark:text-emerald-400" style={{ fontSize: '1.5rem' }} />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.name}</h2>
            {(data as any).isDelete || data.isDeleted ? (
              <Tag value="Deleted" severity="danger" />
            ) : (
              <Tag value="Active" severity="success" />
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {data.shortCode || 'No short code'}
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
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Short Code</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.shortCode || '-'}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.description || 'No description provided'}</p>
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
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        visible={deleteDialogOpen}
        onCancel={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteConfirm}
        message="Are you sure you want to delete this permission? This action cannot be undone."
        testId="PermissionView.Dialog.Delete"
      />
    </div>
  );
};

export default PermissionView;
