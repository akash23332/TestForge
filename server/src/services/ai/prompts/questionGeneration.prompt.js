/**
 * Prompts and JSON Schema definitions for AI Question Generation using Google Gemini.
 */

export const QUESTION_GENERATION_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: {
      type: 'STRING',
      description: 'Concise, professional problem title (e.g. "Longest Substring Without Repeating Characters")'
    },
    statement: {
      type: 'STRING',
      description: 'Clear, comprehensive LeetCode-style problem statement describing the challenge and requirements'
    },
    difficulty: {
      type: 'STRING',
      enum: ['Easy', 'Medium', 'Hard'],
      description: 'Difficulty level of the problem'
    },
    tags: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'List of relevant technical topic tags (e.g. ["Array", "Two Pointers"])'
    },
    constraints: {
      type: 'STRING',
      description: 'Mathematical and operational constraints (e.g. "1 <= n <= 10^5\\n-10^9 <= nums[i] <= 10^9")'
    },
    inputFormat: {
      type: 'STRING',
      description: 'Clear description of the input format and arguments'
    },
    outputFormat: {
      type: 'STRING',
      description: 'Clear description of the expected output or return value'
    },
    executionMode: {
      type: 'STRING',
      enum: ['FUNCTION', 'STDIN'],
      description: 'Whether student solution is a function or standalone STDIN/STDOUT program'
    },
    dataStructure: {
      type: 'STRING',
      enum: ['NONE', 'ARRAY', 'STRING', 'LINKED_LIST', 'BINARY_TREE'],
      description: 'Primary data structure involved'
    },
    functionName: {
      type: 'STRING',
      description: 'Exact name of the target method/function (e.g. "twoSum" or "solution")'
    },
    functionSignature: {
      type: 'OBJECT',
      properties: {
        parameters: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              type: { type: 'STRING' }
            },
            required: ['name', 'type']
          }
        },
        returnType: {
          type: 'STRING',
          description: 'Return type (e.g. "int", "string", "boolean", "int[]", "void")'
        }
      },
      required: ['parameters', 'returnType']
    },
    examples: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          input: { type: 'STRING' },
          output: { type: 'STRING' },
          explanation: { type: 'STRING' }
        },
        required: ['input', 'output']
      },
      description: '1 to 3 illustrative examples with input, expected output, and explanation'
    },
    sampleTestCase: {
      type: 'OBJECT',
      properties: {
        input: {
          type: 'STRING',
          description: 'The exact raw input string for the sample test case (e.g. "[1, 2, 3]" or "1 2" or "3\\n4"). MUST be raw argument values ONLY. NEVER include variable names or assignment expressions like "nums = " or "n = ".'
        },
        expectedOutput: {
          type: 'STRING',
          description: 'The exact expected output string for the sample test case (e.g. "3" or "true" or "[1, 2]").'
        },
        explanation: { type: 'STRING' }
      },
      required: ['input', 'expectedOutput'],
      description: 'Exactly one public sample test case matching the problem statement'
    },
    starterCode: {
      type: 'STRING',
      description: 'Starter code skeleton for the selected programming language'
    },
    starterCodes: {
      type: 'OBJECT',
      properties: {
        python: { type: 'STRING' },
        javascript: { type: 'STRING' },
        java: { type: 'STRING' },
        cpp: { type: 'STRING' }
      },
      required: ['python', 'javascript', 'java', 'cpp']
    },
    referenceSolution: {
      type: 'STRING',
      description: 'Fully working reference solution for the selected programming language'
    },
    referenceSolutions: {
      type: 'OBJECT',
      properties: {
        python: { type: 'STRING' },
        javascript: { type: 'STRING' },
        java: { type: 'STRING' },
        cpp: { type: 'STRING' }
      }
    }
  },
  required: [
    'title',
    'statement',
    'difficulty',
    'tags',
    'constraints',
    'inputFormat',
    'outputFormat',
    'executionMode',
    'functionName',
    'functionSignature',
    'examples',
    'sampleTestCase',
    'starterCode',
    'starterCodes',
    'referenceSolution'
  ]
};

