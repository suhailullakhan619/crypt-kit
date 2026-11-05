import mongoose from 'mongoose';

const ReportSchema = new mongoose.Schema({
  title:       { type: String, required: true, maxlength: 120 },
  resource:    { type: String, required: true, index: true },
  filters:     { type: mongoose.Schema.Types.Mixed, default: {} },
  count:       { type: Number, required: true, min: 0 },
  fileName:    { type: String, required: true },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  generatedAt: { type: Date, default: Date.now, index: true },
});

const Report = mongoose.models.Report || mongoose.model('Report', ReportSchema);

export default Report;
