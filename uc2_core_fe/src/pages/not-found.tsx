import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex items-center justify-center py-4 px-4 transition-colors duration-200"
      data-testid="SCR-NotFound"
    >
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
            <i className="pi pi-exclamation-triangle text-red-600 dark:text-red-400 text-5xl"></i>
          </div>
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-3">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Page Not Found
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <i className="pi pi-arrow-left"></i>
            Go Back
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <i className="pi pi-home"></i>
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
