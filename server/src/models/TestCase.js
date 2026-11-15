import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true
    },
    input: {
      type: String,
      required: [true, 'Test case input is required']
    },
    expectedOutput: {
      type: String,
      required: [true, 'Expected output is required']
    },
    category: {
      type: String,
      enum: ['sample', 'normal', 'edge_case', 'boundary', 'performance', 'stress', 'standard'],
      default: 'standard'
    },
    source: {
      type: String,
      enum: ['manual', 'ai_generated', 'mutation_derived'],
      default: 'manual'
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'unverified', 'failed', 'error', 'timeout', 'invalid_test'],
      default: 'unverified'
    },
    visibility: {
      type: String,
      enum: ['public', 'hidden'],
      default: 'public',
      index: true
    },
    computedOutput: {
      type: String,
      default: null
    },
    lastError: {
      type: String,
      default: null
    },
    sourceReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MutationReport',
      default: null
    },
    sourceCandidateId: {
      type: String,
      default: null
    },
    inputHash: {
      type: String,
      default: null,
      index: false
    }
  },
  {
    timestamps: true
  }
);

testCaseSchema.index({ questionId: 1, visibility: 1 });

// Phase 4A.2: Partial unique index strictly guaranteeing that a single candidate test
// from a specific mutation report cannot be adopted more than once into the same Question.
// Ordinary test cases (manual, sample, AI-generated) have sourceReportId: null and
// are completely excluded by the partialFilterExpression, preventing false-positive collisions.
testCaseSchema.index(
  {
    questionId: 1,
    sourceReportId: 1,
    sourceCandidateId: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      sourceReportId: { $type: 'objectId' },
      sourceCandidateId: { $type: 'string' }
    },
    name: 'uniq_question_adopted_candidate'
  }
);

// Concurrency-safe unique constraint on questionId + inputHash for deduplication.
// Legacy/ordinary test cases without inputHash are excluded by partialFilterExpression.
testCaseSchema.index(
  {
    questionId: 1,
    inputHash: 1
  },
  {
    unique: true,
    partialFilterExpression: {
      inputHash: { $type: 'string' }
    },
    name: 'uniq_question_test_input'
  }
);

export const TestCase = mongoose.model('TestCase', testCaseSchema);
export default TestCase;
