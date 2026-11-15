import { ApiError } from '../../utils/apiError.js';

export const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const VALID_EXECUTION_MODES = ['FUNCTION', 'STDIN'];
export const VALID_DATA_STRUCTURES = ['NONE', 'ARRAY', 'STRING', 'LINKED_LIST', 'BINARY_TREE'];
export const SUPPORTED_LANGUAGES = ['python', 'javascript', 'java', 'cpp'];

export const normalizeSampleInput = (input) => {
  if (typeof input !== 'string') return input;
  let str = input.replace(/\r\n/g, '\n').trim();

  // 1. Unwrap if the ENTIRE string was a valid JSON-encoded string literal
  if (str.startsWith('"') && str.endsWith('"')) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'string') {
        str = parsed.replace(/\r\n/g, '\n').trim();
      }
    } catch (_) {}
  }

  // 2. Process each line individually
  return str
    .split('\n')
    .map((line) => {
      let l = line.trim();
      // Strip leading parameter labels (e.g. "l1 = 2 4 3" -> "2 4 3")
      l = l.replace(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*/, '').trim();

      // Unwrap quotes or escaped quotes around the line
      while (
        (l.startsWith('"') && l.endsWith('"')) ||
        (l.startsWith("'") && l.endsWith("'")) ||
        (l.startsWith('\\"') && l.endsWith('\\"'))
      ) {
        if (l.startsWith('\\"') && l.endsWith('\\"')) {
          l = l.slice(2, -2).trim();
        } else {
          l = l.slice(1, -1).trim();
        }
      }

      // Strip any stray outer quotes or backslashes that would break token parsers
      l = l.replace(/^["'\\]+|["'\\]+$/g, '').trim();

      return l;
    })
    .join('\n')
    .trim();
};

/**
 * Validates and normalizes Gemini-generated question output.
 * Ensures strict application schema compliance, structural integrity, and semantic consistency.
 * 
 * @param {Object} rawQuestion
 * @param {Object} [options]
 * @returns {Object} Validated and normalized question payload
 */
export const validateGeneratedQuestion = (rawQuestion, options = {}) => {
  if (!rawQuestion || typeof rawQuestion !== 'object') {
    throw ApiError.badRequest('Invalid AI output: Expected a question object.', {
      code: 'AI_OUTPUT_NOT_OBJECT'
    });
  }

  const errors = [];

  // 1. Title validation
  const title = String(rawQuestion.title || '').trim();
  if (!title) {
    errors.push('Question title is missing.');
  }

  // 2. Statement validation
  const statement = String(rawQuestion.statement || '').trim();
  if (!statement) {
    errors.push('Problem statement is missing.');
  }

  // 3. Difficulty normalization
  let difficulty = 'Medium';
  if (rawQuestion.difficulty) {
    const matchedDiff = VALID_DIFFICULTIES.find(
      (d) => d.toLowerCase() === String(rawQuestion.difficulty).trim().toLowerCase()
    );
    if (matchedDiff) {
      difficulty = matchedDiff;
    } else {
      errors.push(`Invalid difficulty: "${rawQuestion.difficulty}". Expected Easy, Medium, or Hard.`);
    }
  }

  // 4. Execution Mode validation
  let executionMode = (options.executionMode || rawQuestion.executionMode || 'FUNCTION').toUpperCase();
  if (!VALID_EXECUTION_MODES.includes(executionMode)) {
    executionMode = 'FUNCTION';
  }

  // 5. Data Structure validation
  let dataStructure = (rawQuestion.dataStructure || 'ARRAY').toUpperCase();
  if (!VALID_DATA_STRUCTURES.includes(dataStructure)) {
    dataStructure = 'NONE';
  }

  // 6. Language normalization
  const language = (options.language || rawQuestion.language || 'python').toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    errors.push(`Unsupported language "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  // 7. Function Signature & Function Name validation
  let functionName = String(rawQuestion.functionName || '').trim();
  if (executionMode === 'FUNCTION' && !functionName) {
    functionName = 'solution';
  }

  let functionSignature = rawQuestion.functionSignature;
  if (!functionSignature || typeof functionSignature !== 'object') {
    functionSignature = {
      parameters: [{ name: 'input', type: 'any' }],
      returnType: 'any'
    };
  }

  // 8. Sample Test Case verification (Strictly ONE public sample test case on Page 1)
  let sample = rawQuestion.sampleTestCase;
  if (!sample && Array.isArray(rawQuestion.examples) && rawQuestion.examples.length > 0) {
    const firstEx = rawQuestion.examples[0];
    sample = {
      input: firstEx.input,
      expectedOutput: firstEx.output ?? firstEx.expectedOutput,
      explanation: firstEx.explanation
    };
  }

  if (!sample || typeof sample !== 'object') {
    errors.push('Sample test case object is required.');
  } else {
    if (sample.input === undefined || sample.input === null || String(sample.input).trim() === '') {
      errors.push('Sample test case input is required and cannot be empty.');
    } else {
      sample.input = normalizeSampleInput(String(sample.input));
    }
    if (sample.expectedOutput === undefined || sample.expectedOutput === null || String(sample.expectedOutput).trim() === '') {
      errors.push('Sample test case expectedOutput is required and cannot be empty.');
    } else {
      sample.expectedOutput = String(sample.expectedOutput).trim();
    }
  }

  // Page 1 Scope Gate: Strictly block additional hidden test cases
  if (Array.isArray(rawQuestion.hiddenTestCases) && rawQuestion.hiddenTestCases.length > 0) {
    // Safely drop or warn without failing
    delete rawQuestion.hiddenTestCases;
  }

  // 9. Examples normalization
  let examples = [];
  if (Array.isArray(rawQuestion.examples) && rawQuestion.examples.length > 0) {
    examples = rawQuestion.examples
      .filter((ex) => ex && (ex.input !== undefined || ex.output !== undefined))
      .map((ex) => ({
        input: normalizeSampleInput(String(ex.input ?? '')),
        output: String(ex.output ?? '').trim(),
        explanation: String(ex.explanation ?? '').trim()
      }));
  }
  if (examples.length === 0 && sample) {
    examples.push({
      input: normalizeSampleInput(String(sample.input)),
      output: String(sample.expectedOutput).trim(),
      explanation: String(sample.explanation || '').trim()
    });
  }

  // 10. Code & Solution validation
  const starterCode = String(rawQuestion.starterCode || '').trim();
  if (!starterCode) {
    errors.push('Starter code is required.');
  }

  const referenceSolution = String(rawQuestion.referenceSolution || '').trim();
  if (!referenceSolution) {
    errors.push('Reference solution is required.');
  }

  // Semantic consistency check: FUNCTION mode must declare the functionName in reference solution
  if (executionMode === 'FUNCTION' && functionName && referenceSolution) {
    const fnRegex = new RegExp(`\\b${functionName}\\b`);
    if (!fnRegex.test(referenceSolution)) {
      errors.push(
        `Semantic mismatch: Reference solution does not define target function or method "${functionName}".`
      );
    }
  }

  // Normalize multi-language maps
  const starterCodes = {};
  if (rawQuestion.starterCodes && typeof rawQuestion.starterCodes === 'object') {
    for (const [k, v] of Object.entries(rawQuestion.starterCodes)) {
      if (v) starterCodes[k.toLowerCase()] = String(v).trim();
    }
  }
  if (!starterCodes[language] && starterCode) {
    starterCodes[language] = starterCode;
  }

  const referenceSolutions = {};
  if (rawQuestion.referenceSolutions && typeof rawQuestion.referenceSolutions === 'object') {
    for (const [k, v] of Object.entries(rawQuestion.referenceSolutions)) {
      if (v) referenceSolutions[k.toLowerCase()] = String(v).trim();
    }
  }
  if (!referenceSolutions[language] && referenceSolution) {
    referenceSolutions[language] = referenceSolution;
  }

  // Topic tags
  let tags = ['Algorithms'];
  if (Array.isArray(rawQuestion.tags) && rawQuestion.tags.length > 0) {
    tags = rawQuestion.tags.map((t) => String(t).trim()).filter(Boolean);
  }

  if (errors.length > 0) {
    throw ApiError.badRequest(`AI question output validation failed: ${errors.join('; ')}`, {
      code: 'AI_VALIDATION_FAILED',
      validationErrors: errors
    });
  }

  return {
    title,
    statement,
    difficulty,
    tags,
    constraints: String(rawQuestion.constraints || 'Time Limit: 2.0s\nMemory Limit: 256MB').trim(),
    inputFormat: String(rawQuestion.inputFormat || '').trim(),
    outputFormat: String(rawQuestion.outputFormat || '').trim(),
    executionMode,
    dataStructure,
    functionName,
    functionSignature,
    examples,
    sampleTestCase: {
      input: String(sample.input).trim(),
      expectedOutput: String(sample.expectedOutput).trim(),
      explanation: String(sample.explanation || '').trim()
    },
    language,
    starterCode,
    starterCodes,
    referenceSolution,
    referenceSolutions
  };
};

/**
 * Validates a newly regenerated reference solution.
 * Ensures the solution is non-empty, defines target function in FUNCTION mode,
 * and maintains language constraints.
 */
export const validateRegeneratedSolution = (rawSolution, currentQuestion = {}) => {
  if (!rawSolution || typeof rawSolution !== 'object') {
    throw ApiError.badRequest('Invalid AI solution output: Expected an object with referenceSolution.', {
      code: 'AI_SOLUTION_NOT_OBJECT'
    });
  }

  const solution = String(rawSolution.referenceSolution || rawSolution.solution || '').trim();
  if (!solution) {
    throw ApiError.badRequest('Regenerated reference solution is empty.', {
      code: 'AI_EMPTY_SOLUTION'
    });
  }

  const executionMode = (currentQuestion.executionMode || 'FUNCTION').toUpperCase();
  const functionName = currentQuestion.functionName || '';
  if (executionMode === 'FUNCTION' && functionName) {
    const fnRegex = new RegExp(`\\b${functionName}\\b`);
    if (!fnRegex.test(solution)) {
      throw ApiError.badRequest(
        `Regenerated solution does not implement target function "${functionName}".`,
        { code: 'AI_SOLUTION_FUNCTION_MISMATCH' }
      );
    }
  }

  return {
    referenceSolution: solution,
    approach: String(rawSolution.approach || '').trim()
  };
};

/**
 * Validates regenerated starter code template.
 * Ensures the starter template is non-empty, preserves function signature,
 * and does NOT accidentally expose the complete reference solution.
 */
export const validateRegeneratedStarterCode = (rawStarter, currentQuestion = {}) => {
  if (!rawStarter || typeof rawStarter !== 'object') {
    throw ApiError.badRequest('Invalid AI starter code output: Expected an object with starterCode.', {
      code: 'AI_STARTER_NOT_OBJECT'
    });
  }

  const starter = String(rawStarter.starterCode || rawStarter.code || '').trim();
  if (!starter) {
    throw ApiError.badRequest('Regenerated starter code is empty.', {
      code: 'AI_EMPTY_STARTER'
    });
  }

  const executionMode = (currentQuestion.executionMode || 'FUNCTION').toUpperCase();
  const functionName = currentQuestion.functionName || '';
  if (executionMode === 'FUNCTION' && functionName) {
    const fnRegex = new RegExp(`\\b${functionName}\\b`);
    if (!fnRegex.test(starter)) {
      throw ApiError.badRequest(
        `Regenerated starter code does not declare target function "${functionName}".`,
        { code: 'AI_STARTER_FUNCTION_MISMATCH' }
      );
    }
  }

  // Security check: ensure starter code does NOT accidentally expose reference solution
  const refSol = String(currentQuestion.referenceSolution || '').trim();
  if (refSol && starter === refSol) {
    throw ApiError.badRequest(
      'Security violation: Starter code is identical to reference solution and exposes solution logic.',
      { code: 'AI_STARTER_EXPOSES_SOLUTION' }
    );
  }

  return {
    starterCode: starter
  };
};

export default {
  validateGeneratedQuestion,
  validateRegeneratedSolution,
  validateRegeneratedStarterCode,
  VALID_DIFFICULTIES,
  VALID_EXECUTION_MODES,
  VALID_DATA_STRUCTURES,
  SUPPORTED_LANGUAGES
};
