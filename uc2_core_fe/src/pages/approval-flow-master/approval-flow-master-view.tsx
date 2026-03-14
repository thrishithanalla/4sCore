/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { approvalFlowMasterService, type ApprovalFlowMaster } from '../../services/approval-flow-master.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

/* ---------------------------------------------------------------------- */
/* Full ApprovalFlowMasterView component */
/* ---------------------------------------------------------------------- */
const ApprovalFlowMasterView: React.FC = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'approval-flow-master',
    basePath: '/approval-flow-master',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.APPROVAL_FLOW_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.APPROVAL_FLOW_MASTER);

  const [approvalFlow, setApprovalFlow] = useState<ApprovalFlowMaster | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show approval flow name instead of UUID
  useBreadcrumbTitle(approvalFlow?.flowName);

  // Collect all personnel IDs for lookup (createdBy, updatedBy, and all targetUserIds from furtherProcess)
  const personnelIds = React.useMemo(() => {
    if (!approvalFlow) return [];
    const ids: (string | null | undefined)[] = [
      approvalFlow.createdBy,
      approvalFlow.updatedBy,
      ...(approvalFlow.furtherProcess?.map((step: any) => step.targetUserId) || []),
    ];
    return ids;
  }, [approvalFlow]);

  // Use cached personnel lookup for names
  const { getName: getPersonnelName } = usePersonnelNames(personnelIds);

  /* -------------------------------------------------------------------- */
  /* Fetch approval flow master details when `id` changes */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }

    let mounted = true;

    const loadApprovalFlow = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await approvalFlowMasterService.getById(id);
        if (mounted) setApprovalFlow(data);
      } catch (err: any) {
        if (mounted) {
          setError(extractErrorMessage(err, 'Failed to fetch approval flow details'));
          setApprovalFlow(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadApprovalFlow();

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
      await approvalFlowMasterService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete approval flow'));
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

  if (error || !approvalFlow) {
    return (
      <div className="p-3">
        <Message severity="error" text={error || 'Approval flow not found'} className="mb-4 w-full" />
        <Button
          label="Back to Approval Flows"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
          size="small"
        />
      </div>
    );
  }

  // Dialog footer
  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={() => setDeleteDialogOpen(false)} />
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} />
    </div>
  );

  /* -------------------------------------------------------------------- */
  /* Render main UI */
  /* -------------------------------------------------------------------- */
  return (
    <div className="p-3" data-testid="SCR-ApprovalFlowMaster-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Approval Flow Details</h1>
        </div>
      </div>

      {/* Approval Flow Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-sitemap text-blue-600 dark:text-blue-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{approvalFlow.flowName}</h2>
              {approvalFlow.isDelete ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : approvalFlow.isActive ? (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Inactive" severity="warning" className="text-xs px-1.5 py-0.5" />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {approvalFlow.module?.name || 'Approval Flow Configuration'}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!approvalFlow.isDelete && (
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
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Flow Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{approvalFlow.flowName || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Module</label>
              <p className="text-sm text-gray-900 dark:text-white">{approvalFlow.module?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">District</label>
              <p className="text-sm text-gray-900 dark:text-white">{approvalFlow.district?.name || '-'}</p>
            </div>
            {approvalFlow.description && (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Description</label>
                <p className="text-sm text-gray-900 dark:text-white">{approvalFlow.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Final Approval Configuration */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Final Approval Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Final Approval Unit</label>
              <p className="text-sm text-gray-900 dark:text-white">{approvalFlow.finalApprovalUnit?.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Final Approval Postcode</label>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">{approvalFlow.finalApprovalPostCode || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">If Rejected</label>
              <div>
                <Tag value={approvalFlow.ifRejected} severity="secondary" />
              </div>
            </div>
          </div>
        </div>

        {/* Further Process Steps */}
        {approvalFlow.furtherProcess && approvalFlow.furtherProcess.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Further Process Steps ({approvalFlow.furtherProcess.length})
            </h2>

            <div className="space-y-2">
              {approvalFlow.furtherProcess.map((step, index) => (
                <div key={index} className="border border-gray-200 dark:border-gray-700 rounded p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium px-2 py-0.5 rounded">
                      Step {index + 1}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Request Types</label>
                      <div className="flex flex-wrap gap-1">
                        {step.requestType.map((type, idx) => (
                          <Tag key={idx} value={type} severity="info" />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Target Role</label>
                      <p className="text-sm text-gray-900 dark:text-white">{step.targetRole}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Target User</label>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {getPersonnelName(step.targetUserId)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Information */}
        {/* <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                {approvalFlow.createdAt ? new Date(approvalFlow.createdAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">{getPersonnelName(approvalFlow.createdBy)}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                {approvalFlow.updatedAt ? new Date(approvalFlow.updatedAt).toLocaleString() : '-'}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">{getPersonnelName(approvalFlow.updatedBy)}</p>
            </div>
          </div>
        </div> */}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={() => setDeleteDialogOpen(false)}
        header="Delete Approval Flow"
        footer={deleteDialogFooter}
        style={{ width: '400px' }}
        modal
        dismissableMask
        data-testid="ApprovalFlowMasterView.Dialog.Delete"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <i className="pi pi-exclamation-triangle text-red-600" style={{ fontSize: '1.25rem' }} />
          </div>
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Are you sure you want to delete <strong>{approvalFlow.flowName}</strong>?
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

export default ApprovalFlowMasterView;
