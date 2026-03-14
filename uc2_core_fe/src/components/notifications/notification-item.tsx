import { Tag } from 'primereact/tag';
import type { Notification, NotificationAction } from '../../types';
import { getRelativeTimeInIst } from '../../utils/timezone.util';
import { Button } from 'mainFe/Button';

interface NotificationItemProps {
  notification: Notification;
  onActionClick: (notification: Notification, action: NotificationAction) => void;
  onMarkAsRead?: (notificationId: string) => void;
}

const NotificationItem = ({ notification, onActionClick, onMarkAsRead }: NotificationItemProps) => {
  const isUnread = !notification.readAt;

  // Priority badge severity
  const getPrioritySeverity = (): 'danger' | 'warning' | 'info' => {
    switch (notification.priority) {
      case 'HIGH':
        return 'danger';
      case 'LOW':
        return 'info';
      default:
        return 'warning';
    }
  };

  // Action button variant based on style
  const getActionVariant = (style: string): 'primary' | 'success' | 'danger' | 'warning' | 'outlined' => {
    switch (style) {
      case 'primary':
        return 'primary';
      case 'success':
        return 'success';
      case 'danger':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'outlined';
    }
  };

  // Check if action was already taken
  const actionTaken = notification.selectedAction;

  return (
    <div
      className={`
        relative p-4 mb-1 mx-2 rounded-lg cursor-pointer transition-all duration-300
        ${isUnread
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 border-l-4 border-l-blue-500 shadow-sm'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 border-l-transparent'
        }
        hover:border-blue-500 hover:translate-x-1 hover:shadow-lg
      `}
      onClick={() => {
        if (isUnread && onMarkAsRead) {
          onMarkAsRead(notification.id);
        }
      }}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      )}

      <div className="space-y-3">
        {/* Header: Title and timestamp */}
        <div className="flex justify-between items-start gap-4">
          <h4 className={`text-base flex-1 pr-4 leading-snug ${isUnread ? 'font-bold' : 'font-semibold'} text-gray-900 dark:text-white`}>
            {notification.title}
          </h4>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap flex items-center gap-1">
            <i className="pi pi-clock" style={{ fontSize: '0.75rem' }} />
            {getRelativeTimeInIst(notification.createdDateTime)}
          </span>
        </div>

        {/* Body message */}
        <div
          className={`text-sm leading-relaxed text-gray-600 dark:text-gray-300 ${isUnread ? 'font-medium' : ''}`}
          dangerouslySetInnerHTML={{ __html: notification.body }}
        />

        {/* Badges: Priority and Status */}
        <div className="flex gap-2 items-center flex-wrap">
          {notification.priority !== 'NORMAL' && (
            <Tag
              value={notification.priority}
              severity={getPrioritySeverity()}
              className="text-xs font-bold"
            />
          )}
          {actionTaken && (
            <Tag
              icon={<i className="pi pi-check-circle" style={{ fontSize: '0.875rem', marginRight: '0.25rem' }} />}
              value={`Completed: ${actionTaken}`}
              severity="success"
              className="text-xs font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700"
            />
          )}
        </div>

        {/* Action taken memo */}
        {actionTaken && notification.memo && (
          <div className="pl-4 pr-4 py-3 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/30 rounded-r-lg mt-1">
            <p className="text-xs font-medium text-green-700 dark:text-green-300">
              <strong>Memo:</strong> {notification.memo}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {!actionTaken && notification.availableActions && notification.availableActions.length > 0 && (
          <div
            className="flex gap-2 mt-1 flex-wrap"
            onClick={(e) => e.stopPropagation()} // Prevent triggering parent onClick
          >
            {notification.availableActions.map((action) => (
              <Button
                key={action.actionId}
                variant={action.style === 'primary' ? 'primary' : getActionVariant(action.style)}
                size="small"
                onClick={() => onActionClick(notification, action)}
              >
                {action.icon && getActionIcon(action.icon)}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to get icon component based on icon name
const getActionIcon = (iconName: string) => {
  const icons: Record<string, React.ReactElement> = {
    check: <i className="pi pi-check-circle" style={{ fontSize: '1rem', marginRight: '0.25rem' }} />,
    x: <i className="pi pi-times" style={{ fontSize: '1rem', marginRight: '0.25rem' }} />,
    eye: <i className="pi pi-eye" style={{ fontSize: '1rem', marginRight: '0.25rem' }} />,
  };
  return icons[iconName] || null;
};

export default NotificationItem;
