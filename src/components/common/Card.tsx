import React from 'react';

export const Card = ({ children, className }: { children: React.ReactNode; className?: string; key?: string | number }) => (
  <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
    {children}
  </div>
);
