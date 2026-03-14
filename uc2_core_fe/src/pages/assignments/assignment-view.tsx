/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { Tag } from 'mainFe/Tag';
import { Message } from 'mainFe/Message';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { assignmentService, type Assignment, type PopulatedRoleInfo } from '../../services/assignment.service';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

// Extended assignment type with populated fields
interface AssignmentWithDetails extends Assignment {
  user?: { _id: string; name?: string; userId?: string };
  unit?: { _id: string; name?: string };
  post?: {
    postCode: string;
    postName?: string;
    isUnitHead?: boolean;
    assignedRoles?: PopulatedRoleInfo[];
    description?: string;
  };
}

const AssignmentView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'assignments',
    basePath: '/assignments',
  });
  const toast = useRef<Toast>(null);
  const canUpdate = useCanUpdate(JOB_NAMES.ASSIGNMENTS);
  const canDelete = useCanDelete(JOB_NAMES.ASSIGNMENTS);

  const [assignment, setAssignment] = useState<AssignmentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);


  // Set breadcrumb title
  useBreadcrumbTitle(
    assignment
      ? `${assignment.user?.name || assignment.user?.userId || 'Assignment'}`
      : 'Assignment Details'
  );

  // Stable fetch function
  const loadAssignment = useCallback(async () => {
    try {
      setLoading(true);
      const data = await assignmentService.getById(id!);
      setAssignment(data as AssignmentWithDetails);
    } catch (err: any) {
      console.error('Failed to load assignment:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to load assignment'),
        life: 10000,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Only fetch when isReady is true (decryption complete)
  useEffect(() => {
    if (!isReady || !id) {
      return;
    }
    loadAssignment();
  }, [isReady, id, loadAssignment]);

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      await assignmentService.delete(id!);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Assignment deleted successfully',
        life: 3000,
      });
      navigateToList();
    } catch (err: any) {
      console.error('Failed to delete assignment:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to delete assignment'),
        life: 10000,
      });
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
    }
  };


  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-4">
        <Message severity="error" text="Assignment not found" className="mb-4 w-full" />
        <Button
          label="Back to Assignments"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.ASSIGNMENTS}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-Assignment-View">
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
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Assignment Details</h1>
          </div>
        </div>

        {/* Assignment Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-user text-blue-600 dark:text-blue-400" style={{ fontSize: '1.25rem' }} />
            </div>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {assignment.user?.name || assignment.user?.userId || 'Unknown User'}
                </h2>
                {assignment.isPrimary && (
                  <Tag value="Primary" severity="success" className="text-xs px-1.5 py-0.5" />
                )}
                {assignment.isActive !== false ? (
                  <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
                ) : (
                  <Tag value="Inactive" severity="warning" className="text-xs px-1.5 py-0.5" />
                )}
                {assignment.isDelete && (
                  <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {assignment.unit?.name || 'Unknown Unit'} - {assignment.post?.postName || assignment.postCode || 'Unknown Post'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {!assignment.isDelete && (
            <div className="flex gap-1.5 sm:self-center">

              {canUpdate && (
                <Button
                  label="Edit"
                  icon="pi pi-pencil"
                  size="small"
                  onClick={handleEdit}
                  testId="AssignmentView.Button.Edit"
                />
              )}
              {canDelete && (
                <Button
                  label="Delete"
                  icon="pi pi-trash"
                  severity="danger"
                  size="small"
                  onClick={() => setDeleteDialogOpen(true)}
                  testId="AssignmentView.Button.Delete"
                />
              )}
            </div>
          )}
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-3">
            {/* Personnel & Unit Info Section */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
              <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i className="pi pi-user text-blue-600" style={{ fontSize: '0.875rem' }} />
                  Personnel & Unit Details
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Personnel Name</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">
                    {assignment.user?.name || '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">User ID</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium font-mono mt-0.5">
                    {assignment.user?.userId || '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unit</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">
                    {assignment.unit?.name || '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Post Code</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium font-mono mt-0.5">
                    {assignment.postCode || '-'}
                  </p>
                </div>
              </div>
              {assignment.post?.description && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Post Description</label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {assignment.post.description}
                  </p>
                </div>
              )}
            </div>

            {/* Status & Period Section */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
              <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-200 dark:border-gray-700 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i className="pi pi-calendar text-blue-600" style={{ fontSize: '0.875rem' }} />
                  Status & Assignment Period
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {assignment.isActive ? (
                    <Tag value="Active" severity="success" />
                  ) : (
                    <Tag value="Inactive" severity="warning" />
                  )}
                  {assignment.isPrimary ? (
                    <Tag value="Primary Post" severity="info" />
                  ) : (
                    <Tag value="Secondary" severity="secondary" />
                  )}
                  {assignment.post?.isUnitHead && (
                    <Tag value="Unit Head" severity="warning" />
                  )}
                  {assignment.isDelete && <Tag value="Deleted" severity="danger" />}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Start Date</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">
                    {assignment.startDate
                      ? new Date(assignment.startDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Not set'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">End Date</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">
                    {assignment.endDate
                      ? new Date(assignment.endDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Ongoing'}
                  </p>
                </div>
              </div>
            </div>

            {/* Inherited Roles Section */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
              <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i className="pi pi-shield text-blue-600" style={{ fontSize: '0.875rem' }} />
                  Inherited Roles ({assignment.post?.assignedRoles?.length || 0})
                </h3>
              </div>

              {assignment.post?.assignedRoles && assignment.post.assignedRoles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {assignment.post.assignedRoles.map((role: PopulatedRoleInfo) => (
                    <div
                      key={role._id}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <i className="pi pi-key text-amber-600 dark:text-amber-400" style={{ fontSize: '0.75rem' }} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{role.roleName}</p>
                        {role.roleShortCode && (
                          <p className="text-xs text-gray-500 font-mono">{role.roleShortCode}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  <i className="pi pi-info-circle text-lg" />
                  <p className="text-sm mt-1">No roles assigned to this post</p>
                </div>
              )}
            </div>

            {/* Additional/Exclusion Permissions Section */}
            {((assignment.additionalPermissions && assignment.additionalPermissions.length > 0) ||
              (assignment.exclusionPermissions && assignment.exclusionPermissions.length > 0)) && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
                <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <i className="pi pi-sliders-h text-blue-600" style={{ fontSize: '0.875rem' }} />
                    Permission Overrides
                  </h3>
                </div>

                <Accordion multiple>
                  {assignment.additionalPermissions && assignment.additionalPermissions.length > 0 && (
                    <AccordionTab
                      header={
                        <div className="flex items-center gap-2">
                          <i className="pi pi-plus-circle text-green-600" style={{ fontSize: '0.875rem' }} />
                          <span className="text-sm">Additional Permissions ({assignment.additionalPermissions.length})</span>
                        </div>
                      }
                    >
                      <div className="space-y-2">
                        {assignment.additionalPermissions.map((perm, idx) => (
                          <div key={idx} className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              Module: {perm.moduleId} | Job: {perm.jobId}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {perm.permissions.map((p) => (
                                <Tag key={p} value={p} severity="success" className="text-xs" />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionTab>
                  )}

                  {assignment.exclusionPermissions && assignment.exclusionPermissions.length > 0 && (
                    <AccordionTab
                      header={
                        <div className="flex items-center gap-2">
                          <i className="pi pi-minus-circle text-red-600" style={{ fontSize: '0.875rem' }} />
                          <span className="text-sm">Excluded Permissions ({assignment.exclusionPermissions.length})</span>
                        </div>
                      }
                    >
                      <div className="space-y-2">
                        {assignment.exclusionPermissions.map((perm, idx) => (
                          <div key={idx} className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              Module: {perm.moduleId} | Job: {perm.jobId}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {perm.permissions.map((p) => (
                                <Tag key={p} value={p} severity="danger" className="text-xs" />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionTab>
                  )}
                </Accordion>
              </div>
            )}

            {/* Audit Info */}
            {/* <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5">
              <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <i className="pi pi-history text-blue-600" style={{ fontSize: '0.875rem' }} />
                  Audit Information
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created By</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">{assignment.createdBy || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Created At</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">
                    {assignment.createdAt
                      ? new Date(assignment.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '-'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Updated By</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">{assignment.updatedBy || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Updated At</label>
                  <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">
                    {assignment.updatedAt
                      ? new Date(assignment.updatedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '-'}
                  </p>
                </div>
              </div>
            </div> */}
        </div>
      </div>

      {/* Delete Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={() => setDeleteDialogOpen(false)}
          onDelete={handleDelete}
          message="Are you sure you want to delete this assignment? This will also clear the user from the post."
          testId="AssignmentView.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default AssignmentView;
