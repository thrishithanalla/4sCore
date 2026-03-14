import React from 'react';

export type StatCardVariant = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal' | 'indigo' | 'pink';

const variantColors: Record<StatCardVariant, string> = {
  blue: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  green: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  purple: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  orange: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
  red: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  teal: 'bg-teal-50 border-teal-200 dark:bg-teal-900/20 dark:border-teal-800',
  indigo: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800',
  pink: 'bg-pink-50 border-pink-200 dark:bg-pink-900/20 dark:border-pink-800',
};

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  variant?: StatCardVariant;
  icon?: React.ReactNode;
  trendIcon?: React.ReactNode;
  trendUp?: boolean;
  onClick?: () => void;
  className?: string;
  testId?: string;
  compact?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  variant = 'blue',
  icon,
  onClick,
  className,
  testId,
  compact,
}) => (
  <div
    className={`rounded-lg border p-4 ${compact ? 'p-3' : 'p-4'} ${variantColors[variant]} ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${className || ''}`}
    onClick={onClick}
    data-testid={testId}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
        <p className={`font-bold text-gray-900 dark:text-white ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      </div>
      {icon && <div className="text-2xl opacity-70">{icon}</div>}
    </div>
  </div>
);

export default StatCard;
