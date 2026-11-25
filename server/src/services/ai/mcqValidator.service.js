import crypto from 'crypto';
import mongoose from 'mongoose';
import { McqQuestion } from '../../models/McqQuestion.js';
import { ApiError } from '../../utils/apiError.js';

export const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const VALID_STYLES = ['conceptual', 'factual', 'application_based'];
export const VALID_ANSWER_TYPES = ['single', 'multiple'];
export const VALID_BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate'];

/**
 * Computes deterministic SHA-256 hash of a normalized statement string.
 */
export const computeStatementHash = (statement = '') => {
  const norm = String(statement || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(norm).digest('hex');
};

export const computeMcqStatementHash = computeStatementHash;

/**
 * Validates a single MCQ candidate or manual MCQ document.
 * 
 * @param {Object} rawQuestion
 * @param {Object} [options]
 * @returns {Object} Validated and normalized MCQ object
 */
export const validateMcqCandidate = (rawQuestion, options = {}) => {
  if (!rawQuestion || typeof rawQuestion !== 'object') {
    if (options.throwOnError) {
      throw ApiError.badRequest('MCQ payload must be a non-empty object.');
    }
    return {
      isValid: false,
      errors: ['MCQ payload must be a non-empty object.'],
      data: null
    };
  }

  const errors = [];

  // 1. Statement Validation
  const statement = String(rawQuestion.statement || rawQuestion.question || '').trim();
  if (!statement || statement.length < 10) {
    errors.push('Question statement is required and must contain at least 10 characters.');
  }

  // 2. Options Extraction & Normalization
  let optionsList = [];
  if (Array.isArray(rawQuestion.options) && rawQuestion.options.length > 0) {
    optionsList = rawQuestion.options.map((opt, idx) => {
      const defaultId = String.fromCharCode(65 + idx); // 'A', 'B', 'C', 'D'
      return {
        id: String(opt.id || defaultId).trim().toUpperCase(),
        text: String(opt.text ?? opt.value ?? '').trim()
      };
    });
  } else if (rawQuestion.optionA || rawQuestion.optionB || rawQuestion.optionC || rawQuestion.optionD) {
    // Legacy option fields
    const legacy = [
      { id: 'A', text: String(rawQuestion.optionA || '').trim() },
      { id: 'B', text: String(rawQuestion.optionB || '').trim() },
      { id: 'C', text: String(rawQuestion.optionC || '').trim() },
      { id: 'D', text: String(rawQuestion.optionD || '').trim() }
    ].filter(o => o.text.length > 0);
    optionsList = legacy;
  }

  if (optionsList.length < 2 || optionsList.length > 8) {
    errors.push(`Question must contain between 2 and 8 answer options (received ${optionsList.length}).`);
  }

  // 3. Check for empty option texts
  const emptyOptions = optionsList.filter(o => !o.text);
  if (emptyOptions.length > 0) {
    errors.push('All answer options must contain non-empty text.');
  }

  // 4. Check for duplicate option text
  const seenOptionTexts = new Set();
  for (const opt of optionsList) {
    const norm = opt.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenOptionTexts.has(norm)) {
      errors.push(`Duplicate option detected: "${opt.text}". All option choices must be distinct.`);
      break;
    }
    seenOptionTexts.add(norm);
  }

  // 5. Answer Type
  const expectedAnswerType = options.answerType || rawQuestion.answerType || 'single';
  const answerType = VALID_ANSWER_TYPES.includes(expectedAnswerType) ? expectedAnswerType : 'single';

  // 6. Correct Answers Normalization & Validation
  let correctAnswers = [];
  if (Array.isArray(rawQuestion.correctAnswers) && rawQuestion.correctAnswers.length > 0) {
    correctAnswers = rawQuestion.correctAnswers
      .map(a => String(a).trim().toUpperCase())
      .filter(Boolean);
  } else if (rawQuestion.correctAnswer) {
    correctAnswers = [String(rawQuestion.correctAnswer).trim().toUpperCase()];
  }

  // De-duplicate correct answers
  correctAnswers = [...new Set(correctAnswers)];

  if (correctAnswers.length === 0) {
    errors.push('At least one correct answer must be specified.');
  }

  // Verify every correct answer ID references an existing option ID
  const validOptionIds = new Set(optionsList.map(o => o.id));
  for (const ansId of correctAnswers) {
    if (!validOptionIds.has(ansId)) {
      errors.push(`Correct answer "${ansId}" does not match any valid option ID (${[...validOptionIds].join(', ')}).`);
    }
  }

  // Single-correct vs multiple-correct consistency
  if (answerType === 'single') {
    if (correctAnswers.length > 1) {
      errors.push(`Single-choice question must have exactly 1 correct answer (received ${correctAnswers.length}).`);
    }
  } else if (answerType === 'multiple') {
    if (correctAnswers.length < 1) {
      errors.push('Multiple-choice question requires at least 1 correct answer.');
    }
    // Note: Multiple-correct questions are allowed to have all options correct if intended.
  }

  // 7. Explanation Validation
  const explanation = String(rawQuestion.explanation || '').trim();
  if (!explanation) {
    errors.push('A pedagogical explanation is required for learning and review feedback.');
  }

  // 8. Metadata Normalization
  const difficulty = VALID_DIFFICULTIES.includes(rawQuestion.difficulty)
    ? rawQuestion.difficulty
    : (options.difficulty && VALID_DIFFICULTIES.includes(options.difficulty) ? options.difficulty : 'Medium');

  const rawStyle = String(rawQuestion.style || options.style || 'conceptual').toLowerCase().replace('-', '_');
  const style = VALID_STYLES.includes(rawStyle) ? rawStyle : 'conceptual';

  const rawBloom = rawQuestion.bloomTaxonomy || rawQuestion.bloomLevel || options.bloomTaxonomy || options.bloomLevel;
  const bloomTaxonomy = VALID_BLOOM_LEVELS.includes(rawBloom)
    ? rawBloom
    : 'Understand';

  const subject = String(rawQuestion.subject || options.subject || 'Computer Science').trim();
  const topic = String(rawQuestion.topic || options.topic || 'General').trim();
  const tags = Array.isArray(rawQuestion.tags) ? rawQuestion.tags.map(t => String(t).trim()).filter(Boolean) : [topic];
  const marks = Math.max(1, Number(rawQuestion.marks) || 1);

  if (errors.length > 0) {
    if (options.throwOnError) {
      throw ApiError.badRequest(`MCQ validation failed: ${errors.join('; ')}`, { errors });
    }
    return {
      isValid: false,
      errors,
      data: null
    };
  }

  const statementHash = computeStatementHash(statement);

  const data = {
    candidateId: rawQuestion.candidateId || null,
    statement,
    question: statement, // Dual-property for backward compatibility
    options: optionsList,
    correctAnswers,
    correctAnswer: correctAnswers[0] || 'A',
    answerType,
    subject,
    topic,
    difficulty,
    style,
    bloomTaxonomy,
    bloomLevel: bloomTaxonomy,
    marks,
    explanation,
    tags,
    statementHash,
    status: rawQuestion.status || 'published',
    isAiGenerated: Boolean(rawQuestion.isAiGenerated ?? true)
  };

  return {
    isValid: true,
    errors: [],
    data
  };
};

