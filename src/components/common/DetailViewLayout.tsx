import React from 'react';
import { PageHeader } from './PageHeader';
import { Card } from './Card';

export const DetailViewLayout = ({
  title,
  onBack,
  children,
  action,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="space-y-6">
    <button onClick={onBack} className="text-blue-600 flex items-center gap-1 hover:text-blue-800 text-sm font-medium">
       &larr; Back
    </button>
    <div className="border-b border-gray-200 pb-4">
        <PageHeader title={title} action={action} />
    </div>
    <Card className="p-6">
      {children}
    </Card>
  </div>
);
