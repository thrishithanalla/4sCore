/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { logMasterService } from '../../services/log-master.service';
import { modulesService } from '../../services/modules.service';
import type { LogMaster } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const LogMasterView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'log-master',
    basePath: '/log-master',
  });
  const canUpdate = useCanUpdate(JOB_NAMES.LOG_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.LOG_MASTER);

  const [data, setData] = useState<LogMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleName, setModuleName] = useState<string>('-');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show log name instead of UUID
  useBreadcrumbTitle(data?.name);

  // Fetch log master data - wait for ID decryption
  useEffect(() => {
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await logMasterService.getById(id);
        setData(res);

        // Fetch module name if moduleId exists
        if (res.moduleId) {
          try {
            const moduleData = await modulesService.getById(res.moduleId);
            setModuleName(moduleData.name);
          } catch {
            setModuleName(res.moduleId);
          }
        }
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch log master'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await logMasterService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete log master'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
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
      <div className="p-3">
        <Message severity="error" text={error || 'Log Master not found'} className="mb-4 w-full" />
        <Button
          label="Back to Log Master"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.LOG_MASTER}>
      <div className="p-3" data-testid="SCR-LogMaster-View">
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
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Log Master Details</h1>
          </div>
        </div>

        {/* Log Master Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-file-edit text-xl text-blue-600 dark:text-blue-400" />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h2>
                {((data as any).isDelete || data.isDeleted) ? (
                  <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
                ) : (
                  <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data.module?.name || moduleName} &bull; Retention: {data.retentionPeriod} days
              </p>
            </div>
          </div>

          {/* Edit/Delete buttons */}
          {!((data as any).isDelete || data.isDeleted) && (
            <div className="flex gap-1.5 sm:self-center">
              {canUpdate && (
                <Button
                  label="Edit"
                  icon="pi pi-pencil"
                  onClick={handleEdit}
                  size="small"
                  testId="LogMasterView.Button.Edit"
                />
              )}
              {canDelete && (
                <Button
                  label="Delete"
                  icon="pi pi-trash"
                  severity="danger"
                  onClick={handleDeleteClick}
                  size="small"
                  testId="LogMasterView.Button.Delete"
                />
              )}
            </div>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <i className="pi pi-info-circle text-blue-600" style={{ fontSize: '0.875rem' }} />
              Basic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
              <div className="sm:col-span-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</label>
                <p className="text-sm text-gray-900 dark:text-white break-all">{data.name || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Module</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.module?.name || moduleName}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Retention Period</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.retentionPeriod} days</p>
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Purpose</label>
                <p className="text-sm text-gray-600 dark:text-gray-400">{data.purpose || 'No purpose provided'}</p>
              </div>
            </div>
          </div>

          {/* Template */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <i className="pi pi-code text-blue-600" style={{ fontSize: '0.875rem' }} />
              Template
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded border border-gray-200 dark:border-gray-600">
              <code className="text-gray-900 dark:text-white font-mono text-xs break-words">
                {data.template || '-'}
              </code>
            </div>
          </div>

          {/* JSON Configuration */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <i className="pi pi-file-edit text-blue-600" style={{ fontSize: '0.875rem' }} />
              JSON Configuration
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded border border-gray-200 dark:border-gray-600 overflow-auto max-h-64">
              <pre className="text-gray-900 dark:text-white font-mono text-xs whitespace-pre-wrap">
                {data.json ? JSON.stringify(data.json, null, 2) : '{}'}
              </pre>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this log master? This action will mark it as deleted."
          testId="LogMasterView.Dialog.Delete"
        />
      </div>
    </PermissionGuard>
  );
};

export default LogMasterView;
