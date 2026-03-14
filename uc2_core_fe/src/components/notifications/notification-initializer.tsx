import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Toast } from 'primereact/toast';
import pushNotificationService from '../../services/push-notification.service';

/**
 * NotificationInitializer - Initializes notification services on app load
 *
 * This component:
 * 1. Registers service worker on mount (if supported and user is authenticated)
 * 2. Handles service worker messages
 * 3. Checks for existing push subscriptions
 * 4. Shows alerts for initialization status
 *
 * Note: WebSocket connection is handled separately in NotificationBell component
 */
const NotificationInitializer = () => {
  const user = useSelector((state: any) => state.auth.user);
  const isAuthenticated = useSelector((state: any) => state.auth.isAuthenticated);
  const toast = useRef<Toast>(null);

  const showAlert = (message: string, severity: 'success' | 'info' | 'warn' | 'error' = 'info') => {
    toast.current?.show({
      severity,
      summary: severity === 'success' ? 'Success' : severity === 'error' ? 'Error' : severity === 'warn' ? 'Warning' : 'Info',
      detail: message,
      life: 6000,
    });
  };

  useEffect(() => {
    // Only initialize if user is authenticated
    if (!isAuthenticated || !user) {
      return;
    }

    const initializeNotifications = async () => {
      try {
        // Check if browser supports push notifications
        if (!pushNotificationService.isSupported()) {
          showAlert('Push notifications not supported in this browser', 'warn');
          return;
        }

        // Check permission status
        const permission = pushNotificationService.getPermissionStatus();

        // If permission is granted, register service worker
        if (permission === 'granted') {
          try {
            const registration = await pushNotificationService.registerServiceWorker();
            console.log('[NotificationInit] Service worker registered:', registration);

            // Check if already subscribed
            const isSubscribed = await pushNotificationService.checkSubscriptionStatus();

            if (isSubscribed) {
              showAlert('✅ Push notifications are active', 'success');
            } else {
              showAlert('Enable push notifications in Settings to receive alerts when app is closed', 'info');
            }

            // Add message listener for service worker messages
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.addEventListener('message', (event) => {
                console.log('[NotificationInit] Service worker message:', event.data);

                // Handle different message types from service worker
                if (event.data.type === 'NOTIFICATION_CLICKED') {
                  showAlert(`Opening: ${event.data.notification?.title || 'Notification'}`, 'info');
                }
              });
            }
          } catch (error: any) {
            showAlert(`Failed to initialize notifications: ${error.message}`, 'error');
          }
        } else if (permission === 'default') {
          showAlert('💡 Tip: Enable notifications in Settings for real-time alerts', 'info');
        } else if (permission === 'denied') {
          showAlert('Notifications blocked. Enable them in your browser settings to receive alerts', 'warn');
        }
      } catch (error: any) {
        showAlert(`Notification initialization error: ${error.message}`, 'error');
      }
    };

    // Delay initialization to avoid showing alert immediately on page load
    const timer = setTimeout(() => {
      initializeNotifications();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user]);

  return <Toast ref={toast} position="top-right" className="mt-16" />;
};

export default NotificationInitializer;
