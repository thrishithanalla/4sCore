/**
 * Error Detail Drawer
 * Displays detailed information about an error group
 */

import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Button } from 'mainFe/Button';
import type { ErrorGroup } from '../../types';
import type { ErrorSeverity, ErrorStatus } from '../../types/error-logs.types';

interface ErrorDetailDrawerProps {
  open: boolean;
  error: ErrorGroup | null;
  onClose: () => void;
}

const ErrorDetailDrawer = ({ open, error, onClose }: ErrorDetailDrawerProps) => {
  if (!error) return null;

  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'secondary' => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return 'danger';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string): 'danger' | 'warning' | 'info' | 'success' => {
    switch (status?.toUpperCase()) {
      case 'UNRESOLVED': return 'danger';
      case 'INVESTIGATING': return 'warning';
      case 'MONITORING': return 'info';
      case 'RESOLVED': return 'success';
      default: return 'info';
    }
  };

  const getSourceTypeIcon = (type: string): string => {
    switch (type?.toUpperCase()) {
      case 'API': return 'pi pi-server';
      case 'SCREEN': return 'pi pi-desktop';
      case 'FUNCTION': return 'pi pi-code';
      case 'THIRDPARTY': return 'pi pi-external-link';
      default: return 'pi pi-box';
    }
  };

  const handleCopyErrorCode = () => {
    navigator.clipboard.writeText(error.errorCode);
  };

  const status = (error as any).status || 'UNRESOLVED';

  return (
    <Sidebar
      visible={open}
      onHide={onClose}
      position="right"
      style={{ width: '700px' }}
      header={
        <div className="flex items-center gap-3 px-4 py-3">
          <i className="pi pi-exclamation-triangle text-red-600" style={{ fontSize: '1.25rem' }} />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Error Details
          </span>
        </div>
      }
    >
      <div className="flex flex-col h-full p-6" style={{ fontSize: '14px' }}>
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Error Code Header */}
          <div className="bg-red-50 dark:bg-gray-800 border border-red-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center">
                <i className={`${getSourceTypeIcon(error.sourceType)} text-red-600 dark:text-red-400`} style={{ fontSize: '1.25rem' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-red-800 dark:text-red-200">
                  {error.errorCode}
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                  {error.sourceName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tag
                value={error.severity || 'MEDIUM'}
                severity={getSeverityColor(error.severity)}
              />
              <Tag
                value={status}
                severity={getStatusColor(status)}
              />
              <Tag
                value={error.sourceType}
                severity="secondary"
                icon={getSourceTypeIcon(error.sourceType)}
              />
            </div>
          </div>

          {/* Statistics */}
          <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
              <i className="pi pi-chart-bar text-blue-600" style={{ fontSize: '1rem' }} />
              Statistics
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border border-blue-100 dark:border-gray-600">
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Occurrences</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {(error.occurrences || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border border-blue-100 dark:border-gray-600">
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Affected Users</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {(error.affectedUsers || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-4 flex items-center gap-2">
              <i className="pi pi-clock text-amber-600" style={{ fontSize: '1rem' }} />
              Timeline
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">First Seen</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono">
                  {error.firstSeen ? new Date(error.firstSeen).toLocaleString() : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Last Seen</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono">
                  {error.lastSeen ? new Date(error.lastSeen).toLocaleString() : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {(error.resolvedMessage || error.message) && (
            <div className="bg-purple-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-comment text-purple-600 dark:text-purple-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">Error Message</span>
              </div>
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border border-purple-100 dark:border-gray-600">
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {error.resolvedMessage || error.message || 'No message available'}
                </p>
              </div>
            </div>
          )}

          {/* Source Details */}
          <div className="bg-teal-50 dark:bg-gray-800 border border-teal-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <h4 className="text-sm font-semibold text-teal-800 dark:text-teal-300 mb-4 flex items-center gap-2">
              <i className="pi pi-info-circle text-teal-600" style={{ fontSize: '1rem' }} />
              Source Details
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-teal-100 dark:border-gray-700 items-center">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Source Type</span>
                <span className="text-sm text-gray-900 dark:text-white font-medium">{error.sourceType}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-teal-100 dark:border-gray-700 items-center">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Source Name</span>
                <span className="text-sm text-gray-900 dark:text-white font-mono">{error.sourceName}</span>
              </div>
              {(error as any).endpoint && (
                <div className="flex justify-between py-2 border-b border-teal-100 dark:border-gray-700 items-center">
                  <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Endpoint</span>
                  <span className="text-sm text-gray-900 dark:text-white font-mono break-all text-right max-w-[60%]">{(error as any).endpoint}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-teal-100 dark:border-gray-700 items-center">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Severity</span>
                <Tag value={error.severity || 'MEDIUM'} severity={getSeverityColor(error.severity)} />
              </div>
              <div className="flex justify-between py-2 items-center">
                <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Status</span>
                <Tag value={status} severity={getStatusColor(status)} />
              </div>
            </div>
          </div>

          {/* Error Code ID */}
          <div className="bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-id-card text-slate-600 dark:text-slate-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Error Code</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-mono break-all bg-white dark:bg-gray-700 p-3 rounded border border-slate-200 dark:border-gray-600">
              {error.errorCode}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-5 flex gap-3">
          <Button
            label="Notify"
            icon="pi pi-bell"
            severity="warning"
            onClick={() => {
              // TODO: Integrate with notification service
              console.log('Notify for:', error.errorCode);
            }}
            testId="ErrorDetail.Button.Notify"
          />
          <Button
            label="Close"
            severity="secondary"
            outlined
            onClick={onClose}
            testId="ErrorDetail.Button.Close"
          />
        </div>
      </div>
    </Sidebar>
  );
};

export default ErrorDetailDrawer;
