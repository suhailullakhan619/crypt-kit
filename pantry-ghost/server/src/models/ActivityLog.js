import mongoose from 'mongoose';

/**
 * Append-only audit trail (Req 6). No route updates or deletes entries.
 * `actor` is a User ObjectId, or the string 'system' for jobs.
 */
const ActivityLogSchema = new mongoose.Schema({
  actor:     { type: mongoose.Schema.Types.Mixed, required: true },
  actorName: { type: String },
  resource:  { type: String, required: true },
  recordId:  { type: mongoose.Schema.Types.ObjectId, required: true },
  action:    { type: String, enum: ['create', 'update', 'delete', 'status'], required: true },
  diff:      { type: mongoose.Schema.Types.Mixed, default: {} },
  at:        { type: Date, default: Date.now, index: true },
});

ActivityLogSchema.index({ resource: 1, recordId: 1, at: -1 });

const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', ActivityLogSchema);

export default ActivityLog;
