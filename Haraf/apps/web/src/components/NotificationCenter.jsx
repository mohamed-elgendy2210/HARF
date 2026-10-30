import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';

export default function NotificationCenter({ appointmentHref = '' }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/api/v1/notifications');
      setNotifications(result.notifications);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markRead = async (id) => {
    setBusy(true);
    setError('');
    try {
      const { notification } = await apiRequest(`/api/v1/notifications/${id}/read`, { method: 'POST' });
      setNotifications((current) => current.map((item) => item.id === id ? notification : item));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/v1/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const unreadCount = notifications.filter(({ readAt }) => !readAt).length;

  return (
    <section className="dashboard-section notification-center" aria-labelledby="notification-center-title">
      <div className="notification-center__heading">
        <div>
          <h3 id="notification-center-title">الإشعارات</h3>
          <p>رسائل مرتبطة بحسابك وخدمات حرف.</p>
        </div>
        <div className="notification-center__actions">
          <button type="button" className="button button--small button--outline" onClick={loadNotifications} disabled={loading || busy}>
            تحديث
          </button>
          {unreadCount > 0 && (
            <button type="button" className="button button--small button--primary" onClick={markAllRead} disabled={busy}>
              تعليم الكل كمقروء
            </button>
          )}
        </div>
      </div>
      {unreadCount > 0 && <p className="notification-center__unread" role="status">لديك {unreadCount} إشعار غير مقروء.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {loading ? <p className="dashboard-loading" role="status">جارٍ تحميل الإشعارات…</p> : notifications.length ? (
        <ul className="notification-center__list">
          {notifications.map((notification) => (
            <li className={notification.readAt ? 'notification-center__item' : 'notification-center__item is-unread'} key={notification.id}>
              <div>
                <h4>{notification.title}</h4>
                <p>{notification.message}</p>
                {notification.resourceType === 'appointment' && appointmentHref && (
                  <a
                    className="notification-center__appointment-link"
                    href={`${appointmentHref}${appointmentHref.includes('?') ? '&' : '?'}appointmentId=${encodeURIComponent(notification.resourceId)}`}
                  >
                    فتح الموعد
                  </a>
                )}
                <time dateTime={notification.createdAt}>
                  {new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.createdAt))}
                </time>
              </div>
              {!notification.readAt && (
                <button type="button" className="button button--small button--outline" disabled={busy}
                  onClick={() => markRead(notification.id)}>تعليم كمقروء</button>
              )}
            </li>
          ))}
        </ul>
      ) : <div className="dashboard-empty-state">لا توجد إشعارات جديدة حاليًا.</div>}
    </section>
  );
}
