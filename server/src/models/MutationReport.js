import mongoose from 'mongoose';
import crypto from 'crypto';

const mutantAuditEntrySchema = new mongoose.Schema(
  {
    auditId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    previousClassification: {
      type: String,
      enum: ['SURVIVED', 'EQUIVALENT'],
      required: true
    },
    newClassification: {
      type: String,
      enum: ['SURVIVED', 'EQUIVALENT'],
      required: true
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 1000
    }
  },
  { _id: false }
);

const mutantTestCaseResultSchema = new mongoose.Schema(
  {
    testCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCase',
      default: null
    },
    testCaseNumber: {
      type: Number,
      required: true
    },
    input: {
      type: String,
      default: '',
      maxlength: 10000
    },
    expectedOutput: {
      type: String,
      default: '',
      maxlength: 10000
    },
    actualOutput: {
      type: String,
      default: null,
      maxlength: 10000
    },
    status: {
      type: String,
      enum: ['PASSED', 'FAILED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'EXECUTION_ERROR', 'TIMEOUT'],
      required: true
    },
    runtimeMs: {
      type: Number,
      default: 0
    },
    errorMessage: {
      type: String,
      default: null,
      maxlength: 5000
    },
    killedMutant: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const mutantResultSchema = new mongoose.Schema(
  {
    mutantId: {
      type: String,
      required: true
    },
    operator: {
      type: String,
      required: true
    },
    operatorType: {
      type: String,
      enum: ['AOR', 'ROR', 'LOR', 'COR', 'RVR', 'OTHER'],
      default: 'OTHER'
    },
    originalSnippet: {
      type: String,
      default: '',
      maxlength: 20000
    },
    mutatedSnippet: {
      type: String,
      default: '',
      maxlength: 20000
    },
    mutatedFullCode: {
      type: String,
      default: '',
      maxlength: 100000
    },
    validationStatus: {
      type: String,
      enum: ['VALID', 'INVALID'],
      default: 'VALID'
    },
    executionStatus: {
      type: String,
      enum: ['PENDING', 'KILLED', 'SURVIVED', 'EQUIVALENT', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT'],
      default: 'PENDING'
    },
    baselineExecutionStatus: {
      type: String,
      enum: ['PENDING', 'KILLED', 'SURVIVED', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT', 'UNKNOWN_LEGACY'],
      default: function () {
        const validStatuses = ['PENDING', 'KILLED', 'SURVIVED', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT'];
        const fallback = (this.baselineExecutionStatus && validStatuses.includes(this.baselineExecutionStatus))
          ? this.baselineExecutionStatus
          : this.executionStatus;
        if (fallback && validStatuses.includes(fallback)) {
          return fallback;
        }
        return 'UNKNOWN_LEGACY';
      }
    },
    currentClassification: {
      type: String,
      enum: ['PENDING', 'KILLED', 'SURVIVED', 'EQUIVALENT', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT', 'UNKNOWN_LEGACY'],
      default: function () {
        if (this.equivalent === true) return 'EQUIVALENT';
        const validStatuses = ['PENDING', 'KILLED', 'SURVIVED', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT'];
        const fallback = (this.baselineExecutionStatus && validStatuses.includes(this.baselineExecutionStatus))
          ? this.baselineExecutionStatus
          : this.executionStatus;
        if (fallback && validStatuses.includes(fallback)) {
          return fallback;
        }
        return 'UNKNOWN_LEGACY';
      }
    },
    auditHistory: {
      type: [mutantAuditEntrySchema],
      default: []
    },
    failureReason: {
      type: String,
      default: null,
      maxlength: 10000
    },
    equivalent: {
      type: Boolean,
      default: false
    },
    killedByTest: {
      type: String,
      default: null,
      maxlength: 1000
    },
    testInput: {
      type: String,
      default: null,
      maxlength: 20000
    },
    expectedOutput: {
      type: String,
      default: null,
      maxlength: 20000
    },
    mutantOutput: {
      type: String,
      default: null,
      maxlength: 20000
    },
    runtimeMs: {
      type: Number,
      default: 0
    },
    testCaseResults: {
      type: [mutantTestCaseResultSchema],
      default: []
    }
  },
  { _id: false }
);

const candidateTestSchema = new mongoose.Schema(
  {
    candidateId: {
      type: String,
      default: () => crypto.randomUUID()
    },
    mutantId: {
      type: String,
      default: null
    },
    input: {
      type: String,
      required: true,
      maxlength: 20000
    },
    expectedOutput: {
      type: String,
      required: true,
      maxlength: 20000
    },
    reason: {
      type: String,
      default: '',
      maxlength: 5000
    },
    verified: {
      type: Boolean,
      default: true
    },
    adoptionStatus: {
      type: String,
      enum: ['PENDING', 'ADOPTED', 'REJECTED'],
      default: 'PENDING'
    },
    adoptionOperationId: {
      type: String,
      default: null
    },
    adoptedTestCaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCase',
      default: null
    },
    adoptedAt: {
      type: Date,
      default: null
    },
    adoptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    rejectionReason: {
      type: String,
      default: null,
      maxlength: 5000
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { _id: false }
);

// Lifecycle Consistency Validator:
// When adoptionStatus is 'ADOPTED', the candidate test MUST have valid adoptedTestCaseId,
// adoptedAt timestamp, adoptedBy faculty reference, and adoptionOperationId.
candidateTestSchema.pre('validate', function (next) {
  if (this.adoptionStatus === 'ADOPTED') {
    if (!this.adoptedTestCaseId) {
      this.invalidate('adoptedTestCaseId', 'adoptedTestCaseId is required when candidate adoptionStatus is ADOPTED');
    }
    if (!this.adoptedAt) {
      this.invalidate('adoptedAt', 'adoptedAt is required when candidate adoptionStatus is ADOPTED');
    }
    if (!this.adoptedBy) {
      this.invalidate('adoptedBy', 'adoptedBy is required when candidate adoptionStatus is ADOPTED');
    }
    if (!this.adoptionOperationId || String(this.adoptionOperationId).trim() === '') {
      this.invalidate('adoptionOperationId', 'adoptionOperationId is required when candidate adoptionStatus is ADOPTED');
    }
  }
  next();
});

const mutationReportSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'],
      default: 'PENDING'
    },
    // Distributed atomic lock: set to questionId for PENDING/RUNNING runs, null for COMPLETED/FAILED.
    // Sparse unique index guarantees that only ONE active mutation run can exist per question.
    activeLock: {
      type: String,
      default: null
    },
    mutationScore: {
      type: Number,
      default: null
    },
    totalMutants: {
      type: Number,
      default: 0
    },
    killedCount: {
      type: Number,
      default: 0
    },
    survivedCount: {
      type: Number,
      default: 0
    },
    equivalentCount: {
      type: Number,
      default: 0
    },
    compilationErrorCount: {
      type: Number,
      default: 0
    },
    runtimeErrorCount: {
      type: Number,
      default: 0
    },
    timeoutCount: {
      type: Number,
      default: 0
    },
    progress: {
      total: {
        type: Number,
        default: 0
      },
      completed: {
        type: Number,
        default: 0
      },
      currentMutant: {
        type: Number,
        default: 0
      },
      currentTestCase: {
        type: Number,
        default: 0
      }
    },
    mutants: {
      type: [mutantResultSchema],
      default: []
    },
    candidateTests: {
      type: [candidateTestSchema],
      default: []
    },
    executionFingerprint: {
      type: String,
      default: null
    },
    errorMessage: {
      type: String,
      default: null,
      maxlength: 10000
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for optimal querying and administrative audits
mutationReportSchema.index({ questionId: 1, createdAt: -1 });
mutationReportSchema.index({ teacherId: 1, createdAt: -1 });
mutationReportSchema.index({ status: 1, createdAt: 1 });

// ATOMIC CONCURRENCY GUARD: Unique index on activeLock matching only string values (active locks).
// When activeLock is null or omitted (completed/failed), it is completely excluded from the index.
mutationReportSchema.index(
  { activeLock: 1 },
  {
    unique: true,
    partialFilterExpression: { activeLock: { $type: 'string' } }
  }
);

export const MutationReport = mongoose.model('MutationReport', mutationReportSchema);
export default MutationReport;
