/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Dropdown } from 'mainFe/Dropdown';
import { Input } from 'mainFe/Input';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportButton } from 'mainFe/ExportButton';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { notificationsService } from '../../services/notifications-master.service';
import { modulesService } from '../../services/modules.service';
import type { NotificationMaster, Module } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const NotificationMastersList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'notificationMaster',
    basePath: '/notification-master',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.NOTIFICATION_MASTER);
  const canUpdate = useCanUpdate(JOB_NAMES.NOTIFICATION_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.NOTIFICATION_MASTER);

  const [rows, setRows] = useState<NotificationMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Filter states
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  // Modules for dropdown
  const [modules, setModules] = useState<Module[]>([]);

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  // Fetch modules for dropdown
  useEffect(() => {
    const fetchModules = async () => {
      try {
        const data = await modulesService.getAllForDropdown(false);
        setModules(data);
      } catch (error) {
        console.error('Failed to fetch modules:', error);
      }
    };
    fetchModules();
  }, []);

  // Fetch notifications on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const resp = await notificationsService.getAll();

        // Handle both array and paginated response
        const list: NotificationMaster[] = Array.isArray(resp)
          ? resp
          : (resp as any)?.data ?? [];

        // Ensure each row has an 'id' and normalize field names
        const mappedList = list.map((n: any) => ({
          ...n,
          id: n._id || n.id || n.notification_type || n.notificationType,
          // Normalize snake_case to camelCase for display
          notificationType: n.notification_type || n.notificationType,
          defaultChannels: n.default_channels || n.defaultChannels || [],
          notificationActions: n.notification_actions || n.notificationActions || [],
          notificationParameters: n.notification_parameters || n.notificationParameters || [],
          notificationTemplate: n.notification_template || n.notificationTemplate,
          channels: n.channels || null,
          settings: n.settings || null,
          canBeBatched: n.canBeBatched || false,
          batchWindowMinutes: n.batchWindowMinutes || null,
          batchTemplate: n.batchTemplate || null,
        }));

        setRows(mappedList);
      } catch (error) {
        console.error('Failed to fetch notification masters:', error);
        showError(extractErrorMessage(error, 'Failed to load notification masters'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [showError]);

  // Stable refresh function
  const handleRefresh = useCallback(async () => {
    try {
      setLoading(true);

      const resp = await notificationsService.getAll();
      const list: NotificationMaster[] = Array.isArray(resp)
        ? resp
        : (resp as any)?.data ?? [];
      const mappedList = list.map((n: any) => ({
        ...n,
        id: n._id || n.id || n.notification_type || n.notificationType,
        notificationType: n.notification_type || n.notificationType,
        defaultChannels: n.default_channels || n.defaultChannels || [],
        notificationActions: n.notification_actions || n.notificationActions || [],
        notificationParameters: n.notification_parameters || n.notificationParameters || [],
        notificationTemplate: n.notification_template || n.notificationTemplate,
        channels: n.channels || null,
        settings: n.settings || null,
        canBeBatched: n.canBeBatched || false,
        batchWindowMinutes: n.batchWindowMinutes || null,
        batchTemplate: n.batchTemplate || null,
      }));
      setRows(mappedList);
    } catch (error) {
      console.error('Failed to fetch notification masters:', error);
      showError(extractErrorMessage(error, 'Failed to load notification masters'));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Client-side filtered rows (status filtering is now done server-side)
  const filteredRows = useMemo(() => {
    let result = rows;

    // Search filter
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      result = result.filter((r) =>
        r.name?.toLowerCase().includes(lowerSearch) ||
        r.notificationType?.toLowerCase().includes(lowerSearch) ||
        (r.notification_type || '').toLowerCase().includes(lowerSearch) ||
        r.description?.toLowerCase().includes(lowerSearch)
      );
    }

    // Filter by priority
    if (priorityFilter !== 'all') {
      result = result.filter((r) => r.priority === priorityFilter);
    }

    // Filter by category
    if (categoryFilter !== 'all') {
      result = result.filter((r) => r.category === categoryFilter);
    }

    // Filter by module
    if (moduleFilter !== 'all') {
      result = result.filter((r) => r.moduleId === moduleFilter);
    }

    return result;
  }, [rows, searchText, priorityFilter, categoryFilter, moduleFilter]);

  // Channel label helper
  const getChannelLabel = (channel: string) => {
    const labels: Record<string, string> = {
      inApp: 'In-App',
      webPush: 'Web Push',
      push: 'Mobile',
      email: 'Email',
      sms: 'SMS',
      whatsapp: 'WhatsApp',
    };
    return labels[channel] || channel;
  };

  const handleView = (id: string | number) => navigateToView(String(id));
  const handleEdit = (id: string | number) => navigateToEdit(String(id));

  const handleDeleteClick = (id: string | number) => {
    setSelectedId(String(id));
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;
    try {
      setDeleteLoading(true);
      await notificationsService.delete(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      handleRefresh();
    } catch (error: any) {
      console.error('Failed to delete notification master:', error);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(error, 'Failed to delete notification master'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  // Priority color helper
  const getPriorityColor = (priority: string): 'danger' | 'warning' | 'info' | 'success' | 'secondary' => {
    switch (priority) {
      case 'URGENT':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'NORMAL':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'secondary';
    }
  };

  // Category color helper
  const getCategoryColor = (category: string): 'info' | 'success' | 'warning' | 'danger' | 'secondary' => {
    switch (category) {
      case 'TRANSACTIONAL':
        return 'info';
      case 'PROMOTIONAL':
        return 'success';
      case 'SYSTEM':
        return 'warning';
      case 'ALERT':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const priorityOptions = [
    { label: 'All Priorities', value: 'all' },
    { label: 'Urgent', value: 'URGENT' },
    { label: 'High', value: 'HIGH' },
    { label: 'Normal', value: 'NORMAL' },
    { label: 'Low', value: 'LOW' },
  ];

  const categoryOptions = [
    { label: 'All Categories', value: 'all' },
    { label: 'Transactional', value: 'TRANSACTIONAL' },
    { label: 'Promotional', value: 'PROMOTIONAL' },
    { label: 'System', value: 'SYSTEM' },
    { label: 'Alert', value: 'ALERT' },
  ];

  // Module options for dropdown
  const moduleOptions = [
    { label: 'All Modules', value: 'all' },
    ...modules.map((m) => ({
      label: m.name,
      value: m._id,
    })),
  ];

  // Export columns configuration
  const exportColumns = useMemo(() => [
    { field: 'name', header: 'Name' },
    { field: 'notificationType', header: 'Type' },
    { field: 'category', header: 'Category' },
    { field: 'priority', header: 'Priority' },
  ], []);

  // Fetch export data (uses client-side filtered rows)
  const fetchExportData = useCallback(async (): Promise<NotificationMaster[]> => {
    return filteredRows;
  }, [filteredRows]);

  const columns: DataTableColumn<NotificationMaster>[] = useMemo(
    () => [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
        body: (rowData: NotificationMaster) => (
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {rowData.name || '-'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {rowData.notificationType || rowData.notification_type}
            </div>
          </div>
        ),
      },
      {
        field: 'category',
        header: 'Category',
        sortable: true,
        body: (rowData: NotificationMaster) =>
          rowData.category ? (
            <Tag value={rowData.category} severity={getCategoryColor(rowData.category)} />
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        field: 'defaultChannels',
        header: 'Channels',
        sortable: false,
        body: (rowData: NotificationMaster) => {
          const channels = rowData.defaultChannels || rowData.default_channels || [];
          return (
            <div className="flex gap-1 flex-wrap">
              {channels.slice(0, 3).map((c: string) => (
                <span
                  key={c}
                  className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                >
                  {getChannelLabel(c)}
                </span>
              ))}
              {channels.length > 3 && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                  +{channels.length - 3}
                </span>
              )}
            </div>
          );
        },
      },
      {
        field: 'priority',
        header: 'Priority',
        sortable: true,
        body: (rowData: NotificationMaster) => (
          <Tag value={rowData.priority} severity={getPriorityColor(rowData.priority)} />
        ),
      },
      {
        field: 'notification_template',
        header: 'Template',
        sortable: false,
        body: (rowData: NotificationMaster) => {
          const template = rowData.notification_template || (rowData as any).notificationTemplate;
          return template?.title ? (
            <Tag value="Configured" severity="success" />
          ) : (
            <Tag value="None" severity="secondary" />
          );
        },
      },
      {
        field: 'settings',
        header: 'Config',
        sortable: false,
        body: (rowData: NotificationMaster) => {
          const hasSettings = rowData.settings && Object.keys(rowData.settings).length > 0;
          const hasBatching = rowData.canBeBatched;
          const hasChannelsConfig = rowData.channels && Object.keys(rowData.channels).length > 0;
          return (
            <div className="flex gap-1 justify-center">
              {hasSettings && (
                <span
                  className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200"
                  title="Settings configured"
                >
                  <i className="pi pi-cog" style={{ fontSize: '0.75rem' }} />
                </span>
              )}
              {hasBatching && (
                <span
                  className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
                  title="Batching enabled"
                >
                  <i className="pi pi-th-large" style={{ fontSize: '0.75rem' }} />
                </span>
              )}
              {hasChannelsConfig && (
                <span
                  className="px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200"
                  title="Per-channel config"
                >
                  <i className="pi pi-send" style={{ fontSize: '0.75rem' }} />
                </span>
              )}
              {!hasSettings && !hasBatching && !hasChannelsConfig && (
                <span className="text-gray-400">-</span>
              )}
            </div>
          );
        },
      },
      {
        field: 'actions',
        header: 'Actions',
        headerStyle: { textAlign: 'center' },
        sortable: false,
        body: (rowData: NotificationMaster) => {
          const rowId = rowData.id || rowData._id || '';
          return (
            <div className="flex gap-1 justify-center">
              <button
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleView(rowId)}
                data-testid="NotificationMastersList.Action.View"
                data-pr-tooltip="View"
              >
                <i className="pi pi-eye text-sm text-green-600 dark:text-green-400" style={{ fontSize: '1.125rem' }} />
              </button>
              <Tooltip target="[data-pr-tooltip]" />

              {canUpdate && (
                <button
                  className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  onClick={() => handleEdit(rowId)}
                  data-testid="NotificationMastersList.Action.Edit"
                  data-pr-tooltip="Edit"
                >
                  <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}

              {canDelete && (
                <button
                  className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  onClick={() => handleDeleteClick(rowId)}
                  data-testid="NotificationMastersList.Action.Delete"
                  data-pr-tooltip="Delete"
                >
                  <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName={JOB_NAMES.NOTIFICATION_MASTER}>
      <Toast ref={toast} position="top-right" />
      <div className="p-3" data-testid="SCR-NotificationMasters-List">
        {/* Page Header - Compact */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-yellow-600 flex items-center justify-center">
              <i className="pi pi-bell text-white text-sm" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Notification Masters
            </h1>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 ml-10">
            Registry of notification types, templates, channels, and actions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
          {/* Filter Bar */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex gap-2 items-center flex-wrap">
              <Input
                name="search"
                placeholder="Search..."
                value={searchText}
                onChange={(value: string) => setSearchText(value)}
                testId="NotificationMastersList.Search"
                style={{ minWidth: '180px', width: '180px' }}
                clearable
              />

              <Dropdown
                value={priorityFilter}
                options={priorityOptions}
                onChange={(e: any) => setPriorityFilter(e.value || 'all')}
                placeholder="Priority"
                style={{ width: '130px' }}
                data-testid="NotificationMastersList.Filter.Priority"
                resetFilterOnHide={true}
              />

              <Dropdown
                value={categoryFilter}
                options={categoryOptions}
                onChange={(e: any) => setCategoryFilter(e.value || 'all')}
                placeholder="Category"
                style={{ width: '140px' }}
                data-testid="NotificationMastersList.Filter.Category"
                resetFilterOnHide={true}
              />

              <Dropdown
                value={moduleFilter}
                options={moduleOptions}
                onChange={(e: any) => setModuleFilter(e.value || 'all')}
                placeholder="Module"
                style={{ width: '160px' }}
                filter
                data-testid="NotificationMastersList.Filter.Module"
                resetFilterOnHide={true}
              />
            </div>
          </div>

          {/* Action Bar - Record count, Export, Refresh & Create */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}
              </span>
              <div className="flex gap-2 items-center">
                <ExportButton
                  fetchData={fetchExportData}
                  columns={exportColumns}
                  filename="notification-masters"
                  testId="NotificationMastersList.Button.Export"
                />
                <RefreshButton
                  onClick={handleRefresh}
                  loading={loading}
                  testId="NotificationMastersList.Button.Refresh"
                />

                {canCreate && (
                  <Button
                    label="Create Notification"
                    icon="pi pi-plus"
                    onClick={() => navigate('/notification-master/create')}
                    testId="NotificationMastersList.Button.Create"
                    size="small"
                  />
                )}
              </div>
            </div>
          </div>

          {/* DataTable */}
          <DataTable
            data={filteredRows}
            columns={columns}
            loading={loading}
            emptyMessage="No notification masters found"
            dataKey="id"
          />
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this notification master? This will mark it as deleted."
          testId="NotificationMastersList.Dialog.Delete"
          loading={deleteLoading}
        />
      </div>
    </PermissionGuard>
  );
};

export default NotificationMastersList;
