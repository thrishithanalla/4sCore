import React from 'react';
import { Tag } from 'primereact/tag';
import type { ToastNotification } from '../../contexts/toast-context';
import { getRelativeTimeInIst } from '../../utils/timezone.util';
import { Button } from 'mainFe/Button';

interface ToastNotificationProps {
  toast: ToastNotification;
  onClose: () => void;
  onActionClick?: (toast: ToastNotification) => void;
}

const ToastNotificationComponent: React.FC<ToastNotificationProps> = ({ toast, onClose, onActionClick }) => {
  // Priority badge severity
  const getPrioritySeverity = (): 'danger' | 'warning' | 'info' => {
    switch (toast.priority) {
      case 'HIGH':
        return 'danger';
      case 'LOW':
        return 'info';
      default:
        return 'warning';
    }
  };

  // Get first primary action (if any)
  const primaryAction = toast.availableActions?.find((action) => action.style === 'primary');

  return (
    <div
      className={`
        w-[400px] mb-4 rounded-lg overflow-hidden shadow-xl
        border-l-4 bg-white dark:bg-gray-800 relative
        transition-all duration-300 hover:shadow-2xl hover:-translate-x-1
        ${toast.priority === 'HIGH' ? 'border-l-red-500' : 'border-l-blue-500'}
        animate-slide-in-right
      `}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2 right-2 z-10 p-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
      >
        <i className="pi pi-times text-gray-500" style={{ fontSize: '1.125rem' }} />
      </button>

      <div className="p-4 pr-10">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <h4 className="text-base font-bold text-gray-900 dark:text-white leading-snug">
                {toast.title}
              </h4>
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                <i className="pi pi-clock" style={{ fontSize: '0.625rem' }} />
                {getRelativeTimeInIst(toast.createdDateTime)}
              </span>
            </div>

            {/* Priority badge */}
            {toast.priority !== 'NORMAL' && (
              <Tag
                value={toast.priority}
                severity={getPrioritySeverity()}
                className="text-xs font-bold"
              />
            )}
          </div>

          {/* Body */}
          <div
            className="text-sm leading-relaxed text-gray-600 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: toast.body }}
          />

          {/* Actions */}
          {primaryAction && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  if (onActionClick) {
                    onActionClick(toast);
                  }
                  onClose();
                }}
              >
                {primaryAction.label}
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={onClose}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToastNotificationComponent;
