import { Dialog } from 'mainFe/Dialog';
import { Button } from 'mainFe/Button';

interface DeleteConfirmDialogProps {
  visible: boolean;
  onCancel: () => void;
  onDelete: () => void;
  message?: string;
  header?: string;
  testId?: string;
  loading?: boolean;
}

/**
 * Reusable confirmation dialog for delete operations.
 *
 * @example
 * <DeleteConfirmDialog
 *   visible={deleteDialogOpen}
 *   onCancel={() => setDeleteDialogOpen(false)}
 *   onDelete={handleDeleteConfirm}
 *   message="Are you sure you want to delete this value set? This action cannot be undone."
 * />
 */
const DeleteConfirmDialog = ({
  visible,
  onCancel,
  onDelete,
  message = 'Are you sure you want to delete this item? This action cannot be undone.',
  header = 'Confirm Delete',
  testId = 'DeleteConfirmDialog',
  loading = false,
}: DeleteConfirmDialogProps) => {
  const footerContent = (
  <div className="flex justify-end gap-3">
      <Button label="Cancel" severity="secondary" outlined size="small" onClick={onCancel} disabled={loading} />
      <Button label={loading ? 'Deleting...' : 'Delete'} severity="danger" size="small" onClick={onDelete} disabled={loading} icon={loading ? 'pi pi-spin pi-spinner' : undefined} />
  </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onCancel}
      header={header}
      footer={footerContent}
      style={{ width: '420px' }}
      className="delete-confirm-dialog"
    >
      <div data-testid={testId} className="flex items-start gap-3">
        <i className="pi pi-exclamation-triangle text-amber-500 flex-shrink-0 text-2xl" />
        <p className="text-gray-600 dark:text-gray-400 m-0 text-sm leading-relaxed">
          {message}
        </p>
      </div>
    </Dialog>
  );
};

export default DeleteConfirmDialog;
