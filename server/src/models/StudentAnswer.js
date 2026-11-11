import mongoose from 'mongoose';

const studentAnswerSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamAttempt',
      required: true,
      index: true
    },
    questionId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    questionType: {
      type: String,
      enum: ['coding', 'mcq', 'subjective'],
      default: 'coding'
    },
    // For coding questions
    code: {
      type: String,
      default: ''
    },
    language: {
      type: String,
      enum: ['javascript', 'python', 'java', 'cpp'],
      default: 'javascript'
    },
    // For MCQ questions
    selectedOption: {
      type: String,
      enum: ['A', 'B', 'C', 'D', ''],
      default: ''
    },
    // For Subjective questions (Teacher manual grading)
    subjectiveAnswer: {
      type: String,
      default: ''
    },
    manualGradingStatus: {
      type: String,
      enum: ['PENDING', 'GRADED'],
      default: 'PENDING'
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    gradedAt: {
      type: Date,
      default: null
    },
    teacherFeedback: {
      type: String,
      default: ''
    },
    gradingVersion: {
      type: Number,
      default: 0,
      index: true
    },
    gradingHistory: [
      {
        score: { type: Number, required: true },
        gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        gradedAt: { type: Date, default: Date.now },
        feedback: { type: String, default: '' },
        regradeReason: { type: String, default: '' },
        previousScore: { type: Number, default: null },
        gradingVersion: { type: Number, default: 1 }
      }
    ],
    isMarkedForReview: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['UNATTEMPTED', 'SAVED', 'SUBMITTED'],
      default: 'UNATTEMPTED'
    },
    score: {
      type: Number,
      default: 0
    },
    maxMarks: {
      type: Number,
      default: 10
    },
    testCasesPassed: {
      type: Number,
      default: 0
    },
    totalTestCases: {
      type: Number,
      default: 0
    },
    lastSavedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

studentAnswerSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

export const StudentAnswer = mongoose.model('StudentAnswer', studentAnswerSchema);
export default StudentAnswer;
