import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamAttempt',
      required: true,
      index: true
    },
    eventType: {
      type: String,
      enum: ['TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_ENTER', 'FULLSCREEN_EXIT', 'RECONNECTED', 'COPY_PASTE', 'HEARTBEAT'],
      required: true,
      index: true
    },
    details: {
      type: String,
      default: ''
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

activityLogSchema.index({ attemptId: 1, timestamp: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export default ActivityLog;
