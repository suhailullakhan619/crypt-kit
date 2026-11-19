import mongoose from 'mongoose';

/**
 * A comment on any resource record. `resource` is the resource key, `recordId` the record's _id.
 */
const CommentSchema = new mongoose.Schema(
  {
    resource: { type: String, required: true },
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    author:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body:     { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);
CommentSchema.index({ resource: 1, recordId: 1, createdAt: 1 });

const Comment = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);
export default Comment;
