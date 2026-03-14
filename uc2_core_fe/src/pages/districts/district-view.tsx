/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Button } from 'mainFe/Button';
import { Tag } from 'mainFe/Tag';
import { Skeleton } from 'mainFe/Skeleton';
import { Message } from 'mainFe/Message';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { districtsService } from '../../services/districts.service';
import type { District } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const DistrictView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'districts',
    basePath: '/districts',
  });
  const canUpdate = useCanUpdate(JOB_NAMES.DISTRICTS);
  const canDelete = useCanDelete(JOB_NAMES.DISTRICTS);

  const [data, setData] = useState<District | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Set breadcrumb title to show district name instead of UUID
  useBreadcrumbTitle(data?.name);

  // Fetch district data - wait for ID decryption
  useEffect(() => {
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await districtsService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch district'));
      } finally {
        setLoading(false);
      }
    })();
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
      setDeleteLoading(true);
      await districtsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete district'));
      setDeleteDialogOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-3" data-testid="SCR-District-View">
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Skeleton width="28px" height="28px" borderRadius="50%" />
            <Skeleton width="180px" height="24px" />
          </div>
        </div>
        <div className="flex items-start gap-2.5 mb-3">
          <Skeleton width="48px" height="48px" borderRadius="8px" />
          <div>
            <Skeleton width="200px" height="20px" />
            <Skeleton width="120px" height="14px" className="mt-1" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <Skeleton width="150px" height="18px" className="mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
            <Skeleton height="50px" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="p-3" data-testid="SCR-District-View">
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
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">District Details</h1>
          </div>
        </div>
        <Message severity="error" text={error || 'District not found'} className="w-full" />
      </div>
    );
  }

  const isDeleted = (data as any).isDelete || data.isDeleted;

  return (
    <PermissionGuard jobName={JOB_NAMES.DISTRICTS}>
      <div className="p-3" data-testid="SCR-District-View">
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
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">District Details</h1>
          </div>
        </div>

        {/* Profile Header with Actions */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-map-marker text-xl text-blue-600 dark:text-blue-400" />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h2>
                {isDeleted ? (
                  <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
                ) : (
                  <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(data as any).shortCode ? `${(data as any).shortCode} • ` : ''}{data.stateName || 'Andhra Pradesh'} {data.cctnsDistrictCd ? `• CCTNS: ${data.cctnsDistrictCd}` : ''}
              </p>
            </div>
          </div>

          {/* Edit/Delete buttons */}
          {!isDeleted && (
            <div className="flex gap-1.5 sm:self-center">
              {canUpdate && (
                <Button
                  label="Edit"
                  icon="pi pi-pencil"
                  onClick={handleEdit}
                  size="small"
                  testId="DistrictView.Button.Edit"
                />
              )}
              {canDelete && (
                <Button
                  label="Delete"
                  icon="pi pi-trash"
                  severity="danger"
                  onClick={handleDeleteClick}
                  size="small"
                  testId="DistrictView.Button.Delete"
                />
              )}
            </div>
          )}
        </div>

        {/* District Information Card */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <i className="pi pi-info-circle text-blue-600" style={{ fontSize: '1rem' }} />
            District Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                District Name
              </label>
              <p className="text-sm text-gray-900 dark:text-white font-medium mt-1">{data.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Short Code
              </label>
              <p className="text-sm text-gray-900 dark:text-white font-medium mt-1">{(data as any).shortCode || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                CCTNS District Code
              </label>
              <p className="text-sm text-gray-900 dark:text-white font-medium mt-1">{data.cctnsDistrictCd || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                State Name
              </label>
              <p className="text-sm text-gray-900 dark:text-white font-medium mt-1">{data.stateName || 'Andhra Pradesh'}</p>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this district? This action will mark the district as deleted."
          testId="DistrictView.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default DistrictView;
