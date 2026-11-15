/**
 * Duplicate Detector Service
 * Computes semantic similarity between a newly generated coding question and
 * previously generated questions in the teacher's session.
 * 
 * Evaluates:
 * - Title & function name similarity
 * - Problem statement content & n-gram overlap (removing standard boilerplate/stop words)
 * - Core algorithmic archetype / pattern classification
 * - Input/Output signature structure
 * - Sample test case input/output equivalence
 * 
 * Strictly preserves domain diversity: Questions covering the same topic & difficulty
 * with genuinely distinct algorithms (e.g. Two Sum vs Max Subarray) are ACCEPTED.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from',
  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'to', 'in', 'out', 'on', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'given',
  'return', 'write', 'function', 'program', 'code', 'problem', 'algorithm', 'input',
  'output', 'integer', 'integers', 'array', 'arrays', 'string', 'strings', 'list', 'lists',
  'element', 'elements', 'representing', 'consisting', 'determine', 'calculate', 'find'
]);

/**
 * Normalizes text into a clean set of meaningful semantic tokens.
 * @param {string} text
 * @returns {string[]}
 */
export const tokenizeSemantic = (text = '') => {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
};

/**
 * Generates character or word n-grams for phrase-level similarity.
 * @param {string[]} tokens
 * @param {number} [n=2]
 * @returns {Set<string>}
 */
export const getNGrams = (tokens, n = 2) => {
  const ngrams = new Set();
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
};

/**
 * Computes Jaccard similarity between two token sets.
 * @param {Set|Array} a
 * @param {Set|Array} b
 * @returns {number} Value in [0, 1]
 */
