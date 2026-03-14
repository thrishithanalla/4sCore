import React from 'react';
import { useToast, type ToastNotification as ToastNotificationType } from '../../contexts/toast-context';
import ToastNotification from './toast-notification';

interface ToastContainerProps {
  onActionClick?: (toast: ToastNotificationType) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ onActionClick }) => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-20 right-6 z-[9999] max-w-[420px]"
      style={{ pointerEvents: 'none' }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.toastId}
            toast={toast}
            onClose={() => removeToast(toast.toastId)}
            onActionClick={onActionClick}
          />
        ))}
      </div>
    </div>
  );
};

export default ToastContainer;
