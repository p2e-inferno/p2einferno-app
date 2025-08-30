import React from 'react';
import { Bell, Check, X } from 'lucide-react';
import { CustomDropdown, CustomDropdownItem, CustomDropdownLabel, CustomDropdownSeparator } from '../CustomDropdown';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '../ui/button';
import { useRouter } from 'next/router';
import { formatDate } from '@/lib/dateUtils';

export const NotificationBell = () => {
  const { notifications, unreadCount, markAsRead, deleteNotification } = useNotifications();
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
  };

  const handleDeleteNotification = (e: React.MouseEvent, notificationId: string) => {
      e.stopPropagation();
      deleteNotification(notificationId);
  };

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
      <div className="max-h-96 overflow-y-auto scrollbar-hide">
        {notifications.length > 0 ? (
          notifications.map(notification => (
            <div key={notification.id} className="relative group">
              <CustomDropdownItem onClick={() => handleNotificationClick(notification)}>
                <div className={`w-full pr-8 ${!notification.read ? 'font-bold' : ''}`}>
                  <p className="text-sm">{notification.title}</p>
                  <p className={`text-xs ${!notification.read ? 'text-gray-400' : 'text-gray-500'}`}>{notification.message}</p>
                  <p className="text-xs text-gray-600 mt-1">{formatDate(notification.created_at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                {!notification.read && <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 flex-shrink-0"></div>}
              </CustomDropdownItem>
              <button
                onClick={(e) => handleDeleteNotification(e, notification.id)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-red-100 hover:text-red-600 rounded-full text-gray-400"
                title="Delete notification"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))
        ) : (
          <div className="px-4 py-3 text-sm text-gray-500 text-center">No new notifications</div>
        )}
      </div>
    </CustomDropdown>
  );
}; 