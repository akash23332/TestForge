import mongoose from 'mongoose';

/**
 * Append-Only Immutable Grading Audit Log Collection.
 * Complies with strict educational assessment auditing and integrity standards.
 * Records are strictly append-only; updates and deletions are forbidden.
 */
const gradingAuditLogSchema = new mongoose.Schema(
  {
    answerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentAnswer',
      required: true,
      index: true
    },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamAttempt',
      required: true,
      index: true
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true
    },
    questionId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true
    },
    graderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    graderRole: {
      type: String,
      enum: ['teacher', 'admin'],
      default: 'teacher'
    },
    previousScore: {
      type: Number,
      default: null
    },
    newScore: {
      type: Number,
      required: true
    },
    scoreDelta: {
      type: Number,
      default: 0
    },
    authoritativeMaxMarks: {
      type: Number,
      required: true
    },
    feedback: {
      type: String,
      default: ''
    },
    regradeReason: {
      type: String,
      default: null
    },
    isRegrade: {
      type: Boolean,
      default: false
    },
    gradingVersion: {
      type: Number,
      required: true
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false } // Immutable: no updatedAt
  }
);

gradingAuditLogSchema.index({ attemptId: 1, questionId: 1, createdAt: -1 });
gradingAuditLogSchema.index({ examId: 1, createdAt: -1 });

// Strict Append-Only Immutability Hooks: Block all update and delete mutations
const preventAuditMutation = function (next) {
  const err = new Error('[GradingAuditLog] Mutating or deleting audit records is strictly forbidden by compliance policy.');
  err.name = 'SecurityError';
  if (typeof next === 'function') return next(err);
  throw err;
};

gradingAuditLogSchema.pre('updateOne', preventAuditMutation);
gradingAuditLogSchema.pre('updateMany', preventAuditMutation);
gradingAuditLogSchema.pre('findOneAndUpdate', preventAuditMutation);
gradingAuditLogSchema.pre('replaceOne', preventAuditMutation);
gradingAuditLogSchema.pre('deleteOne', preventAuditMutation);
gradingAuditLogSchema.pre('deleteMany', preventAuditMutation);
gradingAuditLogSchema.pre('findOneAndDelete', preventAuditMutation);
gradingAuditLogSchema.pre('findOneAndRemove', preventAuditMutation);

export const GradingAuditLog = mongoose.model('GradingAuditLog', gradingAuditLogSchema);
export default GradingAuditLog;
