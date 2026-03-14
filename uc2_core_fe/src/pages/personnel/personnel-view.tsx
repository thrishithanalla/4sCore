/* eslint-disable @typescript-eslint/no-explicit-any */
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { Tag } from 'mainFe/Tag';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useCallback, useEffect, useState } from 'react';
import { personnelService } from '../../services/personnel.service';
import { fileUploadService } from '../../services/file-upload.service';
import type { Personnel } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const PersonnelView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'personnel',
    basePath: '/personnel',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.PERSONNEL);
  const canDelete = useCanDelete(JOB_NAMES.PERSONNEL);

  const [personnel, setPersonnel] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);

  // Set breadcrumb title to show personnel name instead of UUID
  useBreadcrumbTitle(personnel?.name || null);

  // Get createdBy/updatedBy names using cached lookup
  // const { createdByName, updatedByName } = useAuditNames(
  //   personnel?.createdBy,
  //   personnel?.updatedBy
  // );

  // Stable fetch function
  const fetchPersonnel = useCallback(async () => {
    try {
      setLoading(true);
      const res = await personnelService.getById(id!);
      console.log('Personnel data received:', res);
      console.log('Posts data:', res.posts);
      setPersonnel(res);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch personnel details'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Fetch on mount or when ID changes
  useEffect(() => {
    if (!isReady || !id) return;
    fetchPersonnel();
  }, [isReady, id, fetchPersonnel]);

  // Fetch profile picture when personnel data is loaded
  useEffect(() => {
    let blobUrl: string | null = null;

    if (personnel?.picture) {
      fileUploadService.getFileUrl(personnel.picture)
        .then((url) => {
          blobUrl = url;
          setProfilePictureUrl(url);
        })
        .catch((err) => {
          console.error('Failed to fetch profile picture:', err);
          setProfilePictureUrl(null);
        });
    } else {
      setProfilePictureUrl(null);
    }

    // Cleanup blob URL
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [personnel?.picture]);

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await personnelService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete personnel'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (error || !personnel) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Personnel not found'} className="mb-4 w-full" />
        <Button
          label="Back to Personnel"
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

  const fullName = personnel.title
    ? `${personnel.title} ${personnel.name || ''}`.trim()
    : personnel.name || '-';

  return (
    <div className="p-3" data-testid="SCR-Personnel-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Personnel Details</h1>
        </div>
      </div>

      {/* Profile Header with Edit/Delete */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Profile Picture */}
          {profilePictureUrl ? (
            <div className="w-12 h-12 rounded border border-gray-200 dark:border-gray-600 overflow-hidden bg-white flex-shrink-0">
              <img
                src={profilePictureUrl}
                alt={fullName}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-semibold text-gray-400">
                {(personnel.name || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{fullName}</h2>
              {personnel.userId && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {personnel.userId}
                </span>
              )}
              {personnel.rank?.name && (
                <Tag value={personnel.rank.name} severity="info" className="text-xs px-1.5 py-0.5" />
              )}
              {personnel.department?.name && (
                <Tag value={personnel.department.name} severity="secondary" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {personnel.email || '-'} {personnel.mobile && `• ${personnel.mobile}`}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!(personnel as any).isDelete && (
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
        {/* Personal Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Personal Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">User ID</label>
              <p className="text-sm text-gray-900 dark:text-white">{personnel.userId || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Full Name</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {personnel.title ? `${personnel.title} ${personnel.name || ''}`.trim() : personnel.name || '-'}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Mobile</label>
              <p className="text-sm text-gray-900 dark:text-white">{personnel.mobile || '-'}</p>
            </div>
            <div className="overflow-hidden">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Email</label>
              <p className="text-sm text-gray-900 dark:text-white truncate" title={personnel.email || '-'}>
                {personnel.email || '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Professional Information Card */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Professional Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Department</label>
              <p className="text-sm text-gray-900 dark:text-white">{personnel.department?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Rank</label>
              <p className="text-sm text-gray-900 dark:text-white">{personnel.rank?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Badge Number</label>
              <p className="text-sm text-gray-900 dark:text-white">{personnel.badgeNo || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Batch Year</label>
              <p className="text-sm text-gray-900 dark:text-white">{personnel.batchYear?.toString() || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Post & Unit Assignments Card - Full Width */}
      {personnel.posts && personnel.posts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Post & Unit Assignments</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {personnel.posts.length} assignment{personnel.posts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-3">
            {personnel.posts.map((postAssignment, index) => (
              <div
                key={postAssignment.postId || index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {postAssignment.postName}
                    </h3>
                    {postAssignment.isPrimary && (
                      <Tag value="Primary" severity="success" className="text-xs px-1.5 py-0.5" />
                    )}
                    {postAssignment.isUnitHead && (
                      <Tag value="Unit Head" severity="info" className="text-xs px-1.5 py-0.5" />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {postAssignment.assignmentType}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Post Code</label>
                    <p className="text-xs text-gray-900 dark:text-white">{postAssignment.postCode}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Unit</label>
                    <p className="text-xs text-gray-900 dark:text-white">{postAssignment.unitName}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Start Date</label>
                    <p className="text-xs text-gray-900 dark:text-white">
                      {postAssignment.startDate ? new Date(postAssignment.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">End Date</label>
                    <p className="text-xs text-gray-900 dark:text-white">
                      {!postAssignment.isPrimary && postAssignment.endDate && postAssignment.endDate !== ''
                        ? new Date(postAssignment.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : postAssignment.isPrimary ? '-' : 'Current'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid for remaining cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2">
        {/* Unit Assignments Card */}
        {personnel.units && personnel.units.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Unit Assignments</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {personnel.units.length} unit{personnel.units.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {personnel.units.map((unitAssignment, index) => (
                <div key={index} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {unitAssignment.unit?.name || '-'}
                    </p>
                    {unitAssignment.designation?.name && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {unitAssignment.designation.name}
                      </p>
                    )}
                  </div>
                  {index === 0 && (
                    <Tag value="Primary" severity="success" className="text-xs px-1.5 py-0.5" />
                  )}
                </div>
              ))}
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
                {personnel.createdAt ? new Date(personnel.createdAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">{createdByName}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {personnel.updatedAt ? new Date(personnel.updatedAt).toLocaleString() : '-'}
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
        header="Delete Personnel"
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
              Are you sure you want to delete <strong>{fullName}</strong>?
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

export default PersonnelView;
