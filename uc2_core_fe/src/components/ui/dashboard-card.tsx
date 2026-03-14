import { Card } from 'primereact/card';
import { useAppNavigate } from '../../hooks/useAppNavigate';

interface DashboardCardProps {
  title: string;
  description: string;
  icon: string; // PrimeIcons class name (e.g., 'pi pi-building')
  route: string;
  iconColor?: string;
  iconBgColor?: string;
  disabled?: boolean;
}

const DashboardCard = ({
  title,
  description,
  icon,
  route,
  iconColor = 'text-white',
  iconBgColor = 'bg-blue-600',
  disabled = false,
}: DashboardCardProps) => {
  const navigate = useAppNavigate();

  const handleCardClick = () => {
    if (!disabled) {
      navigate(route);
    }
  };

  return (
    <Card
      className={
        disabled
          ? 'cursor-not-allowed opacity-60 h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'
          : 'cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 h-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md hover:border-blue-300 dark:hover:border-blue-600'
      }
      onClick={handleCardClick}
      data-testid={`DashboardCard.${title.replace(/\s+/g, '')}`}
    >
      <div className="p-6">
        <div className="flex items-start gap-5">
          {/* Icon */}
          <div className={`w-16 h-16 ${iconBgColor} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg transition-transform duration-300 ${!disabled && 'group-hover:scale-110'}`}>
            <i className={`${icon} ${iconColor} text-[32px]`}></i>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white leading-tight tracking-tight">
              {title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DashboardCard;