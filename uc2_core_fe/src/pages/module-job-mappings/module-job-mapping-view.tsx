/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import {
  getModuleJobMappingById,
  deleteModuleJobMapping,
  restoreModuleJobMapping,
  type ModuleJobMapping,
} from '../../services/module-job-mapping.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import RestoreConfirmDialog from '../../components/dialogs/restore-confirm-dialog';

const ModuleJobMappingView = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'module-job-mappings',
    basePath: '/module-job-mappings',
  });
  const toast = useRef<Toast>(null);
  const [data, setData] = useState<ModuleJobMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  // Set breadcrumb title to show mapping info instead of UUID
  useBreadcrumbTitle(data?.moduleName && data?.jobName ? `${data.moduleName} - ${data.jobName}` : null);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(data?.createdBy, data?.updatedBy);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const mapping = await getModuleJobMappingById(id);
        setData(mapping);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to load module-job mapping'));
      } finally {
        setLoading(false);
      }
    };
    loadData();
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

  const handleRestoreClick = () => {
    setRestoreDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteModuleJobMapping(id!);
      setDeleteDialogOpen(false);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Module-job mapping deleted successfully',
        life: 3000,
      });
      setTimeout(() => navigateToList(), 1000);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete module-job mapping'));
      setDeleteDialogOpen(false);
    }
  };

  const handleRestoreConfirm = async () => {
    try {
      await restoreModuleJobMapping(id!);
      setRestoreDialogOpen(false);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Module-job mapping restored successfully',
        life: 3000,
      });
      // Reload data to reflect restored state
      const mapping = await getModuleJobMappingById(id!);
      setData(mapping);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to restore module-job mapping'));
      setRestoreDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const handleRestoreCancel = () => {
    setRestoreDialogOpen(false);
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
        <Message severity="error" text={error || 'Module-job mapping not found'} className="mb-4 w-full" />
        <Button
          label="Back to Module-Job Mappings"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="py-4 px-4" data-testid="SCR-ModuleJobMapping-View">
        {/* Header Section */}
        <div className="mb-3">
          <Button
            label="Back to Module-Job Mappings"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            onClick={() => navigateToList()}
            className="mb-3"
          />

          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold mb-1 text-gray-900 dark:text-white">Module-Job Mapping Details</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">View the module and job relationship</p>
            </div>

            <div className="flex gap-2">
              {(data as any).isDelete || data.isDeleted ? (
                <Button
                  label="Restore"
                  icon="pi pi-refresh"
                  severity="success"
                  onClick={handleRestoreClick}
                />
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mapping Header */}
        <div className="flex items-start gap-4 mb-3">
          <div className="w-16 h-16 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-sitemap text-purple-600 dark:text-purple-400" style={{ fontSize: '1.5rem' }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {data.moduleName || 'Unknown Module'} → {data.jobName || 'Unknown Job'}
              </h2>
              {(data as any).isDelete || data.isDeleted ? (
                <Tag value="Deleted" severity="danger" />
              ) : data.isActive ? (
                <Tag value="Active" severity="success" />
              ) : (
                <Tag value="Inactive" severity="warning" />
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Module-Job Mapping
            </p>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Module */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <i className="pi pi-box text-indigo-600 dark:text-indigo-400" style={{ fontSize: '1.25rem' }} />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Module</h2>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.moduleName || '-'}</p>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">ID</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">{data.moduleId}</p>
            </div>
          </div>

          {/* Job */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <i className="pi pi-briefcase text-amber-600 dark:text-amber-400" style={{ fontSize: '1.25rem' }} />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Job</h2>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.jobName || '-'}</p>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">ID</label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">{data.jobId}</p>
            </div>
          </div>

          {/* Audit Information */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
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
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this module-job mapping? This action cannot be undone."
          testId="ModuleJobMappingView.Dialog.Delete"
        />

        {/* Restore Confirmation Dialog */}
        <RestoreConfirmDialog
          visible={restoreDialogOpen}
          onCancel={handleRestoreCancel}
          onRestore={handleRestoreConfirm}
          message="Are you sure you want to restore this module-job mapping?"
          testId="ModuleJobMappingView.Dialog.Restore"
        />
      </div>
    </>
  );
};

export default ModuleJobMappingView;
