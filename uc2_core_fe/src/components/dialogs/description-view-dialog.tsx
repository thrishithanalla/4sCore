import { Dialog } from 'mainFe/Dialog';
import { Button } from 'mainFe/Button';

interface DescriptionViewDialogProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description: string | null | undefined;
  testId?: string;
}

/**
 * Reusable dialog for viewing full description content.
 *
 * @example
 * <DescriptionViewDialog
 *   visible={descriptionDialogOpen}
 *   onClose={() => setDescriptionDialogOpen(false)}
 *   title="Role Description"
 *   description={selectedDescription}
 * />
 */
const DescriptionViewDialog = ({
  visible,
  onClose,
  title = 'Description',
  description,
  testId = 'DescriptionViewDialog',
}: DescriptionViewDialogProps) => {
  const footerContent = (
    <div className="flex justify-end">
      <Button
        label="Close"
        variant="secondary"
        size="small"
        onClick={onClose}
        icon="pi pi-times"
      />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onClose}
      header={title}
      footer={footerContent}
      style={{ width: '600px', maxWidth: '90vw' }}
      className="description-view-dialog"
      data-testid={testId}
    >
      <div className="py-2">
        <p className="text-gray-700 dark:text-gray-300 m-0 text-sm leading-relaxed whitespace-pre-wrap">
          {description || 'No description provided'}
        </p>
      </div>
    </Dialog>
  );
};

export default DescriptionViewDialog;
