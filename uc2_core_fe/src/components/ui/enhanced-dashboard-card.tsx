import { useState, useEffect } from 'react';

interface EnhancedDashboardCardProps {
  title: string;
  count: number;
  icon: string;
  bgColor: string;
  route: string;
  onClick: (route: string) => void;
  index: number;
}

// Animated counter hook
const useCountAnimation = (end: number, duration: number = 1000) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (end === 0) return;

    let startTime: number | null = null;
    const startValue = 0;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);

      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentCount = Math.floor(easeOutQuart * (end - startValue) + startValue);

      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return count;
};

const EnhancedDashboardCard = ({
  title,
  count,
  icon,
  bgColor,
  route,
  onClick,
  index
}: EnhancedDashboardCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const animatedCount = useCountAnimation(count, 1500);

  // Extract color name from Tailwind class (e.g., 'bg-blue-600' -> 'blue')
  const getGradientColors = (bgColorClass: string): { from: string; to: string } => {
    const colorMap: Record<string, { from: string; to: string }> = {
      blue: { from: '#3b82f6', to: '#60a5fa' },
      green: { from: '#10b981', to: '#34d399' },
      purple: { from: '#8b5cf6', to: '#a78bfa' },
      cyan: { from: '#06b6d4', to: '#22d3ee' },
      pink: { from: '#ec4899', to: '#f472b6' },
      yellow: { from: '#f59e0b', to: '#fbbf24' },
      amber: { from: '#f59e0b', to: '#fbbf24' },
      emerald: { from: '#059669', to: '#10b981' },
      lime: { from: '#84cc16', to: '#a3e635' },
      sky: { from: '#0ea5e9', to: '#38bdf8' },
      violet: { from: '#7c3aed', to: '#8b5cf6' },
      indigo: { from: '#6366f1', to: '#818cf8' },
      teal: { from: '#14b8a6', to: '#2dd4bf' },
      rose: { from: '#f43f5e', to: '#fb7185' },
      orange: { from: '#f97316', to: '#fb923c' },
      red: { from: '#ef4444', to: '#f87171' },
      slate: { from: '#64748b', to: '#94a3b8' },
      gray: { from: '#6b7280', to: '#9ca3af' },
    };

    const colorName = bgColorClass.match(/bg-(\w+)-/)?.[1] || 'gray';
    return colorMap[colorName] || colorMap.gray;
  };

  const gradients = getGradientColors(bgColor);

  return (
    <div
      onClick={() => onClick(route)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="cursor-pointer group relative overflow-hidden rounded-2xl transition-all duration-500 ease-out"
      style={{
        animation: 'fadeInUp 0.6s ease-out forwards',
        animationDelay: `${index * 0.08}s`,
        opacity: 0,
      }}
    >
      {/* Gradient Background */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `linear-gradient(135deg, ${gradients.from}15 0%, ${gradients.to}25 100%)`,
        }}
      />

      {/* Card Content */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-100 dark:border-gray-700 group-hover:border-transparent shadow-md group-hover:shadow-2xl transition-all duration-500 p-8">
        {/* Decorative Elements */}
        <div
          className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-5 transition-transform duration-700 group-hover:scale-150"
          style={{
            background: `linear-gradient(135deg, ${gradients.from} 0%, ${gradients.to} 100%)`
          }}
        />

        <div className="flex items-start justify-between relative z-10">
          {/* Left Content */}
          <div className="flex-1 space-y-3">
            <h3 className="text-base font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider transition-colors duration-300 group-hover:text-gray-700 dark:group-hover:text-gray-300">
              {title}
            </h3>
            <div className="flex items-baseline gap-3">
              <p className="text-5xl font-extrabold text-gray-900 dark:text-white transition-transform duration-300 group-hover:scale-110">
                {animatedCount.toLocaleString()}
              </p>
              {isHovered && (
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">
                  records
                </span>
              )}
            </div>
          </div>

          {/* Icon */}
          <div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${gradients.from} 0%, ${gradients.to} 100%)`,
            }}
          >
            {/* Glow Effect */}
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-50 blur-xl transition-opacity duration-500"
              style={{
                background: `linear-gradient(135deg, ${gradients.from} 0%, ${gradients.to} 100%)`,
              }}
            />
            <i
              className={`${icon} text-white relative z-10 transition-transform duration-300 group-hover:scale-110`}
              style={{ fontSize: '1.75rem' }}
            />
          </div>
        </div>

        {/* Bottom Action Indicator */}
        <div className="mt-6 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            View Details
          </span>
          <i
            className="pi pi-arrow-right text-gray-400 transition-transform duration-300 group-hover:translate-x-1"
            style={{ fontSize: '1rem' }}
          />
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default EnhancedDashboardCard;