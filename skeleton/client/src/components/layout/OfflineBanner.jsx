import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** True unless the browser says it is offline. */
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * A thin bar under the top bar while the browser is offline. The app shell still opens from the
 * service worker's cache, but records come from the API, so changes cannot be saved until it is back.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b bg-warning/15 px-4 py-2 text-center text-sm font-medium tone-warning">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>You are offline. You can look around, but changes cannot be saved until you are back online.</span>
    </div>
  );
}
