import React, { useState, useEffect } from 'react';
import { PageHeader } from './common/PageHeader';
import { Card } from './common/Card';
import { api } from '../lib/api';
import { AppNotification, Role } from '../types';
import { useAuth } from '../context/AuthContext';

export default function NotificationCenterView({ userRole }: { userRole: Role }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    api.notifications.getAll().then(setNotifications);
  }, []);

  const handleAcknowledge = async (id: string) => {
    if (!user) return;
    await api.notifications.acknowledge(id, user.uid);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, acknowledged: true, acknowledgedBy: user.uid } : n));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Notification Center" />
      
      <div className="space-y-4">
        {notifications.map(notification => (
          <div key={notification.id}>
            <Card className={`p-4 ${notification.acknowledged ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <span className={`text-xs font-bold uppercase ${notification.severity === 'critical' ? 'text-red-500' : 'text-blue-500'}`}>
                    {notification.category} • {notification.severity}
                  </span>
                  <h3 className="text-lg font-semibold text-gray-900">{notification.title}</h3>
                  <p className="text-gray-600">{notification.message}</p>
                  <p className="text-xs text-gray-400 mt-2">Source: {notification.source} | {new Date(notification.createdAt).toLocaleString()}</p>
                </div>
                {!notification.acknowledged && (
                  <button 
                    onClick={() => handleAcknowledge(notification.id)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
