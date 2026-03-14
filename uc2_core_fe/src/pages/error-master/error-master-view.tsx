/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { errorMasterService } from '../../services/error-master.service';
import { modulesService } from '../../services/modules.service';
import type { ErrorMaster } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelName } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import { useQuery } from '@tanstack/react-query';

const ErrorMasterView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'errorMaster',
    basePath: '/error-master',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.ERROR_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.ERROR_MASTER);

  const [errorMaster, setErrorMaster] = useState<ErrorMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show error code instead of UUID
  useBreadcrumbTitle(errorMaster?.errorCode);

  // Use cached personnel lookup for createdBy name
  const { name: createdByName } = usePersonnelName(errorMaster?.createdBy);

  // Fetch modules for lookup
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
    staleTime: 5 * 60 * 1000, // 5 mins
  });

  // Get module name by ID
  const getModuleName = useCallback((moduleId: string) => {
    const module = modules.find((m: any) => m._id === moduleId);
    return module?.name || '-';
  }, [modules]);

  // Stable fetch function
  const fetchErrorMaster = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await errorMasterService.getById(id);
      setErrorMaster(data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch error master details'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Run once when ID changes - wait for ID decryption
  useEffect(() => {
    if (!isReady || !id) {
      return;
    }
    fetchErrorMaster();
  }, [isReady, id, fetchErrorMaster]);

  // Get severity color
  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'success' | 'secondary' => {
    switch (severity) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'secondary';
    }
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
      await errorMasterService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete error master'));
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

  if (error || !errorMaster) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Error master not found'} className="mb-4 w-full" />
        <Button
          label="Back to Error Masters"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Dialog footer for delete confirmation
  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={handleDeleteCancel} />
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} />
    </div>
  );

  return (
    <div className="p-3" data-testid="SCR-ErrorMaster-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Error Master Details</h1>
        </div>
      </div>

      {/* Error Master Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-exclamation-circle text-red-600 dark:text-red-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{errorMaster.errorCode}</h2>
              <Tag value={errorMaster.errorType} severity="info" className="text-xs px-1.5 py-0.5" />
              <Tag value={errorMaster.errorSeverity} severity={getSeverityColor(errorMaster.errorSeverity)} className="text-xs px-1.5 py-0.5" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {errorMaster.log ? 'Logging Enabled' : 'Logging Disabled'}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!((errorMaster as any).isDelete || errorMaster.isDeleted) && (
          <div className="flex gap-1.5 sm:self-center">
            {canUpdate && (
              <Button
                label="Edit"
                icon="pi pi-pencil"
                onClick={handleEdit}
                size="small"
              />
            )}
            {canDelete && (
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                onClick={handleDeleteClick}
                size="small"
              />
            )}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Context Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Context Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Module</label>
              <p className="text-sm text-gray-900 dark:text-white">{getModuleName((errorMaster as any).moduleId)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Business Area</label>
              <p className="text-sm text-gray-900 dark:text-white">{errorMaster.businessArea || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Technical Area</label>
              <p className="text-sm text-gray-900 dark:text-white">{errorMaster.technicalArea || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Tool</label>
              <p className="text-sm text-gray-900 dark:text-white">{errorMaster.tool || '-'}</p>
            </div>
          </div>
        </div>

        {/* System Integration */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">System Integration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Partner System</label>
              <p className="text-sm text-gray-900 dark:text-white">{errorMaster.partnerSystem || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Third Party</label>
              <p className="text-sm text-gray-900 dark:text-white">{errorMaster.thirdParty || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Localized Messages */}
      <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3 mt-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Localized Messages</h2>
        <div className="space-y-2">
          {(errorMaster.messages ?? []).map((message, index) => (
            <div key={index} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="flex items-center gap-1.5 mb-1">
                <Tag value={message.language.toUpperCase()} severity="info" className="text-xs px-1.5 py-0.5" />
              </div>
              <p className="text-sm text-gray-900 dark:text-white">
                {message.template}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Developer Information */}
      {(errorMaster.devMessage || errorMaster.helpLink || errorMaster.videoLink) && (
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3 mt-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Developer Information</h2>
          <div className="space-y-2">
            {errorMaster.devMessage && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Developer Message</label>
                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                  {errorMaster.devMessage}
                </p>
              </div>
            )}
            {errorMaster.helpLink && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Help Link</label>
                <a
                  href={errorMaster.helpLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                >
                  {errorMaster.helpLink}
                  <i className="pi pi-external-link" style={{ fontSize: '0.875rem' }} />
                </a>
              </div>
            )}
            {errorMaster.videoLink && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Video Link</label>
                <a
                  href={errorMaster.videoLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
                >
                  {errorMaster.videoLink}
                  <i className="pi pi-external-link" style={{ fontSize: '0.875rem' }} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Information */}
      {/* <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
            <p className="text-sm text-gray-900 dark:text-white mt-1">
              {errorMaster.createdAt ? new Date(errorMaster.createdAt).toLocaleString() : '-'}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
            <p className="text-sm text-gray-900 dark:text-white mt-1">{createdByName}</p>
          </div>
        </div>
      </div> */}

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={handleDeleteCancel}
        header="Confirm Delete"
        footer={deleteDialogFooter}
        style={{ width: '450px' }}
        data-testid="ErrorMasterView.Dialog.Delete"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to delete this error master? This action cannot be undone.
        </p>
      </Dialog>
    </div>
  );
};

export default ErrorMasterView;