export const buildQuestionGenerationPrompt = ({
  topic,
  difficulty = 'Medium',
  language = 'python',
  executionMode = 'FUNCTION',
  requirements = '',
  recentQuestions = [],
  regenerationFeedback = null
}) => {
  const normLang = language.toLowerCase();
  const normMode = executionMode.toUpperCase();

  let diversityDirectives = '';
  if (Array.isArray(recentQuestions) && recentQuestions.length > 0) {
    const exclusionList = recentQuestions
      .slice(-5)
      .map((q, idx) => {
        const titleStr = q.title || 'Untitled';
        const stmtStr = (q.statement || '').slice(0, 160).replace(/\s+/g, ' ');
        const fnStr = q.functionName ? ` (Function: ${q.functionName})` : '';
        return `   ${idx + 1}. "${titleStr}"${fnStr}: ${stmtStr}...`;
      })
      .join('\n');

    diversityDirectives = `
GENERATION DIVERSITY & EXCLUSION CONTRACT:
The teacher is requesting another variation in this active session.
You MUST strictly avoid reproducing any of the following ${Math.min(recentQuestions.length, 5)} previously generated question(s):
${exclusionList}

MANDATORY VARIATION RULES:
1. Do NOT reuse, mirror, or paraphrase the core task, problem formulation, or story context of any excluded question above.
2. Do NOT simply rename variables, swap narrative roles, or use synonyms while keeping the same underlying algorithmic mechanism.
3. For the requested topic ("${topic || 'Algorithms and Data Structures'}"), select a DIFFERENT algorithmic sub-pattern or problem-solving archetype.
4. Invent a completely fresh, creative problem context, narrative framing, and distinct input/output relationships.
5. All teacher requirements (topic: "${topic || 'Algorithms and Data Structures'}", difficulty: "${difficulty}", executionMode: "${normMode}", language: "${normLang}") MUST be 100% strictly preserved.
6. Choose a completely distinct problem title and unique functionName (different from any of the excluded questions above).
`;
  }

  let feedbackDirectives = '';
  if (regenerationFeedback) {
    feedbackDirectives = `
CRITICAL CORRECTION FROM PREVIOUS ATTEMPT:
The previous generation attempt was REJECTED because it was too similar to an existing question:
"${regenerationFeedback}"
You MUST invent a completely different scenario and algorithmic formulation on this attempt!
`;
  }

  return `You are an expert technical assessment creator and competitive programming architect for TestForge.
Create exactly ONE complete, high-quality, solvable coding problem based on the following specifications:

SPECIFICATIONS:
- Primary Topic: ${topic || 'Algorithms and Data Structures'}
- Difficulty: ${difficulty}
- Primary Programming Language: ${normLang}
- Execution Mode: ${normMode}
${requirements ? `- Specific Additional Requirements: ${requirements}` : ''}
${diversityDirectives}
${feedbackDirectives}

EXECUTION MODE CONTRACT RULES:
1. If executionMode is "FUNCTION":
   - The question must require a function or method signature.
   - For Python: define function or class Solution method named accurately in functionName (e.g. def ${normLang === 'python' ? 'solve(nums):' : 'twoSum(nums, target):'}).
   - For JavaScript: function ${normLang === 'javascript' ? 'solve(...) { ... }' : 'solution(...) { ... }'}.
   - For Java: public class Solution { public <ReturnType> <functionName>(<Params>) { ... } }.
   - For C++: class Solution { public: <ReturnType> <functionName>(<Params>) { ... } };.
   - The reference solution MUST implement this exact functionName.
   - The starter code MUST declare this exact function signature with an empty body or placeholder return.

2. If executionMode is "STDIN":
   - The code must be a standalone script/program that reads from standard input (stdin) and writes to standard output (stdout).
   - In Python: sys.stdin.read() or input(), print().
   - In JavaScript: fs.readFileSync(0, 'utf-8') or readline, console.log().
   - In Java: public class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); ... } }. When parsing integers or numbers, parse robustly (e.g. String clean = s.replaceAll("[^0-9-]", ""); if (!clean.isEmpty()) int val = Integer.parseInt(clean);) so brackets or punctuation never trigger NumberFormatException.
   - In C++: #include <iostream> using namespace std; int main() { ... return 0; }.

SAMPLE TEST CASE RULES:
- Provide EXACTLY ONE public sample testcase in "sampleTestCase".
- The sampleTestCase input and expectedOutput MUST be 100% consistent with Example 1 and the problem statement.
- The sampleTestCase "input" MUST contain ONLY the raw literal argument values (e.g. "[1, 2, 3]" or "1 2" or "3\\n4"). NEVER prefix with variable names, parameter names, or assignment expressions like "nums = " or "arr = ".
- The sampleTestCase "expectedOutput" MUST be the exact raw return value.
- Do NOT generate hidden test cases or multiple test cases in sampleTestCase.
- The reference solution MUST produce the EXACT expectedOutput when given the sampleTestCase input.

STARTER CODES:
- Provide starterCodes for all 4 supported languages: python, javascript, java, cpp.
- Ensure the selected language (${normLang}) is also set in the top-level starterCode and referenceSolution fields.

Produce pure structured JSON conforming strictly to the requested schema.`;
};

export const REGENERATE_SOLUTION_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    referenceSolution: {
      type: 'STRING',
      description: 'Fresh, working, complete reference solution in the target language solving the exact problem correctly.'
    },
    approach: {
      type: 'STRING',
      description: 'Concise summary of the algorithmic approach or data structure technique used in this solution.'
    }
  },
  required: ['referenceSolution']
};

export const REGENERATE_STARTER_CODE_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    starterCode: {
      type: 'STRING',
      description: 'Clean starter code skeleton for students. Must declare the exact function signature with placeholder body. NEVER expose the reference solution.'
    }
  },
  required: ['starterCode']
};

