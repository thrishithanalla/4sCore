/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { unitVillagesService } from '../../services/unit-villages.service';
import { extractErrorMessage } from '../../utils/error-handler';
// import { useAuditNames } from '../../hooks/usePersonnelLookup';
import type { UnitVillage } from '../../types';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const UnitVillageView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'unit-villages',
    basePath: '/unit-villages',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.UNIT_VILLAGES);
  const canDelete = useCanDelete(JOB_NAMES.UNIT_VILLAGES);

  const [unitVillage, setUnitVillage] = useState<UnitVillage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show village name instead of UUID
  useBreadcrumbTitle(unitVillage?.villageName);

  // Use cached personnel lookup for audit names
  // const { createdByName, updatedByName } = useAuditNames(unitVillage?.createdBy, unitVillage?.updatedBy);

  /* ------------------------------------------------------------- */
  /* Load UnitVillage - wait for ID decryption                     */
  /* ------------------------------------------------------------- */
  useEffect(() => {
    if (!isReady || !id) {
      return;
    }

    const fetchUnitVillage = async () => {
      try {
        setLoading(true);
        const data = await unitVillagesService.getById(id);
        setUnitVillage(data);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch unit village mapping details'));
      } finally {
        setLoading(false);
      }
    };

    fetchUnitVillage();
  }, [isReady, id]);

  /* ------------------------------------------------------------- */
  /* Edit + Delete Handlers                                        */
  /* ------------------------------------------------------------- */
  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;

    try {
      await unitVillagesService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete unit village mapping'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  /* ------------------------------------------------------------- */
  /* Loading State                                                 */
  /* ------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  /* ------------------------------------------------------------- */
  /* Error State                                                   */
  /* ------------------------------------------------------------- */
  if (error || !unitVillage) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Unit village mapping not found'} className="mb-4 w-full" />
        <Button
          label="Back to Unit Villages"
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
      <Button
        label="Cancel"
        severity="secondary"
        outlined
        onClick={handleDeleteCancel}
      />
      <Button
        label="Delete"
        severity="danger"
        onClick={handleDeleteConfirm}
      />
    </div>
  );

  /* ------------------------------------------------------------- */
  /* Main UI                                                       */
  /* ------------------------------------------------------------- */
  return (
    <div className="p-3" data-testid="SCR-UnitVillage-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Unit Village Details</h1>
        </div>
      </div>

      {/* Village Information Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-map-marker text-green-600 dark:text-green-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {unitVillage.villageName || '-'}
              </h2>
              {unitVillage.villageCode && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {unitVillage.villageCode}
                </span>
              )}
              {unitVillage.isActive ? (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Inactive" severity="danger" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {unitVillage.mandal?.mandalName || '-'} &bull; {unitVillage.unit?.name || '-'}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!(unitVillage.isDelete || unitVillage.isDeleted) && (
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
        {/* Location Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Location Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Village Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{unitVillage.villageName || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Village Code</label>
              <p className="text-sm text-gray-900 dark:text-white">{unitVillage.villageCode || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Mandal</label>
              <p className="text-sm text-gray-900 dark:text-white">{unitVillage.mandal?.mandalName || '-'}</p>
            </div>
          </div>
        </div>

        {/* Unit Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Unit Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Police Unit</label>
              <p className="text-sm text-gray-900 dark:text-white">{unitVillage.unit?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Police Reference ID</label>
              <p className="text-sm text-gray-900 dark:text-white">{unitVillage.unit?.policeReferenceId || '-'}</p>
            </div>
          </div>
        </div>

        {/* Audit Information */}
        {/* <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Audit Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {unitVillage.createdAt ? new Date(unitVillage.createdAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white">{createdByName}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {unitVillage.updatedAt ? new Date(unitVillage.updatedAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white">{updatedByName}</p>
            </div>
          </div>
        </div> */}

        {/* IP Information (if available) */}
        {/* {(unitVillage.createdIp || unitVillage.updatedIp) && (
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">IP Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {unitVillage.createdIp && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created IP</label>
                  <p className="text-sm text-gray-900 dark:text-white">{unitVillage.createdIp}</p>
                </div>
              )}
              {unitVillage.updatedIp && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated IP</label>
                  <p className="text-sm text-gray-900 dark:text-white">{unitVillage.updatedIp}</p>
                </div>
              )}
            </div>
          </div>
        )} */}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={handleDeleteCancel}
        header="Confirm Delete"
        footer={deleteDialogFooter}
        style={{ width: '450px' }}
        data-testid="UnitVillageView.Dialog.Delete"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to delete this unit village mapping? This action cannot be undone.
        </p>
      </Dialog>
    </div>
  );
};

export default UnitVillageView;
