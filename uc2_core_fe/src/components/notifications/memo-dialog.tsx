import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { useState } from 'react';
import type { Notification, NotificationAction } from '../../types';
import { Button } from 'mainFe/Button';

interface MemoDialogProps {
  open: boolean;
  notification: Notification | null;
  action: NotificationAction | null;
  onConfirm: (memo: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const MemoDialog = ({ open, notification, action, onConfirm, onCancel, loading }: MemoDialogProps) => {
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    // Validate memo if required
    if (action?.requiresMemo && !memo.trim()) {
      setError('Memo is required for this action');
      return;
    }

    onConfirm(memo.trim());
    setMemo(''); // Reset memo
    setError('');
  };

  const handleCancel = () => {
    setMemo('');
    setError('');
    onCancel();
  };

  if (!notification || !action) return null;

  const footerContent = (
    <div className="flex justify-end gap-2 pt-4">
      <Button variant="outlined" onClick={handleCancel} disabled={loading}>
        Cancel
      </Button>
      <Button
        variant={action.style === 'danger' ? 'danger' : 'primary'}
        onClick={handleConfirm}
        disabled={loading}
      >
        {loading ? 'Processing...' : action.label}
      </Button>
    </div>
  );

  return (
    <Dialog
      visible={open}
      onHide={handleCancel}
      header={
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {action.confirmMessage || `Confirm Action: ${action.label}`}
        </h3>
      }
      footer={footerContent}
      className="w-full max-w-lg"
      modal
      closable={!loading}
    >
      <div className="space-y-4">
        {/* Notification details */}
        <div className="mb-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Notification:</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {notification.title}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {notification.body}
          </p>
        </div>

        {/* Action confirmation message */}
        {action.confirmMessage && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg flex items-start gap-2">
            <i className="pi pi-exclamation-circle text-amber-500 flex-shrink-0 mt-0.5" style={{ fontSize: '1.25rem' }} />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {action.confirmMessage}
            </p>
          </div>
        )}

        {/* Memo input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {action.requiresMemo ? 'Memo (Required)' : 'Memo (Optional)'}
          </label>
          <InputTextarea
            value={memo}
            onChange={(e) => {
              setMemo(e.target.value);
              if (error) setError('');
            }}
            placeholder="Add a comment or reason for this action..."
            rows={4}
            className={`w-full ${error ? 'p-invalid' : ''}`}
            autoFocus
          />
          {error && (
            <small className="text-red-600">{error}</small>
          )}
        </div>

        {action.requiresMemo && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A memo is required for this action. Please provide a reason or comment.
          </p>
        )}
      </div>
    </Dialog>
  );
};

export default MemoDialog;
