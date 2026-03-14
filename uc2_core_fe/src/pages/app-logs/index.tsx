import { useState } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import ErrorLogsPage from './error-logs';

const LogsPage = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div
      className="py-4 px-4"
      data-testid="SCR-Logs-Main"
    >
      <div className="mb-3">
        <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
          Admin Logs
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          View and manage system logs, notifications, and error tracking
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <TabView activeIndex={activeIndex} onTabChange={(e) => setActiveIndex(e.index)}>
          <TabPanel
            header={
              <div className="flex items-center gap-2">
                <i className="pi pi-file" style={{ fontSize: '1.25rem' }} />
                <span>Application Logs</span>
              </div>
            }
          >
            <div className="p-4">
              <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">
                Application Logs
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                View system activity logs, user actions, and audit trails.
              </p>
              <div className="mt-4 p-4 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <p className="text-gray-500 dark:text-gray-400 italic">
                  Application logs table will be displayed here
                </p>
              </div>
            </div>
          </TabPanel>

          <TabPanel
            header={
              <div className="flex items-center gap-2">
                <i className="pi pi-bell" style={{ fontSize: '1.25rem' }} />
                <span>Notification Logs</span>
              </div>
            }
          >
            <div className="p-4">
              <h3 className="text-base font-semibold mb-4 text-gray-900 dark:text-white">
                Notification Logs
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Track sent notifications, delivery status, and notification history.
              </p>
              <div className="mt-4 p-4 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <p className="text-gray-500 dark:text-gray-400 italic">
                  Notification logs table will be displayed here
                </p>
              </div>
            </div>
          </TabPanel>

          <TabPanel
            header={
              <div className="flex items-center gap-2">
                <i className="pi pi-exclamation-triangle" style={{ fontSize: '1.25rem' }} />
                <span>Error Logs</span>
              </div>
            }
          >
            <div className="p-4">
              <ErrorLogsPage embedded />
            </div>
          </TabPanel>
        </TabView>
      </div>
    </div>
  );
};

export default LogsPage;
