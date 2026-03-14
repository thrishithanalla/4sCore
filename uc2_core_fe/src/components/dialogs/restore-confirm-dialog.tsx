import { Dialog } from 'mainFe/Dialog';
import { Button } from 'mainFe/Button';

interface RestoreConfirmDialogProps {
  visible: boolean;
  onCancel: () => void;
  onRestore: () => void;
  message?: string;
  header?: string;
  testId?: string;
  loading?: boolean;
}

/**
 * Reusable confirmation dialog for restore operations.
 *
 * @example
 * <RestoreConfirmDialog
 *   visible={restoreDialogOpen}
 *   onCancel={() => setRestoreDialogOpen(false)}
 *   onRestore={handleRestoreConfirm}
 *   message="Are you sure you want to restore this unit?"
 * />
 */
const RestoreConfirmDialog = ({
  visible,
  onCancel,
  onRestore,
  message = 'Are you sure you want to restore this item? This will make it active again.',
  header = 'Confirm Restore',
  testId = 'RestoreConfirmDialog',
  loading = false,
}: RestoreConfirmDialogProps) => {
  const footerContent = (
    <div className="flex justify-end gap-3">
      <Button label="Cancel" severity="secondary" outlined size="small" onClick={onCancel} disabled={loading} />
      <Button label={loading ? 'Restoring...' : 'Restore'} severity="success" size="small" onClick={onRestore} disabled={loading} icon={loading ? 'pi pi-spin pi-spinner' : undefined} />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onCancel}
      header={header}
      footer={footerContent}
      style={{ width: '420px' }}
      className="restore-confirm-dialog"
    >
      <div data-testid={testId} className="flex items-start gap-3">
        <i className="pi pi-refresh text-green-500 flex-shrink-0 text-2xl" />
        <p className="text-gray-600 dark:text-gray-400 m-0 text-sm leading-relaxed">
          {message}
        </p>
      </div>
    </Dialog>
  );
};

export default RestoreConfirmDialog;
