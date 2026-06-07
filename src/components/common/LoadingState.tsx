export const LoadingState = () => (
  <div className="p-8 text-center text-gray-500 text-sm">
    <div className="animate-pulse flex flex-col items-center">
      <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
    <span className="mt-2 block">Loading data...</span>
  </div>
);
