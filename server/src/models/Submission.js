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
      enum: ['SAMPLE', 'SUBMISSION', 'CUSTOM_INPUT'],
      default: 'SUBMISSION',
      index: true
    },
    customInput: {
      type: String,
      default: null
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
    recoveryOwner: {
      type: String,
      default: null,
      index: true
    },
    recoveryStartedAt: {
      type: Date,
      default: null
    },
    recoveryLeaseExpiresAt: {
      type: Date,
      default: null,
      index: true
    },
    recoveryAttempts: {
      type: Number,
      default: 0
    },
    recoveryFailureReason: {
      type: String,
      default: null
    },
    // Distributed Multi-Instance Idempotency Key & Retention Lifecycle
    idempotencyKey: {
      type: String,
      default: null
    },
    idempotencyExpiresAt: {
      type: Date,
      default: null,
      index: true
    },
    // Worker execution exclusivity & distributed lease
    executionOwner: {
      type: String,
      default: null,
      index: true
    },
    executionVersion: {
      type: Number,
      default: 0,
      index: true
    },
    executionStartedAt: {
      type: Date,
      default: null
    },
    executionLeaseExpiresAt: {
      type: Date,
      default: null,
      index: true
    },
    // Remote Runner Lifecycle & Distributed Reconciliation
    remoteExecution: {
      token: {
        type: String,
        default: null,
        index: true
      },
      state: {
        type: String,
        enum: [
          'NOT_CREATED',
          'REQUESTING',
          'CREATED',
          'QUEUED',
          'PROCESSING',
          'COMPLETED',
          'CANCELLATION_REQUESTED',
          'CANCELLED',
          'CANCELLATION_UNCONFIRMED',
          'EXECUTION_UNAVAILABLE',
          'NOT_FOUND'
        ],
        default: 'NOT_CREATED',
        index: true
      },
      provider: {
        type: String,
        default: null
      },
      fencingToken: {
        type: String,
        default: null
      },
      requestedAt: {
        type: Date,
        default: null
      },
      completedAt: {
        type: Date,
        default: null
      },
      lastCheckedAt: {
        type: Date,
        default: null
      },
      cancellationRequestedAt: {
        type: Date,
        default: null
      },
      cancellationStatus: {
        type: String,
        default: null
      },
      lastObservedAt: {
        type: Date,
        default: null
      },
      lastObservedState: {
        type: String,
        default: null
      },
      confirmedTerminalAt: {
        type: Date,
        default: null
      },
      quarantineUntil: {
        type: Date,
        default: null,
        index: true
      }
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

// Distributed idempotency: ensures exactly ONE active in-flight execution per idempotencyKey across all server instances
submissionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export const Submission = mongoose.model('Submission', submissionSchema);
export default Submission;
