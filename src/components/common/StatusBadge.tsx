export const StatusBadge = ({ status, variant = 'info' }: { status: string, variant?: 'info' | 'success' | 'warning' | 'danger' }) => {
  const variants = {
    info: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-orange-100 text-orange-800',
    danger: 'bg-red-100 text-red-800',
  };
  return <span className={`px-2 py-1 rounded-full text-xs font-medium ${variants[variant]}`}>{status.toUpperCase()}</span>;
};
