import { useState, useEffect, useCallback } from 'react';
import { OverlayPanel } from 'primereact/overlaypanel';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { Badge } from 'primereact/badge';
import { useRef } from 'react';
import NotificationItem from './notification-item';
import MemoDialog from './memo-dialog';
import { notificationsRuntimeService } from '../../services/notifications.service';
import { websocketService } from '../../services/websocket.service';
import { useToast } from '../../contexts/toast-context';
import type { Notification, NotificationAction } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { Button } from 'mainFe/Button';

interface NotificationBellProps {
  contactId: string;
  token: string;
}

// Module-level Set to track shown notifications across component re-renders and HMR
const globalShownNotificationIds = new Set<string>();

const NotificationBell = ({ contactId, token }: NotificationBellProps) => {
  const op = useRef<OverlayPanel>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toast context for showing in-app popups
  const { addToast } = useToast();

  // Memo dialog state
  const [memoDialogOpen, setMemoDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [selectedAction, setSelectedAction] = useState<NotificationAction | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await notificationsRuntimeService.getMyNotifications({
        contactId: contactId,
        skip: 0,
        limit: 50,
      });

      // Map _id to id for consistency
      const mappedNotifications = response.data.map((n) => ({
        ...n,
        id: n.id || n._id || '',
      }));

      setNotifications(mappedNotifications);
      setUnreadCount(response.unreadCount ?? response.data.filter((n) => !n.readAt).length);
    } catch (err: any) {
      console.error('Failed to fetch notifications:', err);
      setError(extractErrorMessage(err, 'Failed to load notifications'));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback(
    (message: any) => {
      console.log('[NotificationBell] Received WebSocket message:', message);

      if (message.type === 'new_notification') {
        // New notification received
        const newNotification = {
          ...message.data,
          id: message.data.id || message.data._id || '',
        };

        // Check if we've already shown this notification (prevent duplicates)
        if (globalShownNotificationIds.has(newNotification.id)) {
          console.log('[NotificationBell] Duplicate notification ignored:', newNotification.id);
          return;
        }

        // Mark this notification as shown
        globalShownNotificationIds.add(newNotification.id);

        // Clear old notification IDs after 5 minutes to prevent memory leak
        setTimeout(() => {
          globalShownNotificationIds.delete(newNotification.id);
        }, 5 * 60 * 1000);

        // Actually show the notification (only if it's new)
        setNotifications((prevNotifs) => {
          // Double-check it's not already in the list
          if (prevNotifs.some(n => n.id === newNotification.id)) {
            return prevNotifs;
          }
          return [newNotification, ...prevNotifs];
        });
        setUnreadCount((prev) => prev + 1);

        // Show native browser notification (bottom-right corner)
        if (Notification.permission === 'granted') {
          const cleanBody = newNotification.body?.replace(/<[^>]*>/g, '') || newNotification.title || '';
          new Notification(newNotification.title || 'RTGS Notification', {
            body: cleanBody,
            icon: '/rtgs/logo192.png',
            badge: '/rtgs/logo192.png',
            tag: newNotification.id,
            requireInteraction: newNotification.priority === 'HIGH',
            vibrate: [200, 100, 200],
            data: {
              notificationId: newNotification.id,
              url: window.location.origin + '/rtgs/dashboard',
            },
          });
        }

        // Also show toast notification (in-app popup) for redundancy
        addToast(newNotification);
      } else if (message.type === 'notification_update' || message.type === 'notification_read' || message.type === 'notification_action') {
        // Update existing notification
        setNotifications((prev) =>
          prev.map((n) => (n.id === message.data.id || n._id === message.data._id ? { ...message.data, id: message.data.id || message.data._id || '' } : n))
        );

        // Recalculate unread count
        setNotifications((prev) => {
          const count = prev.filter((n) => !n.readAt).length;
          setUnreadCount(count);
          return prev;
        });
      }
    },
    [addToast]
  );

  // Initialize - fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Separate effect for WebSocket to avoid re-registering handlers
  useEffect(() => {
    // Connect to WebSocket if not already connected
    if (!websocketService.isConnected()) {
      websocketService.connect(contactId, token);
    }

    // Subscribe to WebSocket messages - this returns an unsubscribe function
    const unsubscribe = websocketService.onMessage(handleWebSocketMessage);

    // Cleanup - unsubscribe from messages, but keep WebSocket connected
    return () => {
      unsubscribe();
      // WebSocket persists across component lifecycle
    };
  }, [contactId, token, handleWebSocketMessage]);

  const handleBellClick = (event: React.MouseEvent<HTMLElement>) => {
    op.current?.toggle(event);
  };

  // Mark single notification as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationsRuntimeService.markAsRead(notificationId);

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      setActionLoading(true);
      await notificationsRuntimeService.markAllAsRead(contactId);

      // Update local state
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
      setUnreadCount(0);
    } catch (err: any) {
      console.error('Failed to mark all as read:', err);
      setError(extractErrorMessage(err, 'Failed to mark all as read'));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle action click
  const handleActionClick = (notification: Notification, action: NotificationAction) => {
    setSelectedNotification(notification);
    setSelectedAction(action);
    setMemoDialogOpen(true);
  };

  // Handle memo dialog confirm
  const handleMemoConfirm = async (memo: string) => {
    if (!selectedNotification || !selectedAction) return;

    try {
      setActionLoading(true);
      const response = await notificationsRuntimeService.recordAction(selectedNotification.id, {
        selectedAction: selectedAction.actionId,
        memo: memo || undefined,
      });

      // Update local state with the updated notification
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === response.notification.id
            ? { ...response.notification, id: response.notification.id || response.notification._id || '' }
            : n
        )
      );

      // Close dialog
      setMemoDialogOpen(false);
      setSelectedNotification(null);
      setSelectedAction(null);
    } catch (err: any) {
      console.error('Failed to record action:', err);
      setError(extractErrorMessage(err, 'Failed to record action'));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle memo dialog cancel
  const handleMemoCancel = () => {
    setMemoDialogOpen(false);
    setSelectedNotification(null);
    setSelectedAction(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBellClick}
        className="p-2 relative text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        aria-label="notifications"
      >
        <i className="pi pi-bell" style={{ fontSize: '1.75rem' }} />
        {unreadCount > 0 && (
          <Badge
            value={unreadCount > 99 ? '99+' : unreadCount}
            severity="danger"
            className="absolute -top-1 -right-1"
          />
        )}
      </button>

      <OverlayPanel
        ref={op}
        showCloseIcon
        className="w-[480px] max-h-[640px] shadow-xl"
        pt={{
          content: { className: 'p-0' }
        }}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-blue-25 dark:from-blue-900/20 dark:to-transparent">
          <div className="flex justify-between items-center">
            <div className="flex gap-3 items-center">
              <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center">
                <i className="pi pi-bell text-white" style={{ fontSize: '1.25rem' }} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                className="p-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <i className={`pi pi-refresh ${loading ? 'animate-spin' : ''}`} style={{ fontSize: '1.125rem' }} />
              </button>
              {unreadCount > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleMarkAllAsRead}
                  disabled={actionLoading}
                >
                  <i className="pi pi-check" style={{ fontSize: '1rem', marginRight: '0.25rem' }} />
                  Mark all read
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="m-4">
            <Message severity="error" text={error} className="w-full" />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center items-center py-16">
            <ProgressSpinner style={{ width: '50px', height: '50px' }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && notifications.length === 0 && (
          <div className="py-20 px-8 text-center flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <i className="pi pi-bell text-gray-400 opacity-40" style={{ fontSize: '2.5rem' }} />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                No notifications yet
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You're all caught up! Check back later for updates.
              </p>
            </div>
          </div>
        )}

        {/* Notification list */}
        {!loading && notifications.length > 0 && (
          <div className="max-h-[500px] overflow-y-auto py-2">
            {notifications.map((notification, index) => (
              <div key={notification.id || index}>
                <NotificationItem
                  notification={notification}
                  onActionClick={handleActionClick}
                  onMarkAsRead={handleMarkAsRead}
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && notifications.length > 0 && (
          <>
            <Divider className="my-0" />
            <div className="p-3 text-center">
              <a
                href="/rtgs/notifications"
                className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  op.current?.hide();
                  window.location.href = '/rtgs/notifications';
                }}
              >
                View all notifications
              </a>
            </div>
          </>
        )}
      </OverlayPanel>

      {/* Memo Dialog */}
      <MemoDialog
        open={memoDialogOpen}
        notification={selectedNotification}
        action={selectedAction}
        onConfirm={handleMemoConfirm}
        onCancel={handleMemoCancel}
        loading={actionLoading}
      />
    </>
  );
};

export default NotificationBell;
