export const EmptyState = ({ message = 'No records found' }: { message?: string }) => (
  <div className="p-12 text-center text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
    <p className="text-sm">{message}</p>
  </div>
);
