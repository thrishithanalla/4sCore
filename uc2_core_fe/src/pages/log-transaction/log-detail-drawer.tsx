import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Button } from 'mainFe/Button';
import type { LogTransaction, LogLevel, LogLayer } from '../../types/log-transaction.types';

interface LogDetailDrawerProps {
  open: boolean;
  log: LogTransaction | null;
  onClose: () => void;
}

const LogDetailDrawer = ({ open, log, onClose }: LogDetailDrawerProps) => {
  if (!log) return null;

  const getLevelColor = (level: LogLevel): 'info' | 'warning' | 'danger' | 'secondary' => {
    switch (level) {
      case 'info':
        return 'info';
      case 'warning':
        return 'warning';
      case 'error':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const getLevelIcon = (level: LogLevel): string => {
    switch (level) {
      case 'info':
        return 'pi pi-info-circle';
      case 'warning':
        return 'pi pi-exclamation-triangle';
      case 'error':
        return 'pi pi-times-circle';
      default:
        return 'pi pi-info-circle';
    }
  };

  const getLayerColor = (layer: LogLayer): 'info' | 'warning' | 'success' | 'secondary' => {
    switch (layer) {
      case 'screen':
        return 'info';
      case 'function':
        return 'success';
      case 'api':
        return 'warning';
      case 'config':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(log._id);
  };

  return (
    <Sidebar
      visible={open}
      onHide={onClose}
      position="right"
      style={{ width: '700px' }}
      header={
        <div className="flex justify-between items-center w-full px-4 py-3">
          <div className="flex items-center gap-3">
            <i className="pi pi-file-edit text-blue-600" style={{ fontSize: '1.25rem' }} />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Log Details
            </span>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full p-6" style={{ fontSize: '14px' }}>
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Log Level & Layer */}
          <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Level</p>
                <Tag
                  value={log.level.toUpperCase()}
                  severity={getLevelColor(log.level)}
                  icon={getLevelIcon(log.level)}
                  className="mt-1"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Layer</p>
                <Tag
                  value={log.layer.toUpperCase()}
                  severity={getLayerColor(log.layer)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Timestamp</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono">
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Code</p>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 font-mono">
                  {log.logCode || '-'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Module</p>
                <p className="text-sm text-teal-700 dark:text-teal-400 font-medium">
                  {log.template?.module?.name || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Actor</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  {log.actorName || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Endpoint */}
          {log.endpoint && (
            <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-link text-amber-600 dark:text-amber-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Endpoint</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 font-mono bg-white dark:bg-gray-700 p-3 rounded border border-amber-100 dark:border-gray-600">
                {log.endpoint}
              </p>
            </div>
          )}

          {/* Message */}
          <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-comment text-blue-600 dark:text-blue-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Message</span>
            </div>
            <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border border-blue-100 dark:border-gray-600">
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {log.message}
              </p>
            </div>
          </div>

          {/* JSON Data */}
          {log.json && Object.keys(log.json).length > 0 && (
            <Accordion className="mb-4" activeIndex={0}>
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-database text-green-600" style={{ fontSize: '1rem' }} />
                    <span className="text-sm font-semibold">JSON Data ({Object.keys(log.json).length} fields)</span>
                  </div>
                }
              >
                <div className="bg-green-50 dark:bg-gray-700 p-4 rounded-lg">
                  {Object.entries(log.json).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-2 border-b border-green-100 dark:border-gray-600 last:border-0">
                      <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">{key}:</span>
                      <span className="text-sm text-gray-900 dark:text-white font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Raw JSON View */}
          {log.json && Object.keys(log.json).length > 0 && (
            <Accordion className="mb-4">
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-code text-indigo-600" style={{ fontSize: '1rem' }} />
                    <span className="text-sm font-semibold">Raw JSON</span>
                  </div>
                }
              >
                <div className="bg-gray-900 text-emerald-400 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(log.json, null, 2)}</pre>
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Log ID */}
          <div className="bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-id-card text-slate-600 dark:text-slate-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Log ID</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-mono break-all bg-white dark:bg-gray-700 p-3 rounded border border-slate-200 dark:border-gray-600">
              {log._id}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-5 flex gap-3">
          <Button
            label="Copy Log ID"
            icon="pi pi-copy"
            onClick={handleCopyId}
            testId="LogDetail.Button.CopyId"
          />
          <Button
            label="Close"
            severity="secondary"
            outlined
            onClick={onClose}
            testId="LogDetail.Button.Close"
          />
        </div>
      </div>
    </Sidebar>
  );
};

export default LogDetailDrawer;
