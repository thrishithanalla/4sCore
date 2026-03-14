import { Dialog } from 'primereact/dialog';
import JobForm from '../../pages/jobs/job-form';

interface JobCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newJob: { _id: string; name: string }) => void;
  moduleId?: string; // Optional: if provided, creates embedded job in module
}

const JobCreateDialog = ({ open, onClose, onSuccess, moduleId }: JobCreateDialogProps) => {
  const handleSuccess = (newJob: { _id: string; name: string }) => {
    onSuccess(newJob);
    // Delay closing the dialog to allow toast to be visible
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const dialogHeader = (
    <div className="flex items-center gap-2">
      <i className="pi pi-briefcase text-blue-600" style={{ fontSize: '1.25rem' }} />
      <span className="text-lg font-semibold">Create New Job</span>
    </div>
  );

  return (
    <Dialog
      visible={open}
      onHide={onClose}
      header={dialogHeader}
      style={{ width: '480px' }}
      modal
      draggable={false}
      resizable={false}
      closable
      closeOnEscape
      contentClassName="p-0"
      data-testid="JobCreateDialog"
    >
      <div className="p-4">
        <JobForm
          dialogMode={true}
          onSuccess={handleSuccess}
          onCancel={onClose}
          moduleId={moduleId}
        />
      </div>
    </Dialog>
  );
};

export default JobCreateDialog;
