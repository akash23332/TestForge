/**
 * JSON Schema for Gemini structured MCQ generation
 */
export const MCQ_GENERATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    topic: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: {
            type: 'string',
            description: 'Clear, unambiguous multiple choice question text.'
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Option identifier such as A, B, C, D.' },
                text: { type: 'string', description: 'Option text.' }
              },
              required: ['id', 'text']
            },
            minItems: 4,
            maxItems: 4
          },
          correctAnswers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of option IDs that are correct, e.g. ["B"] or ["A", "C"].'
          },
          explanation: {
            type: 'string',
            description: 'Comprehensive pedagogical explanation of why the correct option(s) are right and others are wrong.'
          },
          difficulty: {
            type: 'string',
            enum: ['Easy', 'Medium', 'Hard']
          },
          style: {
            type: 'string',
            enum: ['conceptual', 'factual', 'application_based']
          },
          bloomTaxonomy: {
            type: 'string',
            enum: ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate']
          }
        },
        required: [
          'statement',
          'options',
          'correctAnswers',
          'explanation',
          'difficulty',
          'style',
          'bloomTaxonomy'
        ]
      }
    }
  },
  required: ['subject', 'topic', 'questions']
};

/**
 * Builds the structured generation prompt for Gemini.
 */
export const buildMcqGenerationPrompt = ({
  subject = 'Computer Science',
  topic = 'General',
  subtopics = [],
  count = 5,
  difficulty = 'Medium',
  style = 'conceptual',
  answerType = 'single',
  instructions = '',
  existingStatements = []
} = {}) => {
  const boundedCount = Math.max(1, Math.min(25, Number(count) || 5));
  const subtopicStr = Array.isArray(subtopics) && subtopics.length > 0
    ? `Specific Focus Areas / Subtopics: ${subtopics.join(', ')}`
    : '';

  const difficultyInstruction = difficulty === 'Mixed'
    ? 'Distribute question difficulty evenly across Easy, Medium, and Hard.'
    : `Generate strictly ${difficulty} difficulty questions.`;

  const answerTypeInstruction = answerType === 'multiple'
    ? `Each question MUST have MULTIPLE correct answers (at least 2 options correct). The "correctAnswers" array must include all matching option IDs (e.g. ["A", "C"] or ["A", "B", "D"]). Note: It is completely valid for all 4 options to be correct if the question context warrants it.`
    : `Each question MUST have EXACTLY ONE correct answer. The "correctAnswers" array must contain exactly one option ID (e.g. ["B"]).`;

  const styleDescriptions = {
    conceptual: 'Focus on theoretical principles, core models, abstractions, and relationships between concepts.',
    factual: 'Focus on standard specifications, terminology, properties, standard algorithms, and established definitions.',
    application_based: 'Provide realistic scenarios, code snippets, problem scenarios, calculation traces, or system design trade-offs where principles must be applied.'
  };

  const styleInstruction = styleDescriptions[style] || styleDescriptions.conceptual;

  const exclusionSection = Array.isArray(existingStatements) && existingStatements.length > 0
    ? `\nPREVIOUS QUESTIONS TO EXCLUDE (DO NOT REPEAT SIMILAR QUESTIONS OR PHRASING):\n${existingStatements.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
    : '';

  return `You are TestForge's elite academic examination architect.
Generate EXACTLY ${boundedCount} high-yield multiple-choice questions (MCQs) for university-level computer science assessments.

CONFIGURATION:
- Subject: ${subject}
- Primary Topic: ${topic}
${subtopicStr}
- Requested Quantity: ${boundedCount}
- Target Difficulty: ${difficulty} (${difficultyInstruction})
- Pedagogical Style: ${style} (${styleInstruction})
- Answer Type: ${answerType} (${answerTypeInstruction})
${instructions ? `- Teacher Custom Directives: ${instructions}` : ''}
${exclusionSection}

STRICT QUALITY RULES:
1. Every question must have exactly 4 plausible, high-quality answer options labeled "A", "B", "C", "D".
2. Distractors (incorrect choices) must represent common misconceptions or subtle pitfalls, never trivial or joke answers.
3. Options must be mutually exclusive in meaning (unless "All of the above" or "None of the above" is specifically required).
4. Do NOT make the correct answer conspicuously longer or more detailed than the distractors.
5. In the "correctAnswers" field:
   - For single-answer questions: Provide exactly 1 option ID (e.g. ["A"]).
   - For multiple-answer questions: Provide 2 or more option IDs (e.g. ["A", "C"]).
6. The "explanation" must thoroughly explain why the correct option(s) are correct and clarify why other options are incorrect.
7. Return strictly a JSON object conforming to the required schema.`;
};

export default {
  MCQ_GENERATION_JSON_SCHEMA,
  buildMcqGenerationPrompt
};
