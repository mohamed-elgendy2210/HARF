import { useEffect, useRef } from 'react';

export function usePolling(callback, {
  enabled = true,
  intervalMs = 5000,
  listenForRemoteChanges = false
} = {}) {
  const callbackRef = useRef(callback);
  const inFlightRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;

    const refresh = async () => {
      if (!active || document.visibilityState === 'hidden' || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await callbackRef.current();
      } catch (error) {
        console.error('Background data refresh failed.', error);
      } finally {
        inFlightRef.current = false;
      }
    };

    const timer = window.setInterval(() => void refresh(), intervalMs);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    if (listenForRemoteChanges) window.addEventListener('harf:remote-change', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      if (listenForRemoteChanges) window.removeEventListener('harf:remote-change', refresh);
    };
  }, [enabled, intervalMs, listenForRemoteChanges]);
}
