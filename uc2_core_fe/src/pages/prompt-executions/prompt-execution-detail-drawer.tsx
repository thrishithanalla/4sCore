import { Sidebar } from 'primereact/sidebar';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Tag } from 'mainFe/Tag';
import { Button } from 'mainFe/Button';
import type { PromptExecutionRecentCall } from '../../types/prompt-execution.types';
import {
  getModelColors,
  getStatusSeverity,
  getAccuracyColor,
  formatCurrency,
  formatResponseTime,
} from '../../types/prompt-execution.types';

interface PromptExecutionDetailDrawerProps {
  open: boolean;
  execution: PromptExecutionRecentCall | null;
  onClose: () => void;
}

const PromptExecutionDetailDrawer = ({ open, execution, onClose }: PromptExecutionDetailDrawerProps) => {
  if (!execution) return null;

  const colors = getModelColors(execution.model);

  const handleCopyPrompt = () => {
    if (execution.promptText) {
      navigator.clipboard.writeText(execution.promptText);
    }
  };

  const handleCopyResponse = () => {
    if (execution.responseText) {
      navigator.clipboard.writeText(execution.responseText);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(execution._id);
  };

  const handleExportDetails = () => {
    const exportData = {
      executionId: execution._id,
      model: execution.model,
      useCase: execution.useCase,
      status: execution.status,
      timestamp: execution.timestamp,
      caseId: execution.caseId,
      userId: execution.userId,
      tokens: {
        total: execution.tokens,
        input: execution.inputTokens,
        output: execution.outputTokens,
      },
      cost: execution.cost,
      responseTime: execution.responseTime,
      accuracy: execution.accuracy,
      promptText: execution.promptText,
      responseText: execution.responseText,
      metadata: (execution as any).metadata,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt-execution-${execution._id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Sidebar
      visible={open}
      onHide={onClose}
      position="right"
      style={{ width: '700px' }}
      header={
        <div className="flex items-center gap-3 px-4 py-3">
          <i className="pi pi-microchip text-purple-600" style={{ fontSize: '1.25rem' }} />
          <span className="text-lg font-semibold text-gray-900 dark:text-white">AI Prompt Details</span>
        </div>
      }
    >
      <div className="flex flex-col h-full p-6" style={{ fontSize: '14px' }}>
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Model & Status */}
          <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5 mb-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Model</p>
                <span
                  className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text}`}
                >
                  {execution.model}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Use Case</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{execution.useCase}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Status</p>
                <Tag value={execution.status} severity={getStatusSeverity(execution.status)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Timestamp</p>
                <p className="text-sm text-gray-900 dark:text-white font-mono">
                  {new Date(execution.timestamp).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Case ID</p>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-mono">{execution.caseId || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">User</p>
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">{execution.userId}</p>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 p-4 rounded-lg text-center">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Total Tokens</p>
              <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{execution.tokens}</p>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-1 font-mono">
                {execution.inputTokens}+{execution.outputTokens}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-gray-800 border border-green-200 dark:border-gray-700 p-4 rounded-lg text-center">
              <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Cost</p>
              <p className="text-lg font-bold text-green-900 dark:text-green-100">{formatCurrency(execution.cost)}</p>
            </div>
            <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 p-4 rounded-lg text-center">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Response Time</p>
              <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
                {formatResponseTime(execution.responseTime)}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 p-4 rounded-lg text-center">
              <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Accuracy</p>
              <p
                className={`text-lg font-bold ${execution.accuracy ? getAccuracyColor(execution.accuracy) : 'text-gray-500'}`}
              >
                {execution.accuracy ? `${execution.accuracy.toFixed(1)}%` : '-'}
              </p>
            </div>
          </div>

          {/* Prompt Text */}
          {execution.promptText && (
            <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <i className="pi pi-file-edit text-blue-600 dark:text-blue-400" style={{ fontSize: '1rem' }} />
                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">Prompt Text</span>
                </div>
                <button
                  onClick={handleCopyPrompt}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-xs flex items-center gap-1 font-medium"
                >
                  <i className="pi pi-copy" style={{ fontSize: '0.75rem' }} />
                  Copy
                </button>
              </div>
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border border-blue-100 dark:border-gray-600 max-h-48 overflow-y-auto">
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{execution.promptText}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 font-mono">
                Prompt Tokens: {execution.inputTokens}
              </p>
            </div>
          )}

          {/* Response Text */}
          {execution.responseText && (
            <div className="bg-teal-50 dark:bg-gray-800 border border-teal-200 dark:border-gray-700 rounded-lg p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <i className="pi pi-microchip text-teal-600 dark:text-teal-400" style={{ fontSize: '1rem' }} />
                  <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">AI Response</span>
                </div>
                <button
                  onClick={handleCopyResponse}
                  className="text-teal-600 hover:text-teal-800 dark:text-teal-400 text-xs flex items-center gap-1 font-medium"
                >
                  <i className="pi pi-copy" style={{ fontSize: '0.75rem' }} />
                  Copy
                </button>
              </div>
              <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border border-teal-100 dark:border-gray-600 max-h-64 overflow-y-auto">
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{execution.responseText}</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 font-mono">
                Completion Tokens: {execution.outputTokens}
              </p>
            </div>
          )}

          {/* Additional Metadata */}
          {(execution as any).metadata && Object.keys((execution as any).metadata).length > 0 && (
            <Accordion className="mb-4">
              <AccordionTab
                header={
                  <div className="flex items-center gap-2">
                    <i className="pi pi-database text-green-600" style={{ fontSize: '1rem' }} />
                    <span className="text-sm font-semibold">Metadata ({Object.keys((execution as any).metadata).length} fields)</span>
                  </div>
                }
              >
                <div className="bg-green-50 dark:bg-gray-700 p-4 rounded-lg">
                  {Object.entries((execution as any).metadata).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between py-2 border-b border-green-100 dark:border-gray-600 last:border-0 items-center"
                    >
                      <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">{key}:</span>
                      <span className="text-sm text-gray-900 dark:text-white font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </AccordionTab>
            </Accordion>
          )}

          {/* Execution ID */}
          <div className="bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <i className="pi pi-id-card text-slate-600 dark:text-slate-400" style={{ fontSize: '1rem' }} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Execution ID</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-mono break-all bg-white dark:bg-gray-700 p-3 rounded border border-slate-200 dark:border-gray-600">{execution._id}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-5 flex gap-3">
          <Button label="Copy ID" icon="pi pi-copy" onClick={handleCopyId} testId="PromptDetail.Button.CopyId" />
          <Button
            label="Export Details"
            icon="pi pi-download"
            severity="info"
            onClick={handleExportDetails}
            testId="PromptDetail.Button.Export"
          />
          <Button
            label="Close"
            severity="secondary"
            outlined
            onClick={onClose}
            testId="PromptDetail.Button.Close"
          />
        </div>
      </div>
    </Sidebar>
  );
};

export default PromptExecutionDetailDrawer;
