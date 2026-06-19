import React from 'react';
import { TraceEvent } from '../../types';

export const TraceTimeline = ({ events }: { events: TraceEvent[] }) => {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500 italic">No activity recorded for this case.</p>;
  }

  return (
    <div className="space-y-4">
      {events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((event) => (
        <div key={event.id} className="border-l-2 border-blue-200 pl-4 relative">
          <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-[7px] top-1"></div>
          <p className="text-sm font-medium text-gray-900">{event.action}</p>
          <p className="text-xs text-gray-500">
            {event.timestamp} | {event.performedBy} ({event.role})
          </p>
          {(event.fromState || event.toState) && (
            <p className="text-xs text-gray-600 mt-1">
              State: {event.fromState || 'N/A'} → {event.toState || 'N/A'}
            </p>
          )}
          {event.reason && <p className="text-xs text-gray-700 mt-1 bg-gray-50 p-1.5 rounded">{event.reason}</p>}
        </div>
      ))}
    </div>
  );
};
