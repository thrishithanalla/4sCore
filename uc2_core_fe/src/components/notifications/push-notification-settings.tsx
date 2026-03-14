import React, { useState, useEffect } from 'react';
import { RadioButton } from 'primereact/radiobutton';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import pushNotificationService from '../../services/push-notification.service';

interface PushNotificationSettingsProps {
  contactId: string;
  token: string;
  onSubscriptionChange?: (subscribed: boolean) => void;
}

const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({ contactId, token, onSubscriptionChange }) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if browser supports push notifications
      const supported = pushNotificationService.isSupported();
      setIsSupported(supported);

      if (!supported) {
        setError('Your browser does not support push notifications');
        setLoading(false);
        return;
      }

      // Check permission status
      const permission = pushNotificationService.getPermissionStatus();
      setPermissionStatus(permission);

      // Check subscription status
      const subscribed = await pushNotificationService.checkSubscriptionStatus();
      setIsSubscribed(subscribed);
    } catch (err: any) {
      console.error('Failed to check push notification status:', err);
      setError(err.message || 'Failed to check notification status');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChange = async (newValue: boolean) => {
    if (newValue === isSubscribed) {
      return; // No change
    }

    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      if (newValue) {
        // Subscribe to push notifications
        const result = await pushNotificationService.subscribe(contactId, token);

        setIsSubscribed(true);
        setPermissionStatus('granted');
        setSuccess('✅ Push notifications enabled! You will now receive notifications even when the app is closed.');

        console.log('Push subscription successful:', result);
        onSubscriptionChange?.(true);
      } else {
        // Unsubscribe from push notifications
        const result = await pushNotificationService.unsubscribe(contactId, token);

        setIsSubscribed(false);
        setSuccess('✅ Push notifications disabled successfully.');

        console.log('Push unsubscription successful:', result);
        onSubscriptionChange?.(false);
      }

      // Refresh status after 2 seconds
      setTimeout(() => {
        setSuccess(null);
        checkStatus();
      }, 3000);
    } catch (err: any) {
      console.error('Failed to toggle push notifications:', err);
      setError(err.message || 'Failed to update notification settings');

      // Reset to previous state
      checkStatus();
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex justify-center items-center py-8">
          <ProgressSpinner style={{ width: '40px', height: '40px' }} />
        </div>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <Message
          severity="warn"
          text="Your browser does not support push notifications. Please use a modern browser like Chrome, Firefox, or Edge."
          className="w-full"
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex gap-4 items-center">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isSubscribed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
            {isSubscribed ? <i className="pi pi-bell text-green-600" style={{ fontSize: '1.5rem' }} /> : <i className="pi pi-bell-slash text-gray-400" style={{ fontSize: '1.5rem' }} />}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Push Notifications</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Receive notifications even when the app is closed
            </p>
          </div>
          {isSubscribed && (
            <Tag
              icon={<i className="pi pi-check-circle" style={{ fontSize: '1rem', marginRight: '0.25rem' }} />}
              value="Active"
              severity="success"
              className="font-semibold"
            />
          )}
        </div>

        {/* Status Messages */}
        {error && (
          <Message severity="error" text={error} className="w-full" />
        )}

        {success && (
          <Message severity="success" text={success} className="w-full" />
        )}

        {/* Permission Warning */}
        {permissionStatus === 'denied' && (
          <Message
            severity="warn"
            className="w-full"
            content={
              <div>
                <p className="font-semibold mb-1">Permission Blocked</p>
                <p className="text-sm">
                  You have blocked notifications for this site. To enable push notifications, please update your browser settings:
                </p>
                <p className="text-xs mt-2 pl-2">
                  1. Click the lock icon in the address bar<br />
                  2. Change notification permission to "Allow"<br />
                  3. Refresh this page
                </p>
              </div>
            }
          />
        )}

        {/* Radio Group Toggle */}
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Notification Status
          </h4>
          <div className="space-y-2">
            <div
              className={`border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                isSubscribed ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
              } ${processing || permissionStatus === 'denied' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !processing && permissionStatus !== 'denied' && handleToggleChange(true)}
            >
              <div className="flex items-center gap-3">
                <RadioButton
                  inputId="push-on"
                  name="push-status"
                  value="on"
                  checked={isSubscribed}
                  onChange={() => handleToggleChange(true)}
                  disabled={processing || permissionStatus === 'denied'}
                />
                <div>
                  <label htmlFor="push-on" className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer">
                    Enabled
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Receive push notifications on this device
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                !isSubscribed ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
              } ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !processing && handleToggleChange(false)}
            >
              <div className="flex items-center gap-3">
                <RadioButton
                  inputId="push-off"
                  name="push-status"
                  value="off"
                  checked={!isSubscribed}
                  onChange={() => handleToggleChange(false)}
                  disabled={processing}
                />
                <div>
                  <label htmlFor="push-off" className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer">
                    Disabled
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    You will only see in-app notifications
                  </p>
                </div>
              </div>
            </div>
          </div>

          {processing && (
            <div className="flex items-center gap-2 mt-4">
              <ProgressSpinner style={{ width: '20px', height: '20px' }} />
              <span className="text-sm text-gray-500 dark:text-gray-400">Updating settings...</span>
            </div>
          )}
        </div>

        {/* Information */}
        <Message
          severity="info"
          className="w-full"
          content={
            <div className="flex items-start gap-2">
              <i className="pi pi-bell flex-shrink-0 mt-0.5" style={{ fontSize: '1.125rem' }} />
              <p className="text-sm">
                <strong>How it works:</strong> When enabled, you'll receive browser notifications even when the RTGS app is
                closed. Click on a notification to open the app and view details.
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default PushNotificationSettings;
