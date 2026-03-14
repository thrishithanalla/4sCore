/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { unitTypesService } from '../../services/unit-types.service';
import { masterService } from '../../services/master.service';
import type { UnitType, Department } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const UnitTypeView = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'unit-types',
    basePath: '/unit-types',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.UNIT_TYPE);
  const canDelete = useCanDelete(JOB_NAMES.UNIT_TYPE);

  const [data, setData] = useState<UnitType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show unit type name instead of UUID
  useBreadcrumbTitle(data?.name);

  // Collect personnel IDs for lookup (createdBy, updatedBy, deletedBy)
  const personnelIds = [data?.createdBy, data?.updatedBy, data?.deletedBy];
  const { getName: getPersonnelName } = usePersonnelNames(personnelIds);

  // Departments map
  const [departmentMap, setDepartmentMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const departments = await masterService.getDepartments();
        setDepartmentMap(new Map(departments.map((d: Department) => [d._id, d.name])));
      } catch {
        // ignore
      }
    };
    loadDepartments();
  }, []);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await unitTypesService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch unit type'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const getDepartmentName = (departmentId?: string) => {
    if (!departmentId) return '-';
    return departmentMap.get(departmentId) ?? departmentId;
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
      await unitTypesService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete unit type'));
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

  if (error || !data) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Unit type not found'} className="mb-4 w-full" />
        <Button
          label="Back to Unit Types"
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

  return (
    <div className="p-3" data-testid="SCR-UnitType-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Unit Type Details</h1>
        </div>
      </div>

      {/* Unit Type Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-building text-blue-600 dark:text-blue-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h2>
              {(data as any).isDelete || data.isDeleted ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data.level !== undefined && data.level !== null ? `Level ${data.level}` : 'Level not set'}
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
        {/* Unit Type Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Unit Type Information</h2>
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
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Scope</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{data.scope || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Level</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {data.level !== undefined && data.level !== null ? data.level : '-'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Department</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {data.department?.name || getDepartmentName(data.departmentId)}
              </p>
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
              <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(data.createdBy)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(data.updatedBy)}</p>
            </div>
          </div>

          {data.isDeleted && (
            <>
              <Divider />
              <Message severity="warn" text="This record is soft-deleted." className="w-full mb-3" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Deleted At</label>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">
                    {data.deletedAt ? new Date(data.deletedAt).toLocaleString() : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Deleted By</label>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(data.deletedBy)}</p>
                </div>
              </div>
            </>
          )}
        </div> */}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={handleDeleteCancel}
        header="Delete Unit Type"
        footer={deleteDialogFooter}
        style={{ width: '400px' }}
        modal
        dismissableMask
        data-testid="UnitTypeView.Dialog.Delete"
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

export default UnitTypeView;
