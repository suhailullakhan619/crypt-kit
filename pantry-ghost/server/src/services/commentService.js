import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import { getContext } from '../context.js';
import { isSuperuser } from '../core/permissions.js';
import { OBJECT_ID_RE } from '../core/fieldTypes.js';
import { httpError } from '../utils/httpError.js';
import { withTransaction } from '../utils/transaction.js';
import * as activity from './activityService.js';
import { notify, titleFor } from './notificationService.js';

export const COMMENT_MAX = 2000;

/** Cleans a comment body. @throws {Error} 400 unless it is a string of 1 to 2000 characters after trimming */
export function cleanBody(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) throw httpError(400, 'Comment cannot be empty', { fields: { body: 'Write something first' } });
  if (text.length > COMMENT_MAX) throw httpError(400, `Comment is too long (max ${COMMENT_MAX} characters)`, { fields: { body: `At most ${COMMENT_MAX} characters` } });
  return text;
}

async function loadRecord(resource, id) {
  if (typeof id !== 'string' || !OBJECT_ID_RE.test(id)) throw httpError(404, 'Record not found');
  const doc = await resource.model.findById(id).lean();
  if (!doc) throw httpError(404, 'Record not found');
  return doc;
}

/** Public shape of a comment. `author` is populated ({ _id, name, role }) or null. */
function present(c, user, roles) {
  const a = c.author && typeof c.author === 'object' && c.author.name !== undefined ? c.author : null;
  const authorId = String(a?._id ?? c.author ?? '');
  return {
    _id: String(c._id),
    body: c.body,
    author: a ? { _id: String(a._id), name: a.name, role: a.role } : { _id: authorId || null, name: 'Deleted user', role: null },
    createdAt: c.createdAt,
    canDelete: !!user && (authorId === String(user.userId) || isSuperuser(user.role, roles)),
  };
}

/**
 * Comments of a record, oldest first.
 * @throws {Error} 404 when the record does not exist
 */
export async function list(resource, id, user) {
  await loadRecord(resource, id);
  const { config } = getContext();
  const rows = await Comment.find({ resource: resource.key, recordId: id })
    .sort({ createdAt: 1, _id: 1 })
    .populate({ path: 'author', select: 'name role' })
    .lean();
  return rows.map((c) => present(c, user, config.roles));
}

/** Notifies the record's creator and every User-ref on it, except the comment's author. Never throws. */
async function notifyParticipants(resource, record, comment, user, text) {
  try {
    const { def, key } = resource;
    const userRefs = Object.entries(def.fields).filter(([, s]) => s.type === 'ref' && s.ref === 'User').map(([n]) => n);
    const ids = new Set([record.createdBy, ...userRefs.map((f) => record[f])]
      .filter((v) => v && mongoose.isValidObjectId(v)).map(String));
    ids.delete(String(user.userId));
    if (!ids.size) return;
    const singular = def.label.replace(/s$/, '');
    await notify({
      userIds: [...ids],
      title: `${user.name ?? 'Someone'} commented on ${singular} "${await titleFor(resource, record)}"`,
      body: text.slice(0, 300),
      link: `/r/${key}/${record._id}`,
      kind: 'info',
      dedupeKey: `comment:${key}:${record._id}:${comment._id}`,
    });
  } catch (err) {
    console.error('notifyParticipants failed:', err.message);
  }
}

/**
 * Adds a comment, writes an activity entry and notifies the people involved.
 * @throws {Error} 404 unknown record, 400 invalid body
 */
export async function add(resource, id, body, user) {
  const record = await loadRecord(resource, id);
  const text = cleanBody(body);
  const created = await withTransaction(async (session) => {
    const [doc] = await Comment.create([{ resource: resource.key, recordId: id, author: user.userId, body: text }], { session });
    await activity.record(
      { actor: user, resource: resource.key, recordId: id, action: 'comment', diff: { comment: [null, 'added'] } },
      session
    );
    return doc.toObject();
  });
  await notifyParticipants(resource, record, created, user, text);
  const { config } = getContext();
  return present({ ...created, author: { _id: user.userId, name: user.name ?? null, role: user.role } }, user, config.roles);
}

/**
 * Deletes a comment. Only its author or the superuser may.
 * @throws {Error} 404 unknown record/comment, 403 anyone else
 */
export async function remove(resource, id, commentId, user) {
  await loadRecord(resource, id);
  if (typeof commentId !== 'string' || !OBJECT_ID_RE.test(commentId)) throw httpError(404, 'Comment not found');
  const comment = await Comment.findOne({ _id: commentId, resource: resource.key, recordId: id }).lean();
  if (!comment) throw httpError(404, 'Comment not found');
  const { config } = getContext();
  if (String(comment.author) !== String(user.userId) && !isSuperuser(user.role, config.roles)) {
    throw httpError(403, 'Only the author or an administrator can delete a comment');
  }
  await Comment.deleteOne({ _id: commentId });
}
