/**
 * Test Masters Page
 * Work in Progress placeholder
 */

const TestMastersList = () => {
  return (
    <div className="py-4 px-4 transition-colors duration-200" data-testid="SCR-TestMasters">
      <div className="max-w-7xl mx-auto">
        {/* Work in Progress Banner */}
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3">
            <i className="pi pi-wrench text-4xl text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Test Masters
          </h1>
          <h2 className="text-xl font-bold text-amber-600 dark:text-amber-400 mb-3">
            Work in Progress
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-center max-w-md">
            The Test Masters feature is currently under development. Check back soon for updates.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TestMastersList;
