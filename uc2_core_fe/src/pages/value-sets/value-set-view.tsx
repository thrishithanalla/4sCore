/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { Toast } from 'mainFe/Toast';
import { Message } from 'mainFe/Message';
import { Tag } from 'mainFe/Tag';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { valueSetsService } from '../../services/value-sets.service';
import type { ValueSetLocalized } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelName } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import styles from './value-set-view.module.css';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const ValueSetView = () => {
  const navigate = useAppNavigate();
  const { key } = useParams<{ key: string }>();
  const toast = useRef<Toast>(null);

  const canUpdate = useCanUpdate(JOB_NAMES.VALUE_SETS);
  const canDelete = useCanDelete(JOB_NAMES.VALUE_SETS);

  const [valueSet, setValueSet] = useState<ValueSetLocalized | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);


  // Set breadcrumb title to show value set key instead of UUID
  useBreadcrumbTitle(valueSet?.key);

  // Use cached personnel lookup for createdBy name
  const { name: createdByName } = usePersonnelName(valueSet?.createdBy);

  // Stable fetch function (prevents infinite loops)
  const fetchValueSet = useCallback(async () => {
    if (!key) return;

    try {
      setLoading(true);
      const data = await valueSetsService.getByKey(key);
      setValueSet(data);
    } catch (err: any) {
      setError(
        extractErrorMessage(err, 'Failed to fetch value set details')
      );
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) {
      navigate('/value-sets');
      return;
    }
    fetchValueSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const handleEdit = () => {
    if (valueSet) navigate(`/value-sets/${valueSet.key}/edit`);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!valueSet) return;

    try {
      setDeleting(true);
      await valueSetsService.delete(valueSet.key);

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Value Set deleted successfully',
        life: 3000,
      });

      setTimeout(() => {
        navigate('/value-sets');
      }, 1500);
    } catch (err: any) {
      setError(
        extractErrorMessage(err, 'Failed to delete value set')
      );
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to delete value set'),
        life: 5000,
      });
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !valueSet) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Value set not found'} className="mb-4 w-full" />
        <Button
          label="Back to Value Sets"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigate('/value-sets')}
        />
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-ValueSet-View">
        {/* Header Section */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Button
              icon="pi pi-arrow-left"
              severity="secondary"
              text
              rounded
              onClick={() => navigate('/value-sets')}
              className="p-0"
              style={{ width: '28px', height: '28px' }}
            />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Value Set Details</h1>
          </div>
        </div>

        {/* Value Set Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className="w-12 h-12 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-cog text-purple-600 dark:text-purple-400" style={{ fontSize: '1.25rem' }} />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{valueSet.key}</h2>
                {valueSet.status && (
                  <Tag value={valueSet.status} severity={valueSet.status === 'active' ? 'success' : 'warning'} className="text-xs px-1.5 py-0.5" />
                )}
                {valueSet.module && (
                  <Tag value={valueSet.module} severity="info" className="text-xs px-1.5 py-0.5" />
                )}
                <Tag
                  value={`${valueSet.items.length} Item${valueSet.items.length !== 1 ? 's' : ''}`}
                  severity="info"
                  className="text-xs px-1.5 py-0.5"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {valueSet.description || 'No description'}
              </p>
            </div>
          </div>

          {/* Edit/Delete buttons */}
          {!((valueSet as any).isDelete || valueSet.status === 'archived') && (
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
        <div className="grid grid-cols-1 gap-2">
          {/* Enumeration Items Section */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Enumeration Items ({valueSet.items.length})
            </h2>

            {valueSet.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400 font-medium" style={{ width: '60px' }}>#</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400 font-medium">Code</th>
                      <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400 font-medium">Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valueSet.items.map((item: any, index: number) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                        <td className="py-2 px-2 text-gray-500 dark:text-gray-400">{index + 1}</td>
                        <td className="py-2 px-2 text-gray-900 dark:text-white font-medium">{item.code}</td>
                        <td className="py-2 px-2 text-gray-900 dark:text-white">{item.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <i className="pi pi-inbox text-4xl mb-2" />
                <p className="text-sm font-medium">No items found</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        visible={deleteDialogOpen}
        onCancel={handleDeleteCancel}
        onDelete={handleDeleteConfirm}
        message="Are you sure you want to delete this value set? This action cannot be undone and may affect system functionality."
        header="Confirm Delete"
        loading={deleting}
        testId="ValueSetView.Dialog.Delete"
      />
    </>
  );
};

export default ValueSetView;
