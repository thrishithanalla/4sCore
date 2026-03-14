import { useAppNavigate } from '../../hooks/useAppNavigate';
import { Button } from 'mainFe/Button';

const NotificationMasterNotWorking = () => {
  const navigate = useAppNavigate();

  return (
    <div className="py-4 px-4 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
       
        {/* Work in Progress Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          {/* Icon */}
          <div className="mb-3">
            <div className="w-20 h-20 mx-auto bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <i className="pi pi-wrench text-orange-500" style={{ fontSize: '2.5rem' }} />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Notification Masters
          </h1>

          {/* Subtitle */}
          <h2 className="text-base font-semibold text-orange-500 mb-3">
            Currently Under Development
          </h2>

          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            The Notification Masters module is actively being developed. This feature will enable you to manage system-wide notification templates and delivery configurations.
          </p>

         

         
        </div>
      </div>
    </div>
  );
};

export default NotificationMasterNotWorking;