/**
 * Checks a batch of candidate MCQs against the teacher's persistent database to filter duplicates.
 * 
 * @param {Array<Object>} candidates
 * @param {string|ObjectId} ownerId
 * @returns {Promise<Object>} { nonDuplicates, duplicateCount, existingHashes }
 */
export const filterPersistentDuplicates = async (candidates = [], ownerId) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { nonDuplicates: [], duplicateCount: 0, existingHashes: new Set() };
  }

  const candidateHashes = candidates.map(c => c.statementHash || computeStatementHash(c.statement));

  // Query database for existing questions authored by this owner with matching statementHash
  const query = { statementHash: { $in: candidateHashes } };
  if (ownerId) {
    query.ownerId = ownerId;
  }

  let existingInDb = [];
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    existingInDb = await McqQuestion.find(query).select('statementHash question').lean();
  }
  const existingHashSet = new Set(existingInDb.map(d => d.statementHash));

  const nonDuplicates = [];
  const batchSeenHashes = new Set();
  let duplicateCount = 0;

  for (const cand of candidates) {
    const hash = cand.statementHash || computeStatementHash(cand.statement);
    if (existingHashSet.has(hash) || batchSeenHashes.has(hash)) {
      duplicateCount++;
      continue;
    }
    batchSeenHashes.add(hash);
    nonDuplicates.push(cand);
  }

  return {
    nonDuplicates,
    duplicateCount,
    existingHashes: existingHashSet
  };
};

export default {
  computeStatementHash,
  validateMcqCandidate,
  filterPersistentDuplicates
};
