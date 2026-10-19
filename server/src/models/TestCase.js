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
    }
  },
  {
    timestamps: true
  }
);

testCaseSchema.index({ questionId: 1, visibility: 1 });

export const TestCase = mongoose.model('TestCase', testCaseSchema);
export default TestCase;
