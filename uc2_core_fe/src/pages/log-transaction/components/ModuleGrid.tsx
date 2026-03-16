import { useMemo } from 'react';
import type { TopLogModule } from '../../../types/log-transaction.types';

interface ModuleGridProps {
  topLogModules: TopLogModule[];
}

const ModuleGrid = ({ topLogModules }: ModuleGridProps) => {
  const maxCount = useMemo(() => {
    if (!topLogModules.length) return 1;
    return Math.max(...topLogModules.map((m) => m.logCount), 1);
  }, [topLogModules]);

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Entity Type Activity Breakdown
      </h3>
      <div className="space-y-2">
        {topLogModules.length > 0 ? topLogModules.map((mod, idx) => (
          <div key={idx}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-900 dark:text-white">{mod.entityType || 'Unknown'}</span>
              <span className="text-blue-600 dark:text-blue-400">{mod.logCount.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${(mod.logCount / maxCount) * 100}%` }}
              />
            </div>
          </div>
        )) : (
          <div className="text-center text-gray-400 text-sm py-6">No module data</div>
        )}
      </div>
    </div>
  );
};

export default ModuleGrid;
