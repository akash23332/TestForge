import mongoose from 'mongoose';

const examQuestionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['coding', 'mcq', 'subjective'],
      default: 'coding'
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null
    },
    mcqQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'McqQuestion',
      default: null
    },
    mcqData: {
      question: { type: String, default: '' },
      optionA: { type: String, default: '' },
      optionB: { type: String, default: '' },
      optionC: { type: String, default: '' },
      optionD: { type: String, default: '' },
      correctAnswer: { type: String, default: 'A' },
      explanation: { type: String, default: '' },
      topic: { type: String, default: 'General' },
      difficulty: { type: String, default: 'Medium' }
    },
    subjectiveData: {
      question: { type: String, default: '' },
      rubric: { type: String, default: '' },
      maxWords: { type: Number, default: 500 }
    },
    marks: {
      type: Number,
      default: 10,
      min: 1
    },
    order: {
      type: Number,
      default: 0
    }
  },
  { _id: true }
);

const examSectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Section 1'
    },
    description: {
      type: String,
      default: ''
    },
    questions: [examQuestionSchema]
  },
  { _id: true }
);

const examSchema = new mongoose.Schema(
  {
    examCode: {
      type: String,
      required: [true, 'Exam code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Exam title is required'],
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      default: ''
    },
    instructions: {
      type: [String],
      default: [
        'Read each question statement carefully before submitting.',
        'In coding challenges, verify your solution against sample test cases using "Quick Test".',
        'In MCQ sections, select the single most accurate option.',
        'Do not navigate away from the exam tab; tab switches and window blurs are logged.',
        'Your answers are continuously autosaved. Click "Submit Exam" once all questions are attempted.'
      ]
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sections: {
      type: [examSectionSchema],
      default: []
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 60,
      min: [5, 'Duration must be at least 5 minutes'],
      max: [300, 'Duration cannot exceed 300 minutes']
    },
    schedule: {
      startTime: {
        type: Date,
        default: null
      },
      endTime: {
        type: Date,
        default: null
      }
    },
    accessMode: {
      type: String,
      enum: ['PUBLIC_CODE', 'INVITED_STUDENTS', 'HYBRID'],
      default: 'PUBLIC_CODE'
    },
    settings: {
      allowRunCode: {
        type: Boolean,
        default: true
      },
      showSampleTestResults: {
        type: Boolean,
        default: true
      },
      autoSubmitOnTimeUp: {
        type: Boolean,
        default: true
      },
      showResultsImmediately: {
        type: Boolean,
        default: true
      },
      shuffleQuestions: {
        type: Boolean,
        default: false
      }
    },
    proctoringSettings: {
      detectTabSwitch: {
        type: Boolean,
        default: true
      },
      maxTabSwitchesAllowed: {
        type: Number,
        default: 5
      },
      enforceFullscreen: {
        type: Boolean,
        default: false
      }
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'ARCHIVED'],
      default: 'LIVE',
      index: true
    },
    totalMarks: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Calculate total marks before saving
examSchema.pre('save', function (next) {
  let marks = 0;
  if (this.sections && this.sections.length > 0) {
    for (const sec of this.sections) {
      if (sec.questions && sec.questions.length > 0) {
        for (const q of sec.questions) {
          marks += (q.marks || 10);
        }
      }
    }
  }
  this.totalMarks = marks;
  next();
});

export const Exam = mongoose.model('Exam', examSchema);
export default Exam;
