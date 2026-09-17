import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from './api';
import {
  getNotificationPermission,
  isNotificationSupported,
  registerServiceWorker,
  requestNotificationPermission,
  sendSystemNotification,
} from './notificationService';

const NavigationContext = createContext({
  unreadNotifications: 0,
  openNotifications: () => {},
  closeNotifications: () => {},
  isNotificationsOpen: false,
  openQuickAdd: () => {},
  closeQuickAdd: () => {},
  isQuickAddOpen: false,
  refreshNotifications: () => {},
  notificationPermission: 'default',
  requestPermission: async () => {},
  sendTestNotification: async () => {},
});

export function NavigationProvider({ children }) {
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const knownNotificationIds = useRef(new Set());
  const hasInitializedKnown = useRef(false);
  const location = useLocation();

  // 1. Register Service Worker on startup and listen to live permission changes
  useEffect(() => {
    registerServiceWorker();
    setNotificationPermission(getNotificationPermission());

    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions.query) {
      navigator.permissions.query({ name: 'notifications' })
        .then((permissionStatus) => {
          setNotificationPermission(permissionStatus.state);
          permissionStatus.onchange = () => {
            setNotificationPermission(permissionStatus.state);
          };
        })
        .catch(() => {});
    }
  }, []);

  // 2. Fetch and check for new notifications to push to system notification bar
  async function refreshNotifications() {
    const token = localStorage.getItem('splitup_token') || localStorage.getItem('token');
    if (!token) return;
    try {
      const { data } = await api.get('/api/notifications');
      const list = data.notifications || [];
      const unread = data.unreadCount || 0;
      setUnreadNotifications(unread);

      // If this is the first fetch, populate known IDs without firing alerts
      if (!hasInitializedKnown.current) {
        list.forEach((n) => knownNotificationIds.current.add(n.id));
        hasInitializedKnown.current = true;
        return;
      }

      // Detect new unread notifications that arrived
      const newUnread = list.filter((n) => !n.isRead && !knownNotificationIds.current.has(n.id));
      if (newUnread.length > 0) {
        newUnread.forEach((n) => {
          knownNotificationIds.current.add(n.id);

          // Dispatch to system notification bar
          const targetUrl = n.groupId ? `/groups/${n.groupId}` : '/dashboard';
          sendSystemNotification({
            title: n.title || 'SplitUp Update 🔔',
            body: n.message || 'You have a new activity in SplitUp',
            data: { url: targetUrl },
            tag: `splitup-notif-${n.id}`,
          });
        });
      }
    } catch {
      // Graceful error recovery
    }
  }

  // Refresh on route change
  useEffect(() => {
    refreshNotifications();
  }, [location.pathname]);

  // 3. Background periodic polling (every 20s) to catch updates when tab is in background
  useEffect(() => {
    const interval = setInterval(() => {
      refreshNotifications();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // 4. Request system notification permission
  async function handleRequestPermission() {
    if (getNotificationPermission() === 'denied') {
      window.alert('Notification permissions are currently blocked in your browser.\n\nTo enable alerts:\n1. Click the site settings icon (🔒 or ⚙️) next to the URL in your browser address bar.\n2. Change "Notifications" to "Allow".\n3. Return here to receive alerts!');
      setNotificationPermission('denied');
      return 'denied';
    }
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      sendSystemNotification({
        title: 'SplitUp Notifications Enabled 🎉',
        body: 'You will now receive alerts in your notification bar even when SplitUp is in the background!',
        data: { url: '/dashboard' },
        tag: 'splitup-welcome',
      });
    }
    return perm;
  }

  // 5. Send test notification
  async function handleSendTest() {
    let perm = notificationPermission;
    if (perm !== 'granted') {
      perm = await handleRequestPermission();
    }
    if (perm === 'granted') {
      sendSystemNotification({
        title: 'SplitUp Test Alert 🔔',
        body: 'Notifications are working perfectly in your notification bar!',
        data: { url: '/dashboard' },
        tag: 'splitup-test',
      });
    }
  }

  const value = {
    unreadNotifications,
    isNotificationsOpen,
    openNotifications: () => setIsNotificationsOpen(true),
    closeNotifications: () => setIsNotificationsOpen(false),
    isQuickAddOpen,
    openQuickAdd: () => setIsQuickAddOpen(true),
    closeQuickAdd: () => setIsQuickAddOpen(false),
    refreshNotifications,
    notificationPermission,
    requestPermission: handleRequestPermission,
    sendTestNotification: handleSendTest,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}

