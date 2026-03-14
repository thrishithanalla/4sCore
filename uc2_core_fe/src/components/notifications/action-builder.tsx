import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { InputSwitch } from 'primereact/inputswitch';
import type { NotificationAction, NotificationActionType, NotificationActionStyle } from '../../types';
import { Button } from 'mainFe/Button';

interface ActionBuilderProps {
  actions: NotificationAction[];
  onChange: (actions: NotificationAction[]) => void;
  error?: string | undefined;
}

const actionTypeOptions: { value: NotificationActionType; label: string }[] = [
  { value: 'button', label: 'Button' },
  { value: 'link', label: 'Link' },
  { value: 'deeplink', label: 'Deep Link' },
];

const actionStyleOptions: { value: NotificationActionStyle; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'success', label: 'Success' },
  { value: 'danger', label: 'Danger' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

const ActionBuilder = ({ actions, onChange, error }: ActionBuilderProps) => {
  const handleAddAction = () => {
    const newAction: NotificationAction = {
      actionId: `action_${Date.now()}`,
      label: '',
      actionType: 'button',
      style: 'primary',
      requiresMemo: false,
      url: null,
      icon: null,
      confirmMessage: null,
    };
    onChange([...actions, newAction]);
  };

  const handleRemoveAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const handleUpdateAction = (index: number, field: keyof NotificationAction, value: any) => {
    const updated = actions.map((action, i) => {
      if (i === index) {
        return { ...action, [field]: value };
      }
      return action;
    });
    onChange(updated);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-base font-semibold text-gray-900 dark:text-white">
          Notification Actions
        </h4>
        <Button
          variant="outlined"
          size="small"
          onClick={handleAddAction}
        >
          <i className="pi pi-plus" style={{ fontSize: '1rem', marginRight: '0.25rem' }} />
          Add Action
        </Button>
      </div>

      {error && typeof error === 'string' && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {actions.length === 0 && (
        <div className="p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No actions defined. Click "Add Action" to create notification actions.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {actions.map((action, index) => (
          <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
            <div className="space-y-4">
              {/* Header with delete button */}
              <div className="flex justify-between items-center">
                <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Action {index + 1}
                </h5>
                <button
                  type="button"
                  className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  onClick={() => handleRemoveAction(index)}
                  aria-label="action"
                >
                  <i className="pi pi-trash" style={{ fontSize: '1.125rem' }} />
                </button>
              </div>

              {/* Row 1: Action ID and Label */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Action ID *
                  </label>
                  <InputText
                    value={action.actionId}
                    onChange={(e) => handleUpdateAction(index, 'actionId', e.target.value)}
                    placeholder="e.g., approve, reject"
                    className="w-full"
                  />
                  <small className="text-gray-500 dark:text-gray-400">Unique identifier for this action</small>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Label *
                  </label>
                  <InputText
                    value={action.label}
                    onChange={(e) => handleUpdateAction(index, 'label', e.target.value)}
                    placeholder="e.g., Approve, Reject"
                    className="w-full"
                  />
                  <small className="text-gray-500 dark:text-gray-400">Display text for the button</small>
                </div>
              </div>

              {/* Row 2: Action Type and Style */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Action Type *
                  </label>
                  <Dropdown
                    value={action.actionType}
                    options={actionTypeOptions}
                    onChange={(e) => handleUpdateAction(index, 'actionType', e.value)}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Style *
                  </label>
                  <Dropdown
                    value={action.style}
                    options={actionStyleOptions}
                    onChange={(e) => handleUpdateAction(index, 'style', e.value)}
                    optionLabel="label"
                    optionValue="value"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Row 3: URL and Icon (optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    URL (optional)
                  </label>
                  <InputText
                    value={action.url || ''}
                    onChange={(e) => handleUpdateAction(index, 'url', e.target.value || null)}
                    placeholder="https://example.com or /path"
                    className="w-full"
                  />
                  <small className="text-gray-500 dark:text-gray-400">For link or deeplink actions</small>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Icon (optional)
                  </label>
                  <InputText
                    value={action.icon || ''}
                    onChange={(e) => handleUpdateAction(index, 'icon', e.target.value || null)}
                    placeholder="e.g., check, x, eye"
                    className="w-full"
                  />
                  <small className="text-gray-500 dark:text-gray-400">Icon identifier</small>
                </div>
              </div>

              {/* Row 4: Confirm Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Confirmation Message (optional)
                </label>
                <InputTextarea
                  value={action.confirmMessage || ''}
                  onChange={(e) => handleUpdateAction(index, 'confirmMessage', e.target.value || null)}
                  rows={2}
                  placeholder="Are you sure you want to perform this action?"
                  className="w-full"
                />
                <small className="text-gray-500 dark:text-gray-400">Optional confirmation dialog message</small>
              </div>

              {/* Row 5: Requires Memo Switch */}
              <div className="flex items-center gap-2">
                <InputSwitch
                  checked={action.requiresMemo}
                  onChange={(e) => handleUpdateAction(index, 'requiresMemo', e.value)}
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Requires Memo/Comment
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActionBuilder;
