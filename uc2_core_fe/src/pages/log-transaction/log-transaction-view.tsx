import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Button } from 'mainFe/Button';
import type { LogTransaction, LogLayer, LogTemplate } from '../../types/log-transaction.types';

interface LogDetailDrawerProps {
  open: boolean;
  log: LogTransaction | null;
  templates?: LogTemplate[];
  onClose: () => void;
}

const LogDetailDrawer = ({ open, log, templates, onClose }: LogDetailDrawerProps) => {
  if (!log) return null;

  const template = templates?.find((t) => t.eventCode === log.eventcode) || null;

  const getParamInfo = (key: string) => {
    if (!template || !template.parameters) return { isKeyField: false, isSensitive: false };
    const p = template.parameters.find((param: any) => typeof param === 'object' && param !== null && param.name === key);
    if (!p) return { isKeyField: false, isSensitive: false };
    return { isKeyField: !!p.isKeyField, isSensitive: !!p.isSensitive };
  };

  const getLayerColor = (layer: LogLayer): 'info' | 'warning' | 'success' | 'secondary' => {
    switch (layer) {
      case 'screen':
        return 'info';
      case 'function':
        return 'success';
      case 'api':
      case 'API':
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

  const formatTimestamp = (ts: string | undefined) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const parameters = log.parameters && typeof log.parameters === 'object' ? log.parameters : null;
  const details = log.Details && typeof log.Details === 'object' ? log.Details : null;

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
        <div className="flex-1 overflow-y-auto">
          {/* Layer, Timestamp, Event Code, Actor Role */}
          <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Layer</p>
                {log.layer ? (
                  <Tag
                    value={log.layer.toUpperCase()}
                    severity={getLayerColor(log.layer as LogLayer)}
                    className="mt-1"
                  />
                ) : (
                  <span className="text-sm text-gray-400">-</span>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Timestamp</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono">
                  {formatTimestamp(log.EventTimeStamp || log.createdAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Event Code</p>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 font-mono break-all">
                  {log.eventcode || '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Actor Role</p>
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                  {log.actorRole || '-'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Actor</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">
                  {log.actorName || log.actorId || '-'}
                </p>
                {log.actorName && log.actorId && (
                  <p className="text-xs text-gray-400 font-mono break-all mt-0.5">{log.actorId}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Retention</p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {log.retentionPeriod ? `${log.retentionPeriod} days` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Entity Info */}
          {(log.entityType || log.entityId || log.orgUnitId || log.requestId || log.keyFields) && (
            <div className="bg-teal-50 dark:bg-gray-800 border border-teal-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-sitemap text-teal-600 dark:text-teal-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">Entity Information</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {log.entityType && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Entity Type</p>
                    <p className="text-sm text-gray-900 dark:text-white font-medium">{log.entityType}</p>
                  </div>
                )}
                {log.entityId && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Entity ID</p>
                    <p className="text-sm text-gray-900 dark:text-white font-mono text-xs">{log.entityId}</p>
                  </div>
                )}
                {log.orgUnitId && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Org Unit ID</p>
                    <p className="text-sm text-gray-900 dark:text-white font-mono text-xs">{log.orgUnitId}</p>
                  </div>
                )}
                {log.requestId && (
                  <div>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Request ID</p>
                    <p className="text-sm text-gray-900 dark:text-white font-mono text-xs">{log.requestId}</p>
                  </div>
                )}
                {log.keyFields && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Key Fields</p>
                    <p className="text-sm text-gray-900 dark:text-white font-mono text-xs">{log.keyFields}</p>
                  </div>
                )}
              </div>
            </div>
          )}

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
          {log.message && (
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
          )}

          {/* Parameters */}
          {parameters && Object.keys(parameters).length > 0 && (
            <Accordion className="mb-4" activeIndex={0}>
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-database text-green-600" style={{ fontSize: '1rem' }} />
                    <span className="text-sm font-semibold">Parameters ({Object.keys(parameters).length} fields)</span>
                  </div>
                }
              >
                <div className="bg-green-50 dark:bg-gray-700 p-4 rounded-lg">
                  {Object.entries(parameters).map(([key, value]) => {
                    const info = getParamInfo(key);
                    return (
                      <div key={key} className="flex justify-between items-center py-2 border-b border-green-100 dark:border-gray-600 last:border-0">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-4">
                          {info.isKeyField && <i className="pi pi-key text-blue-500" style={{ fontSize: '0.75rem' }} title="Key Field"></i>}
                          {info.isSensitive && <i className="pi pi-shield text-red-500" style={{ fontSize: '0.75rem' }} title="Sensitive Field"></i>}
                          <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase truncate" title={key}>{key}:</span>
                        </div>
                        <span className="text-sm text-gray-900 dark:text-white font-mono whitespace-pre-wrap break-all text-right max-w-[60%]">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Details */}
          {details && Object.keys(details).length > 0 && (
            <Accordion className="mb-4">
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-info-circle text-indigo-600" style={{ fontSize: '1rem' }} />
                    <span className="text-sm font-semibold">Details ({Object.keys(details).length} fields)</span>
                  </div>
                }
              >
                <div className="bg-indigo-50 dark:bg-gray-700 p-4 rounded-lg">
                  {Object.entries(details).map(([key, value]) => {
                    const info = getParamInfo(key);
                    return (
                      <div key={key} className="flex justify-between items-center py-2 border-b border-indigo-100 dark:border-gray-600 last:border-0">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-4">
                          {info.isKeyField && <i className="pi pi-key text-blue-500" style={{ fontSize: '0.75rem' }} title="Key Field"></i>}
                          {info.isSensitive && <i className="pi pi-shield text-red-500" style={{ fontSize: '0.75rem' }} title="Sensitive Field"></i>}
                          <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase truncate" title={key}>{key}:</span>
                        </div>
                        <span className="text-sm text-gray-900 dark:text-white font-mono whitespace-pre-wrap break-all text-right max-w-[60%]">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Raw JSON */}
          {(parameters || details) && (
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
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify({ parameters, Details: details }, null, 2)}
                  </pre>
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
            data-testid="LogDetail.Button.CopyId"
          />
          <Button
            label="Close"
            severity="secondary"
            outlined
            onClick={onClose}
            data-testid="LogDetail.Button.Close"
          />
        </div>
      </div>
    </Sidebar>
  );
};

export default LogDetailDrawer;