export const buildSolutionRegenerationPrompt = ({
  currentQuestion,
  instructions = '',
  exclusionSolution = ''
}) => {
  const qTitle = currentQuestion.title || 'Untitled Problem';
  const qStmt = currentQuestion.statement || '';
  const qLang = (currentQuestion.language || 'python').toLowerCase();
  const qMode = (currentQuestion.executionMode || 'FUNCTION').toUpperCase();
  const qFn = currentQuestion.functionName || 'solution';
  const sampleIn = currentQuestion.sampleTestCase?.input || currentQuestion.examples?.[0]?.input || 'N/A';
  const sampleOut = currentQuestion.sampleTestCase?.expectedOutput || currentQuestion.examples?.[0]?.output || 'N/A';

  return `You are an expert competitive programming solution architect for TestForge.
Generate a FRESH, ALTERNATIVE, CORRECT reference solution for the following exact coding problem.

CRITICAL REQUIREMENTS:
1. Do NOT modify the problem statement, constraints, function name, signature, or sample test case.
2. The language MUST be "${qLang}".
3. Execution mode is "${qMode}".
4. In FUNCTION mode, the function/method MUST be named "${qFn}" and accept the required parameters.
5. In STDIN mode, read from standard input and write to standard output.
6. The solution MUST produce the exact expected output ("${sampleOut}") when given the sample input ("${sampleIn}").
${exclusionSolution ? `7. DIVERSITY REQUIREMENT: The new solution must use a different valid algorithm or coding implementation. Do NOT replicate this previous solution:\n${exclusionSolution}\n` : ''}
${instructions ? `Additional Teacher Guidance: ${instructions}\n` : ''}

PROBLEM CONTEXT:
- Title: ${qTitle}
- Difficulty: ${currentQuestion.difficulty || 'Medium'}
- Problem Statement:
${qStmt}
- Constraints:
${currentQuestion.constraints || 'Standard constraints'}
- Input Format: ${currentQuestion.inputFormat || 'N/A'}
- Output Format: ${currentQuestion.outputFormat || 'N/A'}
- Function Name: ${qFn}
- Sample Input: ${sampleIn}
- Expected Sample Output: ${sampleOut}

Respond with pure JSON conforming to the schema: {"referenceSolution": "...", "approach": "..."}`;
};

export const buildStarterCodeRegenerationPrompt = ({
  currentQuestion,
  instructions = ''
}) => {
  const qTitle = currentQuestion.title || 'Untitled Problem';
  const qLang = (currentQuestion.language || 'python').toLowerCase();
  const qMode = (currentQuestion.executionMode || 'FUNCTION').toUpperCase();
  const qFn = currentQuestion.functionName || 'solution';

  return `You are an expert technical problem editor for TestForge.
Generate a fresh, clean starter code skeleton for students in "${qLang}".

CRITICAL REQUIREMENTS:
1. MUST preserve the exact function signature, function name "${qFn}", and execution mode "${qMode}".
2. MUST NOT contain the reference solution or reveal the solving algorithm. The function body must be empty or contain only a placeholder return or pass statement.
3. Include helpful clean docstring/comments describing parameter types and return values.
${instructions ? `Teacher Specific Instructions: ${instructions}\n` : ''}

PROBLEM CONTEXT:
- Title: ${qTitle}
- Target Language: ${qLang}
- Execution Mode: ${qMode}
- Target Function Name: ${qFn}
- Input Format: ${currentQuestion.inputFormat || 'N/A'}
- Output Format: ${currentQuestion.outputFormat || 'N/A'}

Respond with pure JSON conforming to the schema: {"starterCode": "..."}`;
};

export const buildSectionRegenerationPrompt = ({
  section,
  currentQuestion,
  instructions = '',
  exclusionSolution = ''
}) => {
  if (section === 'solution' || section === 'referenceSolution') {
    return buildSolutionRegenerationPrompt({ currentQuestion, instructions, exclusionSolution });
  }
  if (section === 'starterCode') {
    return buildStarterCodeRegenerationPrompt({ currentQuestion, instructions });
  }

  const qTitle = currentQuestion.title || 'Untitled Problem';
  const qStmt = currentQuestion.statement || '';
  const qLang = (currentQuestion.language || 'python').toLowerCase();
  const qMode = (currentQuestion.executionMode || 'FUNCTION').toUpperCase();
  const qFn = currentQuestion.functionName || 'solution';

  return `You are an expert technical problem editor for TestForge.
Regenerate ONLY the requested section "${section}" for the following existing question.
Do NOT modify or contradict the existing context:
- Title: ${qTitle}
- Difficulty: ${currentQuestion.difficulty || 'Medium'}
- Execution Mode: ${qMode}
- Target Language: ${qLang}
- Target Function Name: ${qFn}
- Current Statement: ${qStmt}
- Current Reference Solution: ${currentQuestion.referenceSolution || 'N/A'}
- Sample Input: ${currentQuestion.sampleTestCase?.input || 'N/A'}
- Sample Output: ${currentQuestion.sampleTestCase?.expectedOutput || 'N/A'}

${instructions ? `Teacher Specific Instructions: ${instructions}` : ''}

Respond with a JSON object containing ONLY the regenerated field(s) for section "${section}".`;
};
