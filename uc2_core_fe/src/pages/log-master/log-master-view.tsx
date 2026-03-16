/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { logMasterService } from '../../services/log-master.service';
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useBreadcrumbTitle(data?.eventCode);

  useEffect(() => {
    if (!isReady || !id) return;
    (async () => {
      try {
        setLoading(true);
        const res = await logMasterService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch log master'));
      } finally {
        setLoading(false);
      }
    })();
  }, [isReady, id]);

  const handleEdit = () => { if (id) navigateToEdit(id); };
  const handleDeleteClick = () => setDeleteDialogOpen(true);
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
  const handleDeleteCancel = () => setDeleteDialogOpen(false);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-3">
        <Message severity="error" text={error || 'Log Master not found'} className="mb-4 w-full" />
        <Button label="Back to Log Master" icon="pi pi-arrow-left" severity="secondary" outlined onClick={() => navigateToList()} />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.LOG_MASTER}>
      <div className="p-3" data-testid="SCR-LogMaster-View">
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Button icon="pi pi-arrow-left" severity="secondary" text rounded onClick={() => navigateToList()} className="p-0" style={{ width: '28px', height: '28px' }} />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Log Master Details</h1>
          </div>
        </div>

        {/* Log Master Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5">
            <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-file-edit text-xl text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white font-mono">{data.eventCode}</h2>
                {data.isDelete ? (
                  <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
                ) : (
                  <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data.logObject} &bull; {data.action} &bull; Retention: {data.retentionPeriod} days
              </p>
            </div>
          </div>

          {!data.isDelete && (
            <div className="flex gap-1.5 sm:self-center">
              {canUpdate && <Button label="Edit" icon="pi pi-pencil" onClick={handleEdit} size="small" testId="LogMasterView.Button.Edit" />}
              {canDelete && <Button label="Delete" icon="pi pi-trash" severity="danger" onClick={handleDeleteClick} size="small" testId="LogMasterView.Button.Delete" />}
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
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Event Code</label>
                <p className="text-sm text-gray-900 dark:text-white font-mono break-all">{data.eventCode || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Log Object</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.logObject || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Action</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.action || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Retention Period</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.retentionPeriod} days</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Layer</label>
                <Tag value={data.layer || '-'} severity="warning" className="text-xs" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Log Level</label>
                <Tag value={data.logLevel || 'INFO'} severity={data.logLevel === 'ERROR' ? 'danger' : data.logLevel === 'WARNING' ? 'warning' : 'info'} className="text-xs" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Log Type</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.logtype || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Key Fields</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.keyFields || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Sensitive</label>
                <Tag value={data.isSensitive ? 'Yes' : 'No'} severity={data.isSensitive ? 'danger' : 'success'} className="text-xs" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Usage Trackable</label>
                <Tag value={data.isUsageTrackable ? 'Yes' : 'No'} severity={data.isUsageTrackable ? 'info' : 'secondary'} className="text-xs" />
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Description</label>
                <p className="text-sm text-gray-600 dark:text-gray-400">{data.description || 'No description provided'}</p>
              </div>
            </div>
          </div>

          {/* Message Template */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
              <i className="pi pi-code text-blue-600" style={{ fontSize: '0.875rem' }} />
              Message Template
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded border border-gray-200 dark:border-gray-600">
              <code className="text-gray-900 dark:text-white font-mono text-xs break-words">
                {data.messageTemplate || '-'}
              </code>
            </div>

            {/* Parameters */}
            {data.parameters && data.parameters.length > 0 && (
              <div className="mt-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Parameters</label>
                <div className="flex flex-wrap gap-1">
                  {data.parameters.map((param, idx) => (
                    <span key={idx} className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                      {param}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Template Parameters */}
          {data.templateParameters && Object.keys(data.templateParameters).length > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                <i className="pi pi-file-edit text-blue-600" style={{ fontSize: '0.875rem' }} />
                Template Parameters
              </h2>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded border border-gray-200 dark:border-gray-600 overflow-auto max-h-64">
                <pre className="text-gray-900 dark:text-white font-mono text-xs whitespace-pre-wrap">
                  {JSON.stringify(data.templateParameters, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

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
