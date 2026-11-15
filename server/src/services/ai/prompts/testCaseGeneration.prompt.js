/**
 * Prompts and JSON Schema definitions for AI Test Case Generation using Google Gemini.
 */

export const TEST_CASE_GENERATION_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    testCases: {
      type: 'ARRAY',
      description: 'List of diverse, constraint-compliant candidate test cases.',
      items: {
        type: 'OBJECT',
        properties: {
          input: {
            type: 'STRING',
            description: 'Formatted input matching question execution mode (Function parameters or STDIN lines).'
          },
          category: {
            type: 'STRING',
            enum: ['normal', 'edge_case', 'boundary', 'performance', 'stress'],
            description: 'The testing classification for this test case.'
          },
          explanation: {
            type: 'STRING',
            description: 'Concise explanation of the scenario tested (e.g. empty collection, max boundary, duplicates).'
          }
        },
        required: ['input', 'category', 'explanation']
      }
    }
  },
  required: ['testCases']
};

/**
 * Builds the comprehensive prompt for generating high-quality, diverse test cases.
 *
 * @param {Object} options
 * @param {Object} options.question
 * @param {number} [options.count=5]
 * @param {string} [options.category='all']
 * @param {string} [options.instructions='']
 * @param {Array<string>} [options.existingInputs=[]]
 * @returns {string} Prompt string
 */
export const buildTestCaseGenerationPrompt = ({
  question = {},
  count = 5,
  category = 'all',
  instructions = '',
  existingInputs = []
}) => {
  const {
    title = 'Untitled Problem',
    statement = '',
    constraints = '',
    inputFormat = '',
    outputFormat = '',
    language = 'python',
    executionMode = 'FUNCTION',
    functionName = 'solution',
    functionSignature = {},
    referenceSolution = ''
  } = question;

  const boundedCount = Math.max(1, Math.min(10, Number(count) || 5));

  const paramStr = Array.isArray(functionSignature?.parameters) && functionSignature.parameters.length > 0
    ? functionSignature.parameters.map((p) => `${p.name}: ${p.type}`).join(', ')
    : 'None';
  const returnType = functionSignature?.returnType || 'void';

  const categoryInstruction = category && category !== 'all'
    ? `FOCUS CATEGORY: All generated test cases must strictly belong to the '${category}' category.`
    : `DIVERSITY REQUIREMENT: Distribute the generated cases across 'normal', 'edge_case', 'boundary', and 'performance/stress' categories.`;

  const existingInputsSection = existingInputs.length > 0
    ? `\nEXISTING TEST CASE INPUTS (DO NOT DUPLICATE ANY OF THESE):\n${existingInputs.slice(0, 30).map((inp, idx) => `Existing #${idx + 1}: ${inp}`).join('\n')}\n`
    : '';

  const teacherInstructions = instructions && String(instructions).trim()
    ? `\nTEACHER SPECIFIC INSTRUCTIONS:\n${instructions.trim()}\n`
    : '';

  return `You are a Senior Software Test Architect and Quality Assurance Specialist for algorithmic coding assessments.
Generate exactly ${boundedCount} distinct, high-value candidate test cases for the following coding problem.

=== PROBLEM SPECIFICATION ===
Title: ${title}
Language: ${language}
Execution Mode: ${executionMode}
${executionMode === 'FUNCTION' ? `Target Function: ${functionName}(${paramStr}) -> ${returnType}` : 'Input Mode: Standard Input (STDIN)'}

Problem Statement:
${statement}

Input Format:
${inputFormat || 'Follow standard problem description'}

Output Format:
${outputFormat || 'Follow standard problem description'}

Constraints:
${constraints || 'Adhere to standard language and memory limits'}

Authoritative Reference Solution (for understanding input types, structure, and expected execution):
\`\`\`${language}
${referenceSolution}
\`\`\`
${existingInputsSection}${teacherInstructions}
=== GENERATION RULES ===
1. ${categoryInstruction}
2. CONSTRAINTS ARE STRICT: Every test case input MUST satisfy all mathematical and size constraints specified above. Never generate inputs that violate problem bounds (e.g., negative sizes when n >= 1, values outside allowed range).
3. INPUT FORMATTING:
   - If Execution Mode is FUNCTION: format the input matching the function signature. E.g.:
     * Single argument: "[1, 2, 3]" or '"hello"' or "42"
     * Multiple arguments: "nums = [2, 7, 11, 15], target = 9" or "[2, 7, 11, 15], 9"
   - If Execution Mode is STDIN: format the input exactly as the program expects to read from standard input, using proper line breaks (\\n).
4. DIVERSITY & COVERAGE:
   - Include edge cases: empty strings/lists (if allowed by constraints), single-element inputs, identical/duplicate elements.
   - Include boundary cases: minimum allowed values, maximum allowed values.
   - Include scale/stress cases: larger inputs within constraints to test time/space complexity.
5. NO DUPLICATES: Do not duplicate any existing test case inputs listed above, and do not repeat inputs within your generated output.
6. STRICT JSON: Respond ONLY with a valid JSON object matching the schema. No markdown backticks, no comments, no prose outside JSON.`;
};
