/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';

import { departmentsService } from '../../services/departments.service';
import { masterService } from '../../services/master.service';
import type { Department } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const DepartmentView = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'departments',
    basePath: '/departments',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.DEPARTMENTS);
  const canDelete = useCanDelete(JOB_NAMES.DEPARTMENTS);

  const [data, setData] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Resolve createdBy/updatedBy IDs to display names
  const { createdByName, updatedByName } = useAuditNames(data?.createdBy, data?.updatedBy);

  // Set breadcrumb title to show department name instead of UUID
  useBreadcrumbTitle(data?.name);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await departmentsService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch department'));
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
      await departmentsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete department'));
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
        <Message severity="error" text={error || 'Department not found'} className="mb-4 w-full" />
        <Button
          label="Back to Departments"
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
    <div className="p-3" data-testid="SCR-Department-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Department Details</h1>
        </div>
      </div>

      {/* Department Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-building text-blue-600 dark:text-blue-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.name}</h2>
              {data.shortCode && (
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                  {data.shortCode}
                </span>
              )}
              {data.cctnsDepartmentCd && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {data.cctnsDepartmentCd}
                </span>
              )}
              {(data as any).isDelete || data.isDeleted ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Department Configuration
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!((data as any).isDelete || data.isDeleted) && (
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
        {/* Department Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Department Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Short Code</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.shortCode || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">CCTNS Department Code</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.cctnsDepartmentCd || '-'}</p>
            </div>
          </div>
        </div>

        {/* Audit Information */}
        {/* <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {data.createdAt ? new Date(data.createdAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{createdByName}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{updatedByName}</p>
            </div>
          </div>
        </div> */}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={() => setDeleteDialogOpen(false)}
        header="Delete Department"
        footer={deleteDialogFooter}
        style={{ width: '400px' }}
        modal
        dismissableMask
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
  );
};

export default DepartmentView;
