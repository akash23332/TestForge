import mongoose from 'mongoose';
import crypto from 'crypto';

const optionItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const mcqQuestionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    statement: {
      type: String,
      trim: true
    },
    question: {
      type: String,
      trim: true
    },
    // Dynamic option list (2 to 8 options)
    options: {
      type: [optionItemSchema],
      default: []
    },
    // Array of correct option IDs (supports single and multiple choice)
    correctAnswers: {
      type: [String],
      default: []
    },
    answerType: {
      type: String,
      enum: ['single', 'multiple'],
      default: 'single'
    },
    subject: {
      type: String,
      default: 'General',
      trim: true,
      index: true
    },
    topic: {
      type: String,
      default: 'General',
      trim: true,
      index: true
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      default: 'Medium',
      index: true
    },
    style: {
      type: String,
      enum: ['conceptual', 'factual', 'application_based'],
      default: 'conceptual'
    },
    bloomTaxonomy: {
      type: String,
      enum: ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate'],
      default: 'Understand'
    },
    marks: {
      type: Number,
      default: 1,
      min: 1
    },
    explanation: {
      type: String,
      default: '',
      trim: true
    },
    tags: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published',
      index: true
    },
    isAiGenerated: {
      type: Boolean,
      default: false
    },
    statementHash: {
      type: String,
      default: null,
      index: true
    },

    // Legacy backwards-compatibility fields (Required for Paper Designer, CSV Import & Student Attempt Engine)
    optionA: { type: String, default: '', trim: true },
    optionB: { type: String, default: '', trim: true },
    optionC: { type: String, default: '', trim: true },
    optionD: { type: String, default: '', trim: true },
    correctAnswer: { type: String, default: 'A', trim: true, uppercase: true }
  },
  {
    timestamps: true
  }
);

// Pre-validate synchronization hook: Ensures statement and question are always populated
mcqQuestionSchema.pre('validate', function (next) {
  if (this.statement && !this.question) {
    this.question = this.statement;
  }
  if (this.question && !this.statement) {
    this.statement = this.question;
  }
  if (!this.question && !this.statement) {
    this.invalidate('question', 'Question statement is required');
  }
  next();
});

// Pre-save synchronization hook: Guarantees 100% two-way backwards compatibility
mcqQuestionSchema.pre('save', function (next) {
  // 1. Compute persistent statement hash for duplicate detection
  const normalizedText = String(this.question || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  this.statementHash = crypto.createHash('sha256').update(normalizedText).digest('hex');

  // 2. Modern -> Legacy sync
  if (Array.isArray(this.options) && this.options.length > 0) {
    this.optionA = this.options[0]?.text || '';
    this.optionB = this.options[1]?.text || '';
    this.optionC = this.options[2]?.text || '';
    this.optionD = this.options[3]?.text || '';

    if (Array.isArray(this.correctAnswers) && this.correctAnswers.length > 0) {
      this.correctAnswer = String(this.correctAnswers[0]).toUpperCase();
    }
  } else if (this.optionA || this.optionB || this.optionC || this.optionD) {
    // 3. Legacy -> Modern sync
    this.options = [
      { id: 'A', text: this.optionA || '' },
      { id: 'B', text: this.optionB || '' },
      { id: 'C', text: this.optionC || '' },
      { id: 'D', text: this.optionD || '' }
    ].filter((o) => o.text.trim().length > 0);

    if (this.correctAnswer) {
      this.correctAnswers = [this.correctAnswer.toUpperCase()];
      this.answerType = 'single';
    }
  }

  // Ensure correctAnswers is non-empty if correctAnswer is set
  if ((!this.correctAnswers || this.correctAnswers.length === 0) && this.correctAnswer) {
    this.correctAnswers = [this.correctAnswer.toUpperCase()];
  }

  next();
});

// Indexes for high performance querying & deduplication
mcqQuestionSchema.index({ ownerId: 1, createdAt: -1 });
mcqQuestionSchema.index({ ownerId: 1, topic: 1 });
mcqQuestionSchema.index({ ownerId: 1, statementHash: 1 });
mcqQuestionSchema.index({ ownerId: 1, status: 1 });
mcqQuestionSchema.index({ ownerId: 1, subject: 1 });

export const McqQuestion = mongoose.model('McqQuestion', mcqQuestionSchema);
export default McqQuestion;
