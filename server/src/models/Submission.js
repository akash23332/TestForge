import mongoose from 'mongoose';

const submissionResultSchema = new mongoose.Schema(
  {
    testCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCase'
    },
    category: {
      type: String,
      default: 'standard'
    },
    visibility: {
      type: String,
      enum: ['public', 'hidden'],
      default: 'public'
    },
    passed: {
      type: Boolean,
      required: true
    },
    status: {
      type: String,
      default: 'passed'
    },
    runtimeMs: {
      type: Number,
      default: 0
    },
    error: {
      type: String,
      default: null
    }
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamAttempt',
      required: true,
      index: true
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true
    },
    code: {
      type: String,
      required: true
    },
    language: {
      type: String,
      required: true
    },
    testResults: [submissionResultSchema],
    totalTests: {
      type: Number,
      default: 0
    },
    passedTests: {
      type: Number,
      default: 0
    },
    scoreAwarded: {
      type: Number,
      default: 0
    },
    maxMarks: {
      type: Number,
      default: 10
    },
    verdict: {
      type: String,
      enum: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'COMPILATION_ERROR', 'RUNTIME_ERROR'],
      default: 'WRONG_ANSWER'
    }
  },
  {
    timestamps: true
  }
);

submissionSchema.index({ attemptId: 1, questionId: 1, createdAt: -1 });

export const Submission = mongoose.model('Submission', submissionSchema);
export default Submission;
