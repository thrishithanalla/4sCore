import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Accordion, AccordionTab } from 'primereact/accordion';
import type { ErrorLog } from '../../types';

interface ErrorLogDetailDrawerProps {
  open: boolean;
  errorLog: ErrorLog | null;
  onClose: () => void;
}

const ErrorLogDetailDrawer = ({ open, errorLog, onClose }: ErrorLogDetailDrawerProps) => {
  if (!errorLog) return null;

  const getSeverityColor = (severity: string): 'danger' | 'warning' | 'info' | 'success' | 'secondary' => {
    switch (severity) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'secondary';
    }
  };

  return (
    <Sidebar
      visible={open}
      onHide={onClose}
      position="right"
      style={{ width: '700px' }}
      className="p-0"
      header={
        <div className="flex justify-between items-center w-full">
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            Error Log Details
          </span>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Error Code & Severity */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Error Code</p>
                <p className="text-base font-semibold font-mono text-gray-900 dark:text-white">
                  {errorLog.errorCode}
                </p>
              </div>
              <Tag
                value={errorLog.errorSeverity}
                severity={getSeverityColor(errorLog.errorSeverity)}
              />
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Event Date & Time</p>
              <p className="text-gray-900 dark:text-white">
                {new Date(errorLog.eventDateTime).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Resolved Message */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <i className="pi pi-info-circle text-sm text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
              <span className="font-semibold text-gray-900 dark:text-white">Resolved Message</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {errorLog.resolvedMessage}
            </p>
          </div>

          {/* Parameters */}
          {errorLog.parameters && errorLog.parameters.length > 0 && (
            <Accordion activeIndex={0} className="mb-3">
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-code" style={{ fontSize: '1.125rem' }} />
                    <span>Parameters ({errorLog.parameters.length})</span>
                  </div>
                }
              >
                <div className="space-y-2">
                  {errorLog.parameters.map((param, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded p-3 bg-gray-50 dark:bg-gray-900">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{param.name}</p>
                      <p className="font-mono text-gray-900 dark:text-white break-all">
                        {param.value}
                      </p>
                    </div>
                  ))}
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Parameters JSON (Pretty View) */}
          {errorLog.parametersJson && Object.keys(errorLog.parametersJson).length > 0 && (
            <Accordion className="mb-3">
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-code" style={{ fontSize: '1.125rem' }} />
                    <span>Parameters JSON (Full)</span>
                  </div>
                }
              >
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                  <pre className="text-sm font-mono">
                    {JSON.stringify(errorLog.parametersJson, null, 2)}
                  </pre>
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Stack Trace */}
          {errorLog.stack && (
            <Accordion className="mb-3">
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-code" style={{ fontSize: '1.125rem' }} />
                    <span>Stack Trace</span>
                  </div>
                }
              >
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">{errorLog.stack}</pre>
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Source Information */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-globe text-sm text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
              <span className="font-semibold text-gray-900 dark:text-white">Source Information</span>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Source Type</p>
                  <p className="text-gray-900 dark:text-white">{errorLog.sourceType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Environment</p>
                  <Tag value={errorLog.environment?.toUpperCase()} severity="secondary" />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Source Name</p>
                <p className="font-mono text-gray-900 dark:text-white">{errorLog.sourceName}</p>
              </div>
            </div>
          </div>

          {/* Actor & Network Info */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-user text-sm text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
              <span className="font-semibold text-gray-900 dark:text-white">Actor & Network Information</span>
            </div>
            <div className="space-y-2">
              {errorLog.actorUserId && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Actor User ID</p>
                  <p className="font-mono text-gray-900 dark:text-white">{errorLog.actorUserId}</p>
                </div>
              )}
              {errorLog.ip && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">IP Address</p>
                  <p className="font-mono text-gray-900 dark:text-white">{errorLog.ip}</p>
                </div>
              )}
              {errorLog.userAgent && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">User Agent</p>
                  <p className="text-xs text-gray-900 dark:text-white break-all">{errorLog.userAgent}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Sidebar>
  );
};

export default ErrorLogDetailDrawer;
