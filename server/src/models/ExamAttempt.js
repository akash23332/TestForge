import mongoose from 'mongoose';
import crypto from 'crypto';

const examAttemptSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    candidateInfo: {
      name: {
        type: String,
        required: [true, 'Candidate name is required'],
        trim: true,
        maxlength: 100
      },
      email: {
        type: String,
        required: [true, 'Candidate email is required'],
        lowercase: true,
        trim: true
      },
      rollNumber: {
        type: String,
        default: '',
        trim: true
      }
    },
    sessionToken: {
      type: String,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(32).toString('hex')
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    submittedAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT', 'DISQUALIFIED'],
      default: 'IN_PROGRESS',
      index: true
    },
    totalScore: {
      type: Number,
      default: 0
    },
    maxScore: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    tabSwitchCount: {
      type: Number,
      default: 0
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

examAttemptSchema.index({ examId: 1, 'candidateInfo.email': 1 });

export const ExamAttempt = mongoose.model('ExamAttempt', examAttemptSchema);
export default ExamAttempt;
