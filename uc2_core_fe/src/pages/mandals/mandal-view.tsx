/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useMemo } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useQuery } from '@tanstack/react-query';
import { masterService } from '../../services/master.service';
import { mandalsService } from '../../services/mandals.service';
import type { Mandal } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

/* ---------------------------------------------------------------------- */
/* Full MandalView component */
/* ---------------------------------------------------------------------- */
const MandalView: React.FC = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'mandals',
    basePath: '/mandals',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.MANDALS);
  const canDelete = useCanDelete(JOB_NAMES.MANDALS);

  const [mandal, setMandal] = useState<Mandal | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  // Set breadcrumb title to show mandal name instead of UUID
  useBreadcrumbTitle(mandal?.name);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(mandal?.createdBy, mandal?.updatedBy);

  /* -------------------------------------------------------------------- */
  /* Fetch districts once */
  /* -------------------------------------------------------------------- */
  const { data: districts = [] } = useQuery({
    queryKey: ['districts', 'dropdown'],
    queryFn: masterService.getDistricts,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Memoize district map for efficient lookup
  const districtMap = useMemo(() => {
    const map = new Map<string, string>();
    districts.forEach(d => map.set(d._id, d.name));
    return map;
  }, [districts]);

  /* -------------------------------------------------------------------- */
  /* Helper to get district name */
  /* -------------------------------------------------------------------- */
  const getDistrictName = (districtId?: string | null) => {
    if (!districtId) return '-';
    return districtMap.get(districtId) || districtId;
  };

  /* -------------------------------------------------------------------- */
  /* Fetch mandal details when `id` changes */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }

    let mounted = true;

    const loadMandal = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await mandalsService.getById(id);
        if (mounted) setMandal(data);
      } catch (err: any) {
        if (mounted) {
          setError(extractErrorMessage(err, 'Failed to fetch mandal details'));
          setMandal(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadMandal();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  /* -------------------------------------------------------------------- */
  /* Handlers */
  /* -------------------------------------------------------------------- */
  const handleEdit = () => {
    if (!id) return;
    navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await mandalsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete mandal'));
    }
  };

  const handleRestoreClick = () => {
    setRestoreDialogOpen(true);
  };

  const handleRestoreConfirm = async () => {
    if (!id) return;
    try {
      await mandalsService.restore(id);
      const data = await mandalsService.getById(id);
      setMandal(data);
      setRestoreDialogOpen(false);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to restore mandal'));
    }
  };

  /* -------------------------------------------------------------------- */
  /* Loading / Error states */
  /* -------------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !mandal) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Mandal not found'} className="mb-4 w-full" />
        <Button
          label="Back to Mandals"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Dialog footers
  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={() => setDeleteDialogOpen(false)} />
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} />
    </div>
  );

  const restoreDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={() => setRestoreDialogOpen(false)} />
      <Button label="Restore" severity="success" onClick={handleRestoreConfirm} />
    </div>
  );

  /* -------------------------------------------------------------------- */
  /* Render main UI */
  /* -------------------------------------------------------------------- */
  return (
    <div className="p-3" data-testid="SCR-Mandal-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Mandal Details</h1>
        </div>
      </div>

      {/* Mandal Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-map-marker text-green-600 dark:text-green-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{mandal.mandalName}</h2>
              {(mandal as any).isDelete || mandal.isDeleted ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {mandal.district?.name || getDistrictName(mandal.districtId)}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!((mandal as any).isDelete || mandal.isDeleted) && (
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
        {/* Mandal Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Mandal Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Mandal Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{mandal.mandalName || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Mandal Code</label>
              <p className="text-sm text-gray-900 dark:text-white">{(mandal as any).mandalCode || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">District</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {mandal.district?.name || getDistrictName(mandal.districtId)}
              </p>
            </div>
          </div>
        </div>

        {/* Audit Information */}
        {/* <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Audit Information</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {mandal.createdAt ? new Date(mandal.createdAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white">{createdByName}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {mandal.updatedAt ? new Date(mandal.updatedAt).toLocaleString() : '-'}
              </p>
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
        header="Confirm Delete"
        footer={deleteDialogFooter}
        style={{ width: '450px' }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to delete this mandal? This action will mark the mandal as deleted.
        </p>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        visible={restoreDialogOpen}
        onHide={() => setRestoreDialogOpen(false)}
        header="Confirm Restore"
        footer={restoreDialogFooter}
        style={{ width: '450px' }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to restore this mandal? This will make the mandal active again.
        </p>
      </Dialog>
    </div>
  );
};

export default MandalView;
