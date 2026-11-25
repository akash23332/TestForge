/**
 * Centralized, difficulty-aware timeout configurations for TestForge AI features.
 * Prevents premature frontend socket aborts for medium and hard questions.
 */

export const AI_TIMEOUTS = Object.freeze({
  MCQ: Object.freeze({
    Easy: 25000,
    Medium: 45000,
    Hard: 60000
  }),
  CODING_QUESTION: Object.freeze({
    Easy: 45000,
    Medium: 70000,
    Hard: 90000
  }),
  REGENERATE_SECTION: 60000,
  TEST_CASES: 75000,
  EXPLANATION: 35000,
  HINTS: 35000,
  IMPROVE_QUESTION: 45000,
  DEFAULT: 60000
});

/**
 * Returns the recommended Axios request timeout for an AI generation task.
 * @param {Object} [params]
 * @param {'CODING_QUESTION'|'MCQ'|'REGENERATE_SECTION'|'TEST_CASES'|'EXPLANATION'|'HINTS'|'IMPROVE_QUESTION'} [params.task]
 * @param {'Easy'|'Medium'|'Hard'} [params.difficulty]
 * @returns {number} Timeout in milliseconds
 */
export const getAiTimeout = ({ task = 'CODING_QUESTION', difficulty = 'Medium' } = {}) => {
  const normDifficulty =
    difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)
      ? difficulty
      : 'Medium';

  const t = String(task || '').toUpperCase();

  if (t === 'CODING_QUESTION' || t === 'CODING' || t === 'QUESTION') {
    return AI_TIMEOUTS.CODING_QUESTION[normDifficulty] || AI_TIMEOUTS.CODING_QUESTION.Medium;
  }
  if (t === 'MCQ' || t === 'GENERATE_MCQ') {
    return AI_TIMEOUTS.MCQ[normDifficulty] || AI_TIMEOUTS.MCQ.Medium;
  }
  if (t === 'REGENERATE_SECTION' || t === 'REGENERATE') {
    return AI_TIMEOUTS.REGENERATE_SECTION;
  }
  if (t === 'TEST_CASES' || t === 'TESTCASE' || t === 'TESTCASES') {
    return AI_TIMEOUTS.TEST_CASES;
  }
  if (t === 'EXPLANATION') {
    return AI_TIMEOUTS.EXPLANATION;
  }
  if (t === 'HINTS') {
    return AI_TIMEOUTS.HINTS;
  }
  if (t === 'IMPROVE_QUESTION' || t === 'IMPROVE') {
    return AI_TIMEOUTS.IMPROVE_QUESTION;
  }

  return AI_TIMEOUTS.DEFAULT;
};

export default {
  AI_TIMEOUTS,
  getAiTimeout
};
