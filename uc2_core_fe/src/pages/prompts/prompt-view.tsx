/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { promptsService } from '../../services/prompts.service';
import type { Prompt } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const PromptView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'prompt',
    basePath: '/prompt-table',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.PROMPT_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.PROMPT_MASTER);

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show prompt name instead of UUID
  useBreadcrumbTitle(prompt?.name);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(prompt?.createdBy, prompt?.updatedBy);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }

    const fetchPrompt = async () => {
      try {
        setLoading(true);
        const data = await promptsService.getById(id);
        setPrompt(data);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch prompt details'));
      } finally {
        setLoading(false);
      }
    };

    fetchPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handlers
  const handleEdit = () => id && navigateToEdit(id);
  const handleDeleteClick = () => setDeleteDialogOpen(true);

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await promptsService.softDelete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete prompt'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => setDeleteDialogOpen(false);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  // Error state
  if (error || !prompt) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Prompt not found'} className="mb-4 w-full" />
        <Button
          label="Back to Prompts"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  return (
    <div className="p-3" data-testid="SCR-Prompt-View">
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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Prompt Details</h1>
        </div>
      </div>

      {/* Prompt Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-android text-purple-600 dark:text-purple-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{prompt.name}</h2>
              <Tag value={prompt.type} severity="info" className="text-xs px-1.5 py-0.5" />
              {prompt.llm && <Tag value={prompt.llm} severity="secondary" className="text-xs px-1.5 py-0.5" />}
              {prompt.tech && <Tag value={prompt.tech} severity="secondary" className="text-xs px-1.5 py-0.5" />}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {prompt.aiRole}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!((prompt as any).isDelete || prompt.isDeleted) && (
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
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Type</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.type || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">AI Role</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.aiRole || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">System Role</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.systemRole || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">LLM</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.llm || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Technology</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.tech || '-'}</p>
            </div>
          </div>
        </div>

        {/* Objective & Icon */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Objective</h2>
          <div className="grid grid-cols-1 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Objective</label>
              <p className="text-sm text-gray-900 dark:text-white">{prompt.objective || '-'}</p>
            </div>
            {prompt.iconPath && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Icon Path</label>
                <p className="text-sm text-gray-900 dark:text-white font-mono">{prompt.iconPath}</p>
              </div>
            )}
          </div>
        </div>

        {/* Task Instructions */}
        {prompt.taskInstructions && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Task Instructions</h2>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                {prompt.taskInstructions}
              </pre>
            </div>
          </div>
        )}

        {/* Task Input */}
        {prompt.taskInput && (
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Task Input</h2>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                {prompt.taskInput}
              </pre>
            </div>
          </div>
        )}

        {/* Task Output Format */}
        {prompt.taskOutputFormat && (
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Output Format</h2>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                {prompt.taskOutputFormat}
              </pre>
            </div>
          </div>
        )}

        {/* Task Example */}
        {prompt.taskExample && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Task Example</h2>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                {typeof prompt.taskExample === 'string'
                  ? prompt.taskExample
                  : JSON.stringify(prompt.taskExample, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Settings JSON */}
        {prompt.settingsJson && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Settings</h2>
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono">
                {typeof prompt.settingsJson === 'string'
                  ? prompt.settingsJson
                  : JSON.stringify(prompt.settingsJson, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Audit Information */}
        {/* <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Audit Information</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white">{formatDateTime(prompt.createdAt)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white">{createdByName}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white">{formatDateTime(prompt.updatedAt)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white">{updatedByName}</p>
            </div>
          </div>
        </div> */}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        visible={deleteDialogOpen}
        onCancel={handleDeleteCancel}
        onDelete={handleDeleteConfirm}
        message="Are you sure you want to delete this prompt? This is a soft delete and the data will be preserved but marked as deleted."
        testId="PromptView.Dialog.Delete"
      />
    </div>
  );
};

export default PromptView;
