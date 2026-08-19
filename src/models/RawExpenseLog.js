const mongoose = require('mongoose');

const rawExpenseLogSchema = new mongoose.Schema(
  {
    groupId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    rawInput: { type: String, required: true },
    parsedOutput: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

module.exports = mongoose.models.RawExpenseLog || mongoose.model('RawExpenseLog', rawExpenseLogSchema);
