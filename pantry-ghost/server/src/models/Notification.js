import mongoose from 'mongoose';

/**
 * In-app notification for one user. `dedupeKey` makes repeated job runs idempotent: the same
 * event never notifies the same user twice (unique per user + key).
 */
const NotificationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind:      { type: String, enum: ['info', 'warning', 'danger'], default: 'info' },
  title:     { type: String, required: true, maxlength: 200 },
  body:      { type: String, maxlength: 500, default: '' },
  link:      { type: String, maxlength: 300, default: '' },
  dedupeKey: { type: String, maxlength: 200 },
  readAt:    { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

NotificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
NotificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

export default Notification;
