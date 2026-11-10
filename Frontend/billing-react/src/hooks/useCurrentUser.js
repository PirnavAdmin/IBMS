import { useMemo, useSyncExternalStore } from 'react';
const key = 'billing_auth_user';
const eventName = 'billing-profile-updated';
function subscribe(listener) {
  window.addEventListener('storage', listener);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(eventName, listener); };
}
export function useCurrentUser() {
  const raw = useSyncExternalStore(subscribe, () => typeof localStorage === 'undefined' ? null : localStorage.getItem(key), () => null);
  return useMemo(() => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }, [raw]);
}
export function publishProfile(user) {
  localStorage.setItem(key, JSON.stringify(user));
  window.dispatchEvent(new Event(eventName));
}
