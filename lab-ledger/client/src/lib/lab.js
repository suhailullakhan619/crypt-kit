/**
 * Lab Ledger client helpers. Workflow permissions mirror server/src/services/checkoutService.js
 * (STAFF_ROLES): Technicians and the LabManager approve, reject, receive returns and print labels.
 */
export const STAFF_ROLES = ['LabManager', 'Technician'];
export const isStaff = (role) => STAFF_ROLES.includes(role);

export const OUT_STATUSES = ['Active', 'Overdue'];
export const MAX_LOAN_DAYS = 30;
export const MAX_LABELS = 60;
/** Loans are due back at this local hour on the chosen day. */
export const DUE_HOUR = 18;

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' for a local date. */
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Date-input bounds for a loan so the server rule (now < dueBack ≤ now + 30 days) always holds:
 * earliest today (if before DUE_HOUR) else tomorrow, latest today + 29 days.
 * @param {Date} [now]
 */
export function dueBackBounds(now = new Date()) {
  const first = new Date(now);
  if (now.getHours() >= DUE_HOUR) first.setDate(first.getDate() + 1);
  const last = new Date(now);
  last.setDate(last.getDate() + MAX_LOAN_DAYS - 1);
  const def = new Date(now);
  def.setDate(def.getDate() + 7);
  return { min: isoDay(first), max: isoDay(last), default: isoDay(def) };
}

/** 'YYYY-MM-DD' → ISO instant at DUE_HOUR local time. */
export function dueBackIso(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, DUE_HOUR, 0, 0).toISOString();
}

/** Extracts an asset tag from a scanned QR value: a `/scan/<tag>` URL or the bare tag. */
export function tagFromScan(raw) {
  const value = String(raw ?? '').trim();
  const m = value.match(/\/scan\/([^/?#]+)/);
  const tag = m ? decodeURIComponent(m[1]) : value;
  return tag.trim().toUpperCase();
}

/** True when a loan is past its due-back date (or already flagged Overdue). */
export const isLate = (co, now = Date.now()) => co?.status === 'Overdue' || (OUT_STATUSES.includes(co?.status) && new Date(co.dueBack).getTime() < now);
