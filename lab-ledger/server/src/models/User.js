import mongoose from 'mongoose';
import config from '../../crypt.config.js';

const UserSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true, maxlength: 120 },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role:         { type: String, enum: config.roles, required: true },
  active:       { type: Boolean, default: true },
  // Self sign-up: the account stays inactive until a superuser approves it.
  pendingApproval: { type: Boolean, default: false },
  // Password reset: only a SHA-256 hash of the emailed token is stored, never the token itself.
  resetTokenHash:    { type: String, select: false },
  resetTokenExpires: { type: Date, select: false },
  createdAt:    { type: Date, default: Date.now },
});

/** Public JSON shape — never includes passwordHash. */
UserSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    active: this.active,
    pendingApproval: !!this.pendingApproval,
    createdAt: this.createdAt,
  };
};

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default User;
