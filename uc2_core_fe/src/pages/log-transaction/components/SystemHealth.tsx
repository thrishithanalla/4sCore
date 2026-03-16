import type { TemplateHealth } from '../../../types/log-transaction.types';

interface SystemHealthProps {
  templateHealth: TemplateHealth;
}

const SystemHealth = ({ templateHealth }: SystemHealthProps) => {
  return (
    <div className="mb-3">
      <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Log Master Health
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 dark:bg-green-900/20 p-2.5 rounded-md border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-600 dark:text-green-400">Active (with logs)</p>
            <p className="text-lg font-bold text-green-700 dark:text-green-300">{templateHealth.activeWithLogs}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2.5 rounded-md border border-yellow-200 dark:border-yellow-800">
            <p className="text-xs text-yellow-600 dark:text-yellow-400">Active (no logs)</p>
            <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{templateHealth.activeNoLogs}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 p-2.5 rounded-md border border-gray-200 dark:border-gray-600">
            <p className="text-xs text-gray-600 dark:text-gray-400">Inactive</p>
            <p className="text-lg font-bold text-gray-700 dark:text-gray-300">{templateHealth.inactive}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2.5 rounded-md border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400">Deleted</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-300">{templateHealth.deleted}</p>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Templates</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{templateHealth.total}</p>
        </div>
      </div>
    </div>
  );
};

export default SystemHealth;