export const jaccardSimilarity = (a, b) => {
  const setA = a instanceof Set ? a : new Set(a);
  const setB = b instanceof Set ? b : new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

/**
 * Classifies a question into algorithmic archetypes based on keywords,
 * problem mechanics, and solution indicators.
 * @param {Object} question
 * @returns {Set<string>}
 */
export const extractAlgorithmicArchetypes = (question = {}) => {
  const combinedText = [
    question.title || '',
    question.statement || '',
    question.functionName || '',
    (question.tags || []).join(' '),
    question.referenceSolution || ''
  ].join(' ').toLowerCase();

  const archetypes = new Set();

  if (/\b(palindrome|palindromic|symmetric|reverse|two pointer|two-pointer)\b/i.test(combinedText)) {
    archetypes.add('PALINDROME_SYMMETRY_TWO_POINTER');
  }
  if (/\b(duplicate|duplicates|frequency|count|distinct|unique|anagram|anagrams|hash map|hashmap|hash table|hash)\b/i.test(combinedText)) {
    archetypes.add('FREQUENCY_DUPLICATE_HASH');
  }
  if (/\b(two sum|target sum|pair with sum|three sum|3sum|indices.*sum|find pair)\b/i.test(combinedText)) {
    archetypes.add('TARGET_SUM_PAIR');
  }
  if (/\b(prefix sum|running sum|cumulative|gain|altitude|subarray sum)\b/i.test(combinedText)) {
    archetypes.add('PREFIX_SUM_ACCUMULATOR');
  }
  if (/\b(sliding window|longest substring|minimum window|max.*window)\b/i.test(combinedText)) {
    archetypes.add('SLIDING_WINDOW');
  }
  if (/\b(binary search|sorted array|search.*in.*sorted|log n|lower bound|upper bound)\b/i.test(combinedText)) {
    archetypes.add('BINARY_SEARCH');
  }
  if (/\b(merge intervals|overlapping intervals|insert interval|interval)\b/i.test(combinedText)) {
    archetypes.add('INTERVALS');
  }
  if (/\b(stack|parentheses|brackets|valid.*parentheses|monotone|monotonic)\b/i.test(combinedText)) {
    archetypes.add('STACK_PARENTHESES');
  }
  if (/\b(rotate|shift|cyclic|reverse in place)\b/i.test(combinedText)) {
    archetypes.add('ROTATION_SHIFT');
  }
  if (/\b(maximum subarray|kadane|largest sum subarray)\b/i.test(combinedText)) {
    archetypes.add('MAX_SUBARRAY_KADANE');
  }

  return archetypes;
};

/**
 * Normalizes input/output strings for structural equivalence comparison.
 * @param {string} str
 * @returns {string}
 */
const normalizeIO = (str = '') => {
  return String(str || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^[a-z_]\w*=/i, ''); // Strip leading variable assignment (e.g. nums=)
};

/**
 * Computes multi-factor similarity between candidate question and a reference question.
 * @param {Object} candidate - Newly generated question
 * @param {Object} reference - Previously generated question
 * @returns {{ score: number, isDuplicate: boolean, reason: string|null, factors: Object }}
 */
export const computeQuestionSimilarity = (candidate = {}, reference = {}) => {
  if (!candidate || !reference) {
    return { score: 0, isDuplicate: false, reason: null, factors: {} };
  }

  // 1. Title Similarity
  const candTitle = (candidate.title || '').trim().toLowerCase();
  const refTitle = (reference.title || '').trim().toLowerCase();
  const isExactTitle = candTitle.length > 0 && candTitle === refTitle;

  const candTitleTokens = tokenizeSemantic(candTitle);
  const refTitleTokens = tokenizeSemantic(refTitle);
  const titleJaccard = jaccardSimilarity(candTitleTokens, refTitleTokens);

  // 2. Function Name Similarity
  const candFn = (candidate.functionName || '').trim().toLowerCase();
  const refFn = (reference.functionName || '').trim().toLowerCase();
  const isSameFunctionName = candFn.length > 0 && candFn !== 'solution' && candFn === refFn;

  // 3. Statement Semantic & Bigram Overlap
  const candTokens = tokenizeSemantic(candidate.statement || '');
  const refTokens = tokenizeSemantic(reference.statement || '');
  const statementTokenJaccard = jaccardSimilarity(candTokens, refTokens);

  const candBigrams = getNGrams(candTokens, 2);
  const refBigrams = getNGrams(refTokens, 2);
  const statementBigramJaccard = jaccardSimilarity(candBigrams, refBigrams);

  // 4. Algorithmic Archetype Intersection
  const candArchetypes = extractAlgorithmicArchetypes(candidate);
  const refArchetypes = extractAlgorithmicArchetypes(reference);
  const archetypeJaccard = jaccardSimilarity(candArchetypes, refArchetypes);
  const sharedArchetype = Array.from(candArchetypes).find((a) => refArchetypes.has(a)) || null;

  // 5. Sample Test Case Input/Output Equivalence
  const candSampleIn = normalizeIO(candidate.sampleTestCase?.input || candidate.examples?.[0]?.input);
  const refSampleIn = normalizeIO(reference.sampleTestCase?.input || reference.examples?.[0]?.input);
  const candSampleOut = normalizeIO(candidate.sampleTestCase?.expectedOutput || candidate.examples?.[0]?.output);
  const refSampleOut = normalizeIO(reference.sampleTestCase?.expectedOutput || reference.examples?.[0]?.output);

  const isExactSampleMatch =
    candSampleIn.length > 0 &&
    candSampleIn === refSampleIn &&
    candSampleOut.length > 0 &&
    candSampleOut === refSampleOut;

  // 6. Signature Return Type & Parameter Match
  const candRet = (candidate.returnType || candidate.functionSignature?.returnType || '').toLowerCase();
  const refRet = (reference.returnType || reference.functionSignature?.returnType || '').toLowerCase();
  const isSameReturnType = candRet.length > 0 && candRet === refRet;

  // Composite Weighted Score Calculation
  let compositeScore = (
    titleJaccard * 0.25 +
    statementTokenJaccard * 0.30 +
    statementBigramJaccard * 0.20 +
    archetypeJaccard * 0.25
  );

  // Boost for exact function name + shared archetype
  if (isSameFunctionName && sharedArchetype) {
    compositeScore = Math.max(compositeScore, 0.78);
  }

  // Boost for exact sample test match + shared archetype
  if (isExactSampleMatch && sharedArchetype) {
    compositeScore = Math.max(compositeScore, 0.82);
  }

  // Exact title match is an automatic duplicate
  if (isExactTitle) {
    compositeScore = 1.0;
  }

  // Paraphrased duplicate detection: high statement overlap even if title or variable names changed
  if (statementTokenJaccard >= 0.65 || statementBigramJaccard >= 0.55) {
    compositeScore = Math.max(compositeScore, 0.75);
  }

  // Determine duplicate threshold (0.65 threshold indicates substantial semantic collision)
  const isDuplicate = compositeScore >= 0.65;

  let reason = null;
  if (isDuplicate) {
    if (isExactTitle) {
      reason = `Identical problem title "${reference.title}".`;
    } else if (isSameFunctionName && sharedArchetype) {
      reason = `Same function name "${candidate.functionName}" and shared algorithmic pattern (${sharedArchetype}).`;
    } else if (isExactSampleMatch && sharedArchetype) {
      reason = `Identical sample testcase inputs/outputs and shared algorithmic pattern (${sharedArchetype}).`;
    } else if (statementBigramJaccard >= 0.50 || statementTokenJaccard >= 0.60) {
      reason = `Problem statement is a close paraphrase of "${reference.title}" (${Math.round(statementTokenJaccard * 100)}% token overlap).`;
    } else if (sharedArchetype && isSameReturnType) {
      reason = `Shared algorithmic pattern (${sharedArchetype}) with identical return type and high structural overlap with "${reference.title}".`;
    } else {
      reason = `High semantic similarity (${Math.round(compositeScore * 100)}%) with previous question "${reference.title}".`;
    }
  }

  return {
    score: Math.round(compositeScore * 100) / 100,
    isDuplicate,
    reason,
    factors: {
      isExactTitle,
      titleJaccard: Math.round(titleJaccard * 100) / 100,
      isSameFunctionName,
      statementTokenJaccard: Math.round(statementTokenJaccard * 100) / 100,
      statementBigramJaccard: Math.round(statementBigramJaccard * 100) / 100,
      sharedArchetype,
      isExactSampleMatch,
      isSameReturnType
    }
  };
};

/**
 * Checks a candidate question against a list of recent session questions.
 * @param {Object} candidate - Candidate question object
 * @param {Array<Object>} recentQuestions - Up to 5 previously generated questions
 * @param {number} [threshold=0.65]
 * @returns {{ isDuplicate: boolean, matchedQuestion: Object|null, score: number, reason: string|null }}
 */
export const checkDuplicateAgainstHistory = (candidate, recentQuestions = [], threshold = 0.65) => {
  if (!candidate || !Array.isArray(recentQuestions) || recentQuestions.length === 0) {
    return {
      isDuplicate: false,
      matchedQuestion: null,
      score: 0,
      reason: null
    };
  }

  let highestScore = 0;
  let topMatch = null;
  let topReason = null;

  for (const refQ of recentQuestions) {
    if (!refQ || typeof refQ !== 'object') continue;
    const similarity = computeQuestionSimilarity(candidate, refQ);
    if (similarity.score > highestScore) {
      highestScore = similarity.score;
      if (similarity.score >= threshold) {
        topMatch = refQ;
        topReason = similarity.reason;
      }
    }
  }

  return {
    isDuplicate: highestScore >= threshold,
    matchedQuestion: topMatch,
    score: highestScore,
    reason: topReason
  };
};

export default {
  tokenizeSemantic,
  jaccardSimilarity,
  extractAlgorithmicArchetypes,
  computeQuestionSimilarity,
  checkDuplicateAgainstHistory
};
