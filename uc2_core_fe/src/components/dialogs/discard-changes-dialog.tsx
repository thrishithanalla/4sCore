import { Dialog } from 'mainFe/Dialog';
import { Button } from 'mainFe/Button';

interface DiscardChangesDialogProps {
  visible: boolean;
  onStay: () => void;
  onLeave: () => void;
  testId?: string;
}

/**
 * Reusable confirmation dialog for discarding unsaved changes.
 * Use this component with useNavigationBlocker hook.
 *
 * @example
 * const { showLeaveDialog, confirmLeave, cancelLeave, handleNavigate } = useNavigationBlocker({ when: isDirty });
 *
 * <DiscardChangesDialog
 *   visible={showLeaveDialog}
 *   onStay={cancelLeave}
 *   onLeave={confirmLeave}
 * />
 */
const DiscardChangesDialog = ({
  visible,
  onStay,
  onLeave,
  testId = 'DiscardChangesDialog',
}: DiscardChangesDialogProps) => {
  const footerContent = (
    <div className="flex justify-end gap-3">
      <Button label="Cancel" severity="secondary" outlined size="small" onClick={onStay} />
      <Button label="Leave" severity="danger" size="small" onClick={onLeave} />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onStay}
      header="Discard Changes"
      footer={footerContent}
      style={{ width: '420px' }}
      className="discard-changes-dialog"
    >
      <div data-testid={testId}>
        <p className="text-gray-600 dark:text-gray-400 m-0 text-sm leading-relaxed">
          You have unsaved changes. Are you sure you want to leave this page? All unsaved changes will be lost.
        </p>
      </div>
    </Dialog>
  );
};

export default DiscardChangesDialog;
