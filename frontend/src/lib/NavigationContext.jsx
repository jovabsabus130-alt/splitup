import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from './api';

const NavigationContext = createContext({
  unreadNotifications: 0,
  openNotifications: () => {},
  closeNotifications: () => {},
  isNotificationsOpen: false,
  openQuickAdd: () => {},
  closeQuickAdd: () => {},
  isQuickAddOpen: false,
  refreshNotifications: () => {},
});

export function NavigationProvider({ children }) {
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const location = useLocation();

  async function refreshNotifications() {
    const token = localStorage.getItem('splitup_token') || localStorage.getItem('token');
    if (!token) return;
    try {
      const { data } = await api.get('/api/notifications');
      setUnreadNotifications(data.unreadCount || 0);
    } catch {
      // Graceful error recovery
    }
  }

  useEffect(() => {
    refreshNotifications();
  }, [location.pathname]);

  const value = {
    unreadNotifications,
    isNotificationsOpen,
    openNotifications: () => setIsNotificationsOpen(true),
    closeNotifications: () => setIsNotificationsOpen(false),
    isQuickAddOpen,
    openQuickAdd: () => setIsQuickAddOpen(true),
    closeQuickAdd: () => setIsQuickAddOpen(false),
    refreshNotifications,
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
