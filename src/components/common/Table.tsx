import React from 'react';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';

interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function Table<T>({ data, columns, onRowClick, emptyMessage = 'No records found', isLoading = false }: TableProps<T>) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className="px-6 py-3 text-sm font-medium text-gray-500">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item, i) => (
            <tr key={i} 
                className={`${onRowClick ? 'hover:bg-blue-50 transition-colors cursor-pointer' : ''}`}
                onClick={() => onRowClick && onRowClick(item)}>
              {columns.map((col, j) => (
                <td key={j} className="px-6 py-4 text-sm text-gray-900">{col.accessor(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
