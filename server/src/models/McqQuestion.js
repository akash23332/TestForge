import mongoose from 'mongoose';

const mcqQuestionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    question: {
      type: String,
      required: [true, 'Question statement is required'],
      trim: true
    },
    optionA: {
      type: String,
      required: [true, 'Option A is required'],
      trim: true
    },
    optionB: {
      type: String,
      required: [true, 'Option B is required'],
      trim: true
    },
    optionC: {
      type: String,
      required: [true, 'Option C is required'],
      trim: true
    },
    optionD: {
      type: String,
      required: [true, 'Option D is required'],
      trim: true
    },
    correctAnswer: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: [true, 'Correct answer must be one of A, B, C, or D'],
      uppercase: true
    },
    marks: {
      type: Number,
      default: 1,
      min: 1
    },
    topic: {
      type: String,
      default: 'General',
      trim: true,
      index: true
    },
    explanation: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

mcqQuestionSchema.index({ ownerId: 1, createdAt: -1 });
mcqQuestionSchema.index({ ownerId: 1, topic: 1 });

export const McqQuestion = mongoose.model('McqQuestion', mcqQuestionSchema);
export default McqQuestion;
