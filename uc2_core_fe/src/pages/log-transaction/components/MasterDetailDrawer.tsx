import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Button } from 'mainFe/Button';
import type { LogMaster } from '../../../types';

interface MasterDetailDrawerProps {
  open: boolean;
  master: LogMaster | null;
  onClose: () => void;
}

const getLevelSeverity = (level: string): 'info' | 'warning' | 'danger' | 'secondary' => {
  switch (level?.toUpperCase()) {
    case 'INFO': return 'info';
    case 'WARNING': case 'WARN': return 'warning';
    case 'ERROR': return 'danger';
    default: return 'secondary';
  }
};

const formatTimestamp = (ts: string | undefined) => {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
};

const MasterDetailDrawer = ({ open, master, onClose }: MasterDetailDrawerProps) => {
  if (!master) return null;

  return (
    <Sidebar
      visible={open}
      onHide={onClose}
      position="right"
      style={{ width: '700px' }}
      header={
        <div className="flex items-center gap-3 px-4 py-3">
          <i className="pi pi-file-edit text-blue-600" style={{ fontSize: '1.25rem' }} />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            Master Template Details
          </span>
        </div>
      }
    >
      <div className="flex flex-col h-full p-6" style={{ fontSize: '14px' }}>
        <div className="flex-1 overflow-y-auto">
          {/* Event Code & Basic Info */}
          <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Event Code</p>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 font-mono break-all">
                {master.eventCode || '-'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Object</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{master.logObject || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Action</p>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{master.action || '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Layer</p>
                <p className="text-sm text-gray-900 dark:text-white">{master.layer || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Level</p>
                <Tag value={master.logLevel || 'INFO'} severity={getLevelSeverity(master.logLevel)} className="text-xs" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Log Type</p>
                <p className="text-sm text-gray-900 dark:text-white">{master.logtype || '-'}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          {master.description && (
            <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-info-circle text-blue-600 dark:text-blue-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Description</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200">{master.description}</p>
            </div>
          )}

          {/* Message Template */}
          {master.messageTemplate && (
            <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-comment text-amber-600 dark:text-amber-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Message Template</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 font-mono bg-white dark:bg-gray-700 p-3 rounded border border-amber-100 dark:border-gray-600 whitespace-pre-wrap">
                {master.messageTemplate}
              </p>
            </div>
          )}

          {/* Key Fields & Parameters */}
          <div className="bg-teal-50 dark:bg-gray-800 border border-teal-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-key text-teal-600 dark:text-teal-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">Key Fields & Parameters</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Key Fields</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono">{master.keyFields || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Retention Period</p>
                <p className="text-sm text-gray-900 dark:text-white">{master.retentionPeriod} days</p>
              </div>
            </div>
            {master.parameters && master.parameters.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Parameters</p>
                <div className="flex flex-wrap gap-1.5">
                  {master.parameters.map((p, i) => (
                    <span key={i} className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 rounded text-xs font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Template Parameters */}
          {master.templateParameters && Object.keys(master.templateParameters).length > 0 && (
            <div className="bg-purple-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <i className="pi pi-database text-purple-600 dark:text-purple-400" style={{ fontSize: '1rem' }} />
                <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                  Template Parameters ({Object.keys(master.templateParameters).length} fields)
                </span>
              </div>
              <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
                {Object.entries(master.templateParameters).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-1.5 border-b border-purple-100 dark:border-gray-600 last:border-0">
                    <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 font-mono">{key}</span>
                    <span className="text-xs text-gray-900 dark:text-white font-mono">{String(value) || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flags */}
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-flag text-gray-600 dark:text-gray-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Flags</span>
            </div>
            <div className="flex gap-3">
              <Tag value={master.isActive ? 'Active' : 'Inactive'} severity={master.isActive ? 'success' : 'danger'} className="text-xs" />
              {master.isUsageTrackable && <Tag value="Usage Trackable" severity="info" className="text-xs" />}
              {master.isSensitive && <Tag value="Sensitive" severity="warning" className="text-xs" />}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Created At</p>
                <p className="text-xs text-gray-900 dark:text-white font-mono">{formatTimestamp(master.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">Updated At</p>
                <p className="text-xs text-gray-900 dark:text-white font-mono">{formatTimestamp(master.updatedAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-0.5">ID</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all">{master._id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-5 flex gap-3">
          <Button label="Copy ID" icon="pi pi-copy" onClick={() => navigator.clipboard.writeText(master._id)} testId="MasterDetail.Button.CopyId" />
          <Button label="Close" severity="secondary" outlined onClick={onClose} testId="MasterDetail.Button.Close" />
        </div>
      </div>
    </Sidebar>
  );
};

export default MasterDetailDrawer;
