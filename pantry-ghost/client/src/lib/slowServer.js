import toast from 'react-hot-toast';

/**
 * The live demo runs on free hosting that goes to sleep when nobody is using it, so the first request
 * after a quiet spell can take up to a minute. Without a word from the app that looks like a crash.
 * This shows one notice ("the server is waking up, please wait") when any request has been pending
 * for a few seconds, updates it if it is still pending later, and replaces it with "ready" when the
 * server finally answers. Fast requests never show anything.
 */
export const SLOW_AFTER_MS = 4000;
export const STILL_WAITING_MS = 25000;
export const TOAST_ID = 'slow-server';

export const SLOW_MESSAGE = 'Waking the server up. It runs on a free plan, so the first request can take up to a minute. Please wait, nothing is lost.';
export const STILL_MESSAGE = 'Still waking up. Almost there, please keep this page open.';
export const READY_MESSAGE = 'The server is ready.';

/**
 * Builds a watcher with injectable timing and notifications, so it can be unit tested.
 * `begin()` returns a function to call when that request finishes (success or failure).
 */
export function createSlowServerWatch({
  slowAfter = SLOW_AFTER_MS,
  stillAfter = STILL_WAITING_MS,
  show = (message) => toast.loading(message, { id: TOAST_ID, duration: Infinity }),
  ready = () => toast.success(READY_MESSAGE, { id: TOAST_ID, duration: 2500 }),
  hide = () => toast.dismiss(TOAST_ID),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
} = {}) {
  let pending = 0;
  let visible = false;
  const timers = new Set();

  const later = (ms, fn) => {
    const t = setTimer(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };
  const cancelAll = () => { timers.forEach((t) => clearTimer(t)); timers.clear(); };

  /** Starts watching one request. */
  function begin() {
    pending += 1;
    if (pending === 1) {
      later(slowAfter, () => {
        if (pending === 0) return;
        visible = true;
        show(SLOW_MESSAGE);
        later(stillAfter - slowAfter, () => { if (pending > 0) show(STILL_MESSAGE); });
      });
    }
    let finished = false;
    return function end(ok = true) {
      if (finished) return;
      finished = true;
      pending = Math.max(0, pending - 1);
      if (pending > 0) return;
      cancelAll();
      if (!visible) return;
      visible = false;
      // A request that failed (offline, 500) is not "ready"; just take the notice away.
      if (ok) ready(); else hide();
    };
  }
  return { begin, get pending() { return pending; } };
}

const watch = createSlowServerWatch();
const ENDERS = new WeakMap();

/** Axios request interceptor half: starts watching this request. */
export function trackRequest(config) {
  ENDERS.set(config, watch.begin());
  return config;
}

/** Axios response/error interceptor half: stops watching. Safe to call for configs never tracked. */
export function finishRequest(config, ok = true) {
  ENDERS.get(config)?.(ok);
}
