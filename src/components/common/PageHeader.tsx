import React from 'react';

export const PageHeader = ({ title, action }: { title: string, action?: React.ReactNode }) => (
  <div className="flex justify-between items-center mb-6">
    <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
    {action}
  </div>
);
