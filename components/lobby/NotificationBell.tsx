import React from 'react';
import { Bell, Check } from 'lucide-react';
import { CustomDropdown, CustomDropdownItem, CustomDropdownLabel, CustomDropdownSeparator } from '../CustomDropdown';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '../ui/button';
import { useRouter } from 'next/router';
import { formatDate } from '@/lib/dateUtils';

export const NotificationBell = () => {
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const router = useRouter();

  const handleNotificationClick = (notification: any) => {
    if (!notification.read) {
      markAsRead([notification.id]);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };
  
  const handleMarkAllAsRead = () => {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (unreadIds.length > 0) {
          markAsRead(unreadIds);
      }
  }

  const trigger = (
    <div className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-accent transition-colors">
      <Bell className="h-5 w-5 text-faded-grey" />
      {unreadCount > 0 && (
        <div className="absolute top-1 right-1 w-4 h-4 bg-steel-red rounded-full text-white text-xs flex items-center justify-center">
          {unreadCount}
        </div>
      )}
    </div>
  );

  return (
    <CustomDropdown trigger={trigger} align="end" contentClassName="w-80">
        <div className="flex justify-between items-center px-4 py-2">
            <CustomDropdownLabel>Notifications</CustomDropdownLabel>
            {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={handleMarkAllAsRead}>
                    <Check className="w-3 h-3 mr-1"/>
                    Mark all as read
                </Button>
            )}
        </div>
      <CustomDropdownSeparator />
      {notifications.length > 0 ? (
        notifications.map(notification => (
          <CustomDropdownItem key={notification.id} onClick={() => handleNotificationClick(notification)}>
            <div className={`w-full ${!notification.read ? 'font-bold' : ''}`}>
              <p className="text-sm">{notification.title}</p>
              <p className={`text-xs ${!notification.read ? 'text-gray-400' : 'text-gray-500'}`}>{notification.message}</p>
              <p className="text-xs text-gray-600 mt-1">{formatDate(notification.created_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            {!notification.read && <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 flex-shrink-0"></div>}
          </CustomDropdownItem>
        ))
      ) : (
        <div className="px-4 py-3 text-sm text-gray-500 text-center">No new notifications</div>
      )}
    </CustomDropdown>
  );
}; 