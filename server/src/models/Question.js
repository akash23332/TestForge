import mongoose from 'mongoose';

const exampleSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
    explanation: { type: String, default: '' }
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Question title is required'],
      trim: true,
      maxlength: 200
    },
    statement: {
      type: String,
      required: [true, 'Problem statement is required']
    },
    inputFormat: {
      type: String,
      default: ''
    },
    outputFormat: {
      type: String,
      default: ''
    },
    constraints: {
      type: String,
      default: ''
    },
    executionMode: {
      type: String,
      enum: ['FUNCTION', 'STDIN'],
      default: 'STDIN',
      index: true
    },
    dataStructure: {
      type: String,
      enum: ['NONE', 'ARRAY', 'STRING', 'LINKED_LIST', 'BINARY_TREE'],
      default: 'ARRAY',
      index: true
    },
    functionName: {
      type: String,
      default: 'solution',
      trim: true
    },
    functionSignature: {
      parameters: {
        type: [
          {
            name: { type: String, default: '' },
            type: { type: String, default: 'any' }
          }
        ],
        default: []
      },
      returnType: {
        type: String,
        default: 'void'
      }
    },
    supportedLanguages: {
      type: [String],
      enum: ['javascript', 'python', 'java', 'cpp'],
      default: ['javascript', 'python', 'java', 'cpp']
    },
    language: {
      type: String,
      enum: ['javascript', 'python', 'java', 'cpp'],
      default: 'javascript'
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      default: 'Medium'
    },
    tags: {
      type: [String],
      default: []
    },
    examples: {
      type: [exampleSchema],
      default: []
    },
    starterCode: {
      type: String,
      default: ''
    },
    starterCodes: {
      type: Map,
      of: String,
      default: {}
    },
    referenceSolution: {
      type: String,
      default: ''
    },
    referenceSolutions: {
      type: Map,
      of: String,
      default: {}
    },
    status: {
      type: String,
      enum: [
        'draft',
        'published',
        'archived',
        'DRAFT',
        'VALIDATING',
        'READY_TO_PUBLISH',
        'PUBLISHED',
        'VALIDATION_FAILED',
        'VALIDATION_UNAVAILABLE'
      ],
      default: 'DRAFT'
    },
    validationSummary: {
      referenceSolutionStatus: {
        type: String,
        enum: ['PASS', 'FAIL', 'PENDING'],
        default: 'PENDING'
      },
      testCaseValidity: {
        type: String,
        enum: ['VALID', 'INVALID', 'PENDING'],
        default: 'PENDING'
      },
      expectedOutputStatus: {
        type: String,
        enum: ['VERIFIED', 'UNVERIFIED', 'MISMATCH', 'PENDING'],
        default: 'PENDING'
      },
      testQualityStatus: {
        type: String,
        enum: ['ADEQUATE', 'NEEDS_IMPROVEMENT', 'PENDING'],
        default: 'PENDING'
      },
      publishingStatus: {
        type: String,
        enum: [
          'READY',
          'NOT_READY',
          'READY_TO_PUBLISH',
          'PUBLISHED',
          'VALIDATION_FAILED',
          'VALIDATION_UNAVAILABLE'
        ],
        default: 'NOT_READY'
      },
      lastValidatedAt: {
        type: Date,
        default: null
      }
    }
  },
  {
    timestamps: true
  }
);

// Compound index for owner listings sorted by update date (Section 8)
questionSchema.index({ ownerId: 1, updatedAt: -1 });

export const QUESTION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  VALIDATING: 'VALIDATING',
  READY_TO_PUBLISH: 'READY_TO_PUBLISH',
  PUBLISHED: 'PUBLISHED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_UNAVAILABLE: 'VALIDATION_UNAVAILABLE'
});

export const Question = mongoose.model('Question', questionSchema);
export default Question;
