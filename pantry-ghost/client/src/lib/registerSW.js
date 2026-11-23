/**
 * Registers the service worker (`public/sw.js`) so the portal installs and opens offline.
 * Only in production builds: in development a cached shell would hide edits, and tests have no worker.
 *
 * @param {{ prod?: boolean, nav?: Navigator | null, win?: Window | null }} [opts] injectable for tests
 * @returns {boolean} true when registration was set up
 */
export function registerSW({ prod = import.meta.env.PROD, nav = typeof navigator === 'undefined' ? null : navigator, win = typeof window === 'undefined' ? null : window } = {}) {
  if (!prod || !nav || !win || !('serviceWorker' in nav)) return false;
  const register = () => nav.serviceWorker.register('/sw.js').catch(() => { /* a failed registration just means no offline shell */ });
  if (win.document?.readyState === 'complete') register();
  else win.addEventListener('load', register, { once: true });
  return true;
}
