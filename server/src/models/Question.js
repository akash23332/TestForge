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
    constraints: {
      type: String,
      default: ''
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
    referenceSolution: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft'
    }
  },
  {
    timestamps: true
  }
);

// Compound index for owner listings sorted by update date (Section 8)
questionSchema.index({ ownerId: 1, updatedAt: -1 });

export const Question = mongoose.model('Question', questionSchema);
export default Question;
