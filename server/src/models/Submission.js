import mongoose from 'mongoose';

const submissionResultSchema = new mongoose.Schema(
  {
    testIndex: {
      type: Number
    },
    testCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCase',
      default: null
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
    },
    input: {
      type: String,
      default: null
    },
    expectedOutput: {
      type: String,
      default: null
    },
    actualOutput: {
      type: String,
      default: null
    },
    isHidden: {
      type: Boolean,
      default: false
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
    runType: {
      type: String,
      enum: ['SAMPLE', 'SUBMISSION'],
      default: 'SUBMISSION',
      index: true
    },
    status: {
      type: String,
      enum: [
        'QUEUED',
        'RUNNING',
        'COMPLETED',
        'COMPILE_ERROR',
        'RUNTIME_ERROR',
        'TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED',
        'OUTPUT_LIMIT_EXCEEDED',
        'INTERNAL_ERROR',
        'EXECUTION_UNAVAILABLE',
        'RECOVERING'
      ],
      default: 'QUEUED',
      index: true
    },
    jobId: {
      type: String,
      default: null,
      index: true
    },
    errorMessage: {
      type: String,
      default: null
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
      default: null
    },
    maxMarks: {
      type: Number,
      default: 10
    },
    verdict: {
      type: String,
      enum: [
        'PENDING',
        'ACCEPTED',
        'PARTIALLY_ACCEPTED',
        'WRONG_ANSWER',
        'TIME_LIMIT_EXCEEDED',
        'COMPILATION_ERROR',
        'RUNTIME_ERROR',
        'MEMORY_LIMIT_EXCEEDED',
        'INTERNAL_ERROR',
        'EXECUTION_UNAVAILABLE',
        'RECOVERING'
      ],
      default: 'PENDING'
    }
  },
  {
    timestamps: true
  }
);

submissionSchema.index({ attemptId: 1, questionId: 1, createdAt: -1 });

export const Submission = mongoose.model('Submission', submissionSchema);
export default Submission;
