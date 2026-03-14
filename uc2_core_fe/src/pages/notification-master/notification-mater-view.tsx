/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from 'react';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { useQuery } from '@tanstack/react-query';

import { notificationsService } from '../../services/notifications-master.service';
import { modulesService } from '../../services/modules.service';
import type { NotificationMaster, NotificationAction, NotificationSettings, NotificationChannelsConfig, ChannelConfig } from '../../types/index';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const NotificationMasterView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'notificationMaster',
    basePath: '/notification-master',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.NOTIFICATION_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.NOTIFICATION_MASTER);

  const [data, setData] = useState<NotificationMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Set breadcrumb title to show notification type instead of UUID
  useBreadcrumbTitle(data?.type);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(
    data?.created_by || data?.createdBy,
    data?.updated_by || data?.updatedBy
  );

  // Fetch modules for lookup
  const { data: modules = [] } = useQuery({
    queryKey: ['modules', 'dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
    staleTime: 5 * 60 * 1000, // 5 mins
  });

  // Get module name by ID
  const getModuleName = useCallback((moduleId?: string | null) => {
    if (!moduleId) return '-';
    const module = modules.find((m: any) => m._id === moduleId);
    return module?.name || '-';
  }, [modules]);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await notificationsService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch notification master'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Channel label helper
  const getChannelLabel = (channel: string) => {
    const labels: Record<string, string> = {
      inApp: 'In-App',
      webPush: 'Web Push',
      push: 'Mobile Push (FCM)',
      email: 'Email',
      sms: 'SMS',
      whatsapp: 'WhatsApp',
    };
    return labels[channel] || channel;
  };

  // Priority color helper
  const getPriorityColor = (priority: string): 'danger' | 'warning' | 'info' | 'success' | 'secondary' => {
    switch (priority) {
      case 'URGENT': return 'danger';
      case 'HIGH': return 'warning';
      case 'NORMAL': return 'info';
      case 'LOW': return 'success';
      default: return 'secondary';
    }
  };

  // Category color helper
  const getCategoryColor = (category?: string): 'info' | 'success' | 'warning' | 'danger' | 'secondary' => {
    switch (category) {
      case 'TRANSACTIONAL': return 'info';
      case 'PROMOTIONAL': return 'success';
      case 'SYSTEM': return 'warning';
      case 'ALERT': return 'danger';
      default: return 'secondary';
    }
  };

  // Handlers
  const handleEdit = () => id && navigateToEdit(id);
  const handleDeleteClick = () => setDeleteDialogOpen(true);

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await notificationsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete notification master'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => setDeleteDialogOpen(false);

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Notification master not found'} className="mb-4 w-full" />
        <Button
          label="Back to Notification Masters"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Normalize field names
  const notificationType = data.notification_type || data.notificationType || '';
  const defaultChannels = data.default_channels || data.defaultChannels || [];
  const notificationTemplate = data.notificationTemplate || data.notification_template;
  const notificationParameters = data.notificationParameters || data.notification_parameters || [];
  const notificationActions = data.notification_actions || data.notificationActions || [];
  const channels = data.channels;
  const settings = data.settings as NotificationSettings | undefined;

  return (
    <div className="p-3" data-testid="SCR-NotificationMaster-View">
      {/* Header Section */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Button
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            rounded
            onClick={() => navigateToList()}
            className="p-0"
            style={{ width: '28px', height: '28px' }}
          />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Notification Master Details</h1>
        </div>
      </div>

      {/* Notification Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-bell text-purple-600 dark:text-purple-400" style={{ fontSize: '1.25rem' }} />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name || notificationType}</h2>
              {/* {data.active ? (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Inactive" severity="secondary" className="text-xs px-1.5 py-0.5" />
              )} */}
              {data.category && <Tag value={data.category} severity={getCategoryColor(data.category)} className="text-xs px-1.5 py-0.5" />}
              <Tag value={data.priority} severity={getPriorityColor(data.priority)} className="text-xs px-1.5 py-0.5" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data.description || 'Notification configuration'}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile */}
        {!((data as any).isDelete || data.is_deleted || data.isDeleted) && (
          <div className="flex gap-1.5 sm:self-center">
            {canUpdate && (
              <Button
                label="Edit"
                icon="pi pi-pencil"
                onClick={handleEdit}
                size="small"
              />
            )}
            {canDelete && (
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                onClick={handleDeleteClick}
                size="small"
              />
            )}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* Basic Information */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.name || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Notification Type</label>
              <p className="text-sm text-gray-900 dark:text-white font-mono">{notificationType || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Module</label>
              <p className="text-sm text-gray-900 dark:text-white">{getModuleName(data.moduleId)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Category</label>
              <div>
                {data.category ? <Tag value={data.category} severity={getCategoryColor(data.category)} className="text-xs" /> : '-'}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Priority</label>
              <div>
                <Tag value={data.priority} severity={getPriorityColor(data.priority)} className="text-xs" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Description</label>
              <p className="text-sm text-gray-900 dark:text-white">{data.description || '-'}</p>
            </div>
          </div>
        </div>

        {/* Default Channels */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Default Channels</h2>
          {defaultChannels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {defaultChannels.map((ch: string) => (
                <span
                  key={ch}
                  className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                >
                  <i className="pi pi-send mr-2 text-xs" />
                  {getChannelLabel(ch)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No channels configured</p>
          )}
        </div>

        {/* Notification Template */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Default Template</h2>
          <div className="grid grid-cols-1 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Title</label>
              <p className="text-sm text-gray-900 dark:text-white">{notificationTemplate?.title || '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Body</label>
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                {notificationTemplate?.body || '-'}
              </pre>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Allow User Opt-Out</label>
              <p className="text-sm text-gray-900 dark:text-white">{settings?.allowUserOptOut ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Retry on Failure</label>
              <p className="text-sm text-gray-900 dark:text-white">{settings?.retryOnFailure ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Max Retries</label>
              <p className="text-sm text-gray-900 dark:text-white">{settings?.maxRetries ?? '-'}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Expires After</label>
              <p className="text-sm text-gray-900 dark:text-white">
                {settings?.expiresAfterMinutes ? `${settings.expiresAfterMinutes} minutes` : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Template Parameters */}
        {notificationParameters.length > 0 && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Template Parameters ({notificationParameters.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Required</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Default</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {notificationParameters.map((param: any, index: number) => (
                    <tr key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                      <td className="py-2 px-3 text-gray-900 dark:text-white font-mono">{param.name}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">{param.type}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">{param.required ? 'Yes' : 'No'}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">
                        {param.default !== undefined && param.default !== null ? String(param.default) : '-'}
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">{param.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notification Actions */}
        {notificationActions.length > 0 && (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Notification Actions ({notificationActions.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Label</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Action ID</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Style</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">URL</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Requires Memo</th>
                  </tr>
                </thead>
                <tbody>
                  {notificationActions.map((action: NotificationAction, index: number) => (
                    <tr key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                      <td className="py-2 px-3 text-gray-900 dark:text-white">{action.label}</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono">{action.actionId}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">{action.actionType || 'navigate'}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">{action.style || 'primary'}</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{action.url || '-'}</td>
                      <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">{action.requiresMemo ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-Channel Configuration */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Per-Channel Configuration
          </h2>
          {channels && Object.keys(channels).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(channels as NotificationChannelsConfig).map(([channelKey, config]) => {
                const channelConfig = config as ChannelConfig;
                if (!channelConfig) return null;
                const template = channelConfig.template as any;
                return (
                  <div key={channelKey} className="border border-gray-200 dark:border-gray-700 rounded p-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">{getChannelLabel(channelKey)}</span>
                      {channelConfig.enabled ? (
                        <Tag value="Enabled" severity="success" className="text-xs" />
                      ) : (
                        <Tag value="Disabled" severity="secondary" className="text-xs" />
                      )}
                    </div>
                    {channelConfig.priority && (
                      <div className="text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Priority: </span>
                        <span className="text-gray-900 dark:text-white">{channelConfig.priority}</span>
                      </div>
                    )}
                    {/* Email specific fields */}
                    {channelKey === 'email' && template && (
                      <>
                        {template.subject && (
                          <div className="text-sm mt-2">
                            <span className="text-gray-500 dark:text-gray-400">Subject: </span>
                            <span className="text-gray-900 dark:text-white">{template.subject}</span>
                          </div>
                        )}
                        {template.body && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Body: </span>
                            <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-sans text-sm mt-1">{template.body}</pre>
                          </div>
                        )}
                        {template.htmlBody && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">HTML Body: </span>
                            <span className="text-green-600 dark:text-green-400 text-xs">Configured</span>
                          </div>
                        )}
                      </>
                    )}
                    {/* SMS specific fields */}
                    {channelKey === 'sms' && template && (
                      <>
                        {template.body && (
                          <div className="text-sm mt-2">
                            <span className="text-gray-500 dark:text-gray-400">Body: </span>
                            <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-sans text-sm mt-1">{template.body}</pre>
                          </div>
                        )}
                      </>
                    )}
                    {/* WhatsApp specific fields */}
                    {channelKey === 'whatsapp' && template && (
                      <>
                        {template.templateName && (
                          <div className="text-sm mt-2">
                            <span className="text-gray-500 dark:text-gray-400">Template Name: </span>
                            <span className="text-gray-900 dark:text-white font-mono">{template.templateName}</span>
                          </div>
                        )}
                        {template.templateLanguage && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Language: </span>
                            <span className="text-gray-900 dark:text-white">{template.templateLanguage}</span>
                          </div>
                        )}
                        {template.components && template.components.length > 0 && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Components: </span>
                            <span className="text-gray-900 dark:text-white">{template.components.length} configured</span>
                          </div>
                        )}
                      </>
                    )}
                    {/* Push/WebPush/InApp specific fields */}
                    {(channelKey === 'push' || channelKey === 'webPush' || channelKey === 'inApp') && template && (
                      <>
                        {template.title && (
                          <div className="text-sm mt-2">
                            <span className="text-gray-500 dark:text-gray-400">Title: </span>
                            <span className="text-gray-900 dark:text-white">{template.title}</span>
                          </div>
                        )}
                        {template.body && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Body: </span>
                            <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-sans text-sm mt-1">{template.body}</pre>
                          </div>
                        )}
                        {template.icon && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Icon: </span>
                            <span className="text-gray-900 dark:text-white text-xs font-mono">{template.icon}</span>
                          </div>
                        )}
                        {template.image && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Image: </span>
                            <span className="text-green-600 dark:text-green-400 text-xs">Configured</span>
                          </div>
                        )}
                        {channelKey === 'inApp' && template.color && (
                          <div className="text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">Color: </span>
                            <span className="text-gray-900 dark:text-white">{template.color}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : defaultChannels.length > 0 ? (
            <div className="space-y-4">
              <Message
                severity="info"
                text="Per-channel configuration is not set. This notification will use the Default Template for all enabled channels."
                className="w-full"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {defaultChannels.map((ch: string) => (
                  <div key={ch} className="border border-gray-200 dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{getChannelLabel(ch)}</span>
                      <Tag value="Uses Default Template" severity="info" className="text-xs" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No channel configuration available</p>
          )}
        </div>

        {/* Batching Configuration */}
        {data.canBeBatched && (
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Batching Configuration</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Can Be Batched</label>
                <p className="text-sm text-gray-900 dark:text-white">{data.canBeBatched ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Batch Window</label>
                <p className="text-sm text-gray-900 dark:text-white">
                  {data.batchWindowMinutes ? `${data.batchWindowMinutes} minutes` : '-'}
                </p>
              </div>
              {data.batchTemplate?.title && (
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Batch Template Title</label>
                  <p className="text-sm text-gray-900 dark:text-white">{data.batchTemplate.title}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Information */}
        {/* <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {formatDateTime(data.created_at || data.createdAt)}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {createdByName}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {formatDateTime(data.updated_at || data.updatedAt)}
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
              <p className="text-sm text-gray-900 dark:text-white mt-1">
                {updatedByName}
              </p>
            </div>
          </div>
          {(data.is_deleted || data.isDeleted) && (
            <div className="mt-4">
              <Message severity="warn" text="This record is soft-deleted." className="w-full" />
            </div>
          )}
        </div> */}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        visible={deleteDialogOpen}
        onCancel={handleDeleteCancel}
        onDelete={handleDeleteConfirm}
        message="Are you sure you want to delete this notification master? This action will mark it as deleted."
        testId="NotificationMasterView.Dialog.Delete"
      />
    </div>
  );
};

export default NotificationMasterView;
