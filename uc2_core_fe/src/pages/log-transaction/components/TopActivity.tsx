import type { TopUser, TopEndpoint, MostRepeatedLog } from '../../../types/log-transaction.types';

interface TopActivityProps {
  topUsers: TopUser[];
  topEndpoints: TopEndpoint[];
  mostRepeated: MostRepeatedLog[];
  onUserClick?: (actorId: string) => void;
  onEndpointClick?: (endpoint: string) => void;
  onEventCodeClick?: (eventcode: string) => void;
}

const RankedList = ({
  title,
  items,
  color,
  onItemClick,
}: {
  title: string;
  items: { label: string; value: number; key: string }[];
  color: 'blue' | 'green' | 'purple';
  onItemClick?: (key: string) => void;
}) => {
  const colorMap = {
    blue: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-400' },
    green: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-600 dark:text-green-400' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-600 dark:text-purple-400' },
  };
  const c = colorMap[color];

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <div className="space-y-1.5">
        {items.length > 0 ? items.slice(0, 8).map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0 ${onItemClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 -mx-1 transition-colors' : ''}`}
            onClick={() => onItemClick?.(item.key)}
          >
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full ${c.bg} ${c.text} text-xs flex items-center justify-center font-medium`}>
                {idx + 1}
              </span>
              <span className={`text-xs text-gray-900 dark:text-white truncate ${onItemClick ? 'hover:underline' : ''}`} style={{ maxWidth: '180px' }}>
                {item.label}
              </span>
            </div>
            <span className={`text-xs font-medium ${c.text}`}>{item.value.toLocaleString()}</span>
          </div>
        )) : (
          <div className="text-center text-gray-400 text-sm py-4">No data</div>
        )}
      </div>
    </div>
  );
};

const TopActivity = ({ topUsers, topEndpoints, mostRepeated, onUserClick, onEndpointClick, onEventCodeClick }: TopActivityProps) => {
  return (
    <div className="grid grid-cols-3 gap-3 mb-3">
      <RankedList
        title="Top Users"
        items={topUsers.map((u) => ({ label: u.name, value: u.count, key: u.actorId }))}
        color="blue"
        onItemClick={onUserClick}
      />
      <RankedList
        title="Most Accessed Endpoints"
        items={topEndpoints.map((e) => ({ label: e.endpoint, value: e.count, key: e.endpoint }))}
        color="green"
        onItemClick={onEndpointClick}
      />
      <RankedList
        title="Most Repeated Logs"
        items={mostRepeated.map((l) => ({ label: l.name, value: l.count, key: l.eventcode }))}
        color="purple"
        onItemClick={onEventCodeClick}
      />
    </div>
  );
};

export default TopActivity;
