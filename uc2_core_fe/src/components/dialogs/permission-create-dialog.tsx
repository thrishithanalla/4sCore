import { useState, useRef } from 'react';
import { Dialog } from 'primereact/dialog';
import { MultiSelect } from 'primereact/multiselect';
import { ProgressSpinner } from 'primereact/progressspinner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { valueSetsService } from '../../services/value-sets.service';
import { permissionsService } from '../../services/permissions.service';

interface PermissionCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  moduleId?: string;
  jobId?: string;
}

const PermissionCreateDialog = ({ open, onClose, onSuccess, moduleId, jobId }: PermissionCreateDialogProps) => {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const toast = useRef<Toast>(null);
  const queryClient = useQueryClient();

  // Fetch permissions from value-sets API (same as job form)
  const { data: permissionsData, isLoading } = useQuery({
    queryKey: ['value-sets', 'PERMISSIONS'],
    queryFn: () => valueSetsService.getByKey('PERMISSIONS'),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
  });

  // Mutation for adding permissions to job (same as job form)
  const addPermissionsMut = useMutation({
    mutationFn: ({ moduleId, jobId, allowedPermissions }: { moduleId: string; jobId: string; allowedPermissions: string[] }) =>
      permissionsService.addToJob(moduleId, jobId, allowedPermissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.invalidateQueries({ queryKey: ['module-hierarchy'] });
      toast.current?.show({ severity: 'success', summary: 'Success', detail: 'Permissions added to job successfully', life: 3000 });
      onSuccess();
      setSelectedPermissions([]);
    },
    onError: (error: any) => {
      const errorMsg = error?.response?.data?.detail?.message || error?.message || 'Failed to add permissions';
      toast.current?.show({ severity: 'error', summary: 'Error', detail: errorMsg, life: 10000 });
    },
  });

  // Transform permissions: display code, use label as value (same as job form)
  const permissionOptions = (permissionsData?.items || []).map((item) => ({
    label: item.code, // Display the code (e.g., "CREATE")
    value: item.label, // Use label as value (e.g., "Create")
  }));

  const handleAdd = () => {
    if (selectedPermissions.length > 0 && moduleId && jobId) {
      addPermissionsMut.mutate({ moduleId, jobId, allowedPermissions: selectedPermissions });
    }
  };

  const handleClose = () => {
    setSelectedPermissions([]);
    onClose();
  };

  const dialogHeader = (
    <div className="flex items-center gap-2">
      <i className="pi pi-lock text-blue-600" style={{ fontSize: '1.25rem' }} />
      <span className="text-lg font-semibold">Add Permissions</span>
    </div>
  );

  const isSaving = addPermissionsMut.isPending;

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <Dialog
        visible={open}
        onHide={handleClose}
        header={dialogHeader}
        style={{ width: '480px' }}
        modal
        draggable={false}
        resizable={false}
        closable
        closeOnEscape
        contentClassName="p-0"
        data-testid="PermissionCreateDialog"
      >
        <div className="p-4">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <ProgressSpinner style={{ width: '50px', height: '50px' }} />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Permissions <span className="text-red-500">*</span>
                </label>
                <MultiSelect
                  value={selectedPermissions}
                  options={permissionOptions}
                  onChange={(e) => setSelectedPermissions(e.value)}
                  placeholder="Select permissions..."
                  filter
                  filterPlaceholder="Search permissions..."
                  display="chip"
                  className="w-full"
                  disabled={isSaving}
                  data-testid="PermissionCreateDialog.MultiSelect.Permissions"
                />
                <small className="text-gray-500 text-xs mt-1">
                  Select which permissions to add to this job
                </small>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  label="Cancel"
                  severity="secondary"
                  outlined
                  onClick={handleClose}
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  label={isSaving ? 'Adding...' : 'Add Permissions'}
                  icon={isSaving ? 'pi pi-spin pi-spinner' : 'pi pi-plus'}
                  onClick={handleAdd}
                  disabled={selectedPermissions.length === 0 || isSaving}
                  testId="PermissionCreateDialog.Button.Add"
                />
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
};

export default PermissionCreateDialog;
