import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';
import { httpError } from '../utils/httpError.js';
import { getContext } from '../context.js';
import { getEnv } from '../config/env.js';
import { mailEnabled, sendMail, renderNotificationEmail, isReservedAddress, allowsTestDomains } from './mailService.js';

const MAX_LIST = 50;

/**
 * Creates one notification per recipient. Recipients are user ids and/or role names (active users
 * only). A repeated `dedupeKey` is silently skipped, so jobs can run again without duplicates.
 *
 * @param {{ userIds?: any[], roles?: string[], title: string, body?: string, link?: string,
 *           kind?: 'info'|'warning'|'danger', dedupeKey?: string }} n
 * @returns {Promise<number>} how many notifications were created
 */
export async function notify({ userIds = [], roles = [], title, body = '', link = '', kind = 'info', dedupeKey } = {}) {
  if (!title) throw new Error('notify: title is required');
  const ids = new Set(userIds.filter(Boolean).map(String));
  if (roles.length) {
    const byRole = await User.find({ role: { $in: roles }, active: true }).select('_id').lean();
    for (const u of byRole) ids.add(String(u._id));
  }
  if (!ids.size) return 0;

  const docs = [...ids].map((id) => ({
    user: id, title: title.slice(0, 200), body: body.slice(0, 500), link, kind,
    dedupeKey: dedupeKey ? `${dedupeKey}`.slice(0, 200) : undefined,
  }));
  let inserted;
  try {
    inserted = await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    // Duplicate-key errors (E11000) mean "already notified": keep what was inserted, ignore the rest.
    if (err.code === 11000 || err.writeErrors?.every((e) => e.code === 11000)) inserted = err.insertedDocs ?? [];
    else throw err;
  }
  await emailRecipients(inserted, { title, body, link });
  return inserted.length;
}

/** Emails the users who were just notified. Never throws; only active users receive mail. */
async function emailRecipients(inserted, { title, body, link }) {
  if (!inserted.length || !mailEnabled()) return;
  try {
    const users = await User.find({ _id: { $in: inserted.map((n) => n.user) }, active: true }).select('email').lean();
    const appName = getContext().config?.appName ?? 'Crypt Kit';
    const base = String(getEnv().CLIENT_URL ?? '').replace(/\/$/, '');
    const url = link && base ? `${base}${link}` : '';
    const { text, html } = renderNotificationEmail({ title, body, url, appName });
    await Promise.allSettled(users.map((u) => sendMail({ to: u.email, subject: `[${appName}] ${title}`, text, html })));
  } catch (err) {
    console.error('emailRecipients failed:', err.message);
  }
}

/** Latest notifications for a user, newest first, with the unread count. */
export async function listFor(userId, { unreadOnly = false } = {}) {
  const filter = { user: userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(MAX_LIST).lean(),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);
  return { items, unread };
}

/** Marks one of the user's own notifications read. */
export async function markRead(userId, id) {
  if (typeof id !== 'string' || !OBJECT_ID_RE.test(id)) throw httpError(404, 'Notification not found');
  const doc = await Notification.findOneAndUpdate(
    { _id: id, user: userId },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  if (!doc) throw httpError(404, 'Notification not found');
  return doc;
}

/** Marks every unread notification of the user as read. Returns the number changed. */
export async function markAllRead(userId) {
  const res = await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
  return res.modifiedCount;
}

/**
 * Readable title of a record. When the title field is a reference (a calibration's equipment, a
 * loan's item) the referenced record's own title is looked up, so messages never quote a raw id.
 */
export async function titleFor(resource, doc, depth = 0) {
  const { def } = resource;
  const name = def.titleField ?? Object.keys(def.fields)[0];
  const value = doc?.[name];
  const spec = def.fields[name];
  if (spec?.type !== 'ref' || !value || depth > 2) return String(value ?? doc?._id ?? '');
  try {
    if (spec.ref === 'User') return (await User.findById(value).select('name').lean())?.name ?? String(value);
    const target = getContext().registry?.get(spec.ref);
    if (!target) return String(value);
    const found = await target.model.findById(value).lean();
    return found ? await titleFor(target, found, depth + 1) : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Notifies after a due rule moved records to a new status: the superuser role plus every User
 * ref on the record (e.g. the borrower or owner). Never throws, so a sweep cannot fail on it.
 */
export async function notifyDueChange(resource, docs, to, { roles = [] } = {}) {
  try {
    const { key, def } = resource;
    const userRefs = Object.entries(def.fields).filter(([, s]) => s.type === 'ref' && s.ref === 'User').map(([n]) => n);
    const singular = def.label.replace(/s$/, '');
    for (const d of docs) {
      const owners = userRefs.map((f) => d[f]).filter((v) => v && mongoose.isValidObjectId(v));
      await notify({
        userIds: owners,
        roles,
        title: `${singular} "${await titleFor(resource, d)}" is now ${to}`,
        body: `${def.label}: status changed automatically to ${to}.`,
        link: `/r/${key}/${d._id}`,
        kind: /overdue|expired|late|due/i.test(to) ? 'danger' : 'warning',
        dedupeKey: `due:${key}:${d._id}:${to}`,
      });
    }
  } catch (err) {
    console.error('notifyDueChange failed:', err.message);
  }
}

/**
 * Emails the signed-in user a short test message so they can see how email alerts arrive.
 * @returns {Promise<{ to: string }>}
 * @throws {Error} 409 when email is not set up, 404 unknown user, 502 when the mail server refuses it
 */
export async function sendTestEmail(userId) {
  if (!mailEnabled()) throw httpError(409, 'Email is not set up on this server yet');
  const user = await User.findById(userId).select('email active').lean();
  if (!user || user.active === false) throw httpError(404, 'User not found');
  if (isReservedAddress(user.email) && !allowsTestDomains()) {
    throw httpError(409, `${user.email} is a demo address that cannot receive email. Sign in with your own account to test email.`);
  }
  const appName = getContext().config?.appName ?? 'Crypt Kit';
  const { text, html } = renderNotificationEmail({
    title: `Test email from ${appName}`,
    body: 'If you can read this, email alerts work for your account.',
    url: getEnv().CLIENT_URL,
    appName,
  });
  const result = await sendMail({ to: user.email, subject: `[${appName}] Test email`, text, html });
  if (!result.sent) throw httpError(502, 'The mail server did not accept the email. Check the SMTP settings.');
  return { to: user.email };
}