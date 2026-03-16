interface LayerLevelBreakdownProps {
  analytics: Record<string, number>;
}

const LAYER_COLORS: Record<string, string> = {
  api: 'bg-orange-500', API: 'bg-orange-500',
  function: 'bg-green-500', screen: 'bg-blue-500',
  config: 'bg-gray-500', db: 'bg-purple-500',
  Server: 'bg-red-500',
};

const LayerLevelBreakdown = ({ analytics }: LayerLevelBreakdownProps) => {
  const total = analytics.total || 1;
  const layers = Object.entries(analytics)
    .filter(([key]) => key !== 'total')
    .sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Layer Activity
      </h3>
      <div className="space-y-2">
        {layers.length > 0 ? layers.map(([layer, count]) => {
          const pct = ((count as number) / total) * 100;
          return (
            <div key={layer}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-900 dark:text-white uppercase">{layer}</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {(count as number).toLocaleString()} ({pct.toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`${LAYER_COLORS[layer] || 'bg-gray-500'} h-2 rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        }) : (
          <div className="text-center text-gray-400 text-sm py-6">No layer data</div>
        )}
      </div>
    </div>
  );
};

export default LayerLevelBreakdown;
