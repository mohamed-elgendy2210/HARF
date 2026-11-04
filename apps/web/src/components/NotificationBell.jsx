import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

function notificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function NotificationBell({ onOpenNotifications }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async (includeRecent = false) => {
    try {
      const results = await Promise.all([
        apiRequest('/api/v1/notifications/unread-count'),
        ...(includeRecent ? [apiRequest('/api/v1/notifications?limit=5')] : [])
      ]);
      setUnreadCount(results[0].unreadCount);
      if (includeRecent) setNotifications(results[1].notifications);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleNotificationChange = () => void refresh(open);
    window.addEventListener('harf:notifications-changed', handleNotificationChange);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('harf:notifications-changed', handleNotificationChange);
    };
  }, [open, refresh]);

  const togglePanel = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
      void refresh(true);
    }
  };

  const markRead = async (id) => {
    setBusyId(id);
    setError('');
    try {
      const { notification } = await apiRequest(`/api/v1/notifications/${id}/read`, { method: 'POST' });
      setNotifications((current) => current.map((item) => item.id === id ? notification : item));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="notification-bell">
      <button type="button" className="notification-bell__trigger" aria-label={`الإشعارات${unreadCount ? `، ${unreadCount} غير مقروء` : ''}`}
        aria-expanded={open} aria-haspopup="dialog" onClick={togglePanel}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 99 ? '٩٩+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-bell__panel" role="dialog" aria-label="الإشعارات">
          <header className="notification-bell__heading">
            <div><strong>الإشعارات</strong><small>{unreadCount ? `${unreadCount} غير مقروء` : 'لا توجد إشعارات غير مقروءة'}</small></div>
            <button type="button" aria-label="إغلاق الإشعارات" onClick={() => setOpen(false)}>×</button>
          </header>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل الإشعارات…</p> : notifications.length ? (
            <ul className="notification-bell__list">
              {notifications.map((notification) => (
                <li key={notification.id} className={notification.readAt ? '' : 'is-unread'}>
                  <div className="notification-bell__item-copy">
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <time dateTime={notification.createdAt}>{notificationTime(notification.createdAt)}</time>
                    {notification.actionUrl && <a href={notification.actionUrl}>فتح التفاصيل</a>}
                  </div>
                  {!notification.readAt && (
                    <button type="button" className="notification-bell__read" disabled={busyId === notification.id}
                      onClick={() => void markRead(notification.id)}>مقروء</button>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="notification-bell__empty">لا توجد إشعارات حتى الآن.</p>}
          <button type="button" className="notification-bell__all" onClick={() => {
            setOpen(false);
            onOpenNotifications();
          }}>عرض كل الإشعارات</button>
        </section>
      )}
    </div>
  );
}
