/**
 * Provider-Independent Interface for AI Question Generation Providers.
 */
export class AIProvider {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Generates a complete structured coding question.
   * @param {Object} options
   * @param {string} options.topic - Core programming topic or algorithm
   * @param {'Easy'|'Medium'|'Hard'} options.difficulty
   * @param {'python'|'javascript'|'java'|'cpp'} options.language
   * @param {'FUNCTION'|'STDIN'} options.executionMode
   * @param {string} [options.requirements] - Additional instructions or constraints
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>} Structured raw question object
   */
  async generateQuestion(options) {
    throw new Error(`generateQuestion() not implemented in provider '${this.name}'`);
  }

  /**
   * Regenerates a single section of a coding question while preserving existing context.
   * @param {Object} options
   * @param {'problemStatement'|'starterCode'|'referenceSolution'} options.section
   * @param {Object} options.currentQuestion - Existing question context
   * @param {string} [options.instructions]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Object>} Regenerated section output
   */
  async regenerateSection(options) {
    throw new Error(`regenerateSection() not implemented in provider '${this.name}'`);
  }

  /**
   * Generates candidate test cases for a question.
   * @param {Object} options
   * @param {Object} options.question
   * @param {number} [options.count=5]
   * @param {string} [options.category='all']
   * @param {string} [options.instructions='']
   * @param {Array<string>} [options.existingInputs=[]]
   * @returns {Promise<{ testCases: Array<Object> }>}
   */
  async generateTestCases(options) {
    throw new Error(`generateTestCases() not implemented in provider '${this.name}'`);
  }

  /**
   * Generates multiple-choice questions.
   * @param {Object} options
   * @returns {Promise<{ questions: Array<Object> }>}
   */
  async generateMcqs(options) {
    throw new Error(`generateMcqs() not implemented in provider '${this.name}'`);
  }

  /**
   * Generates comprehensive educational explanation for a coding question or MCQ.
   * @param {Object} options
   * @param {Object} options.question
   * @param {string} [options.language]
   * @param {string} [options.studentCode]
   * @returns {Promise<{ explanation: string, breakdown?: Array<Object>, keyTakeaways?: Array<string> }>}
   */
  async generateExplanation(options) {
    throw new Error(`generateExplanation() not implemented in provider '${this.name}'`);
  }

  /**
   * Generates progressive, non-spoiling hints for a problem.
   * @param {Object} options
   * @param {Object} options.question
   * @param {string} [options.studentCode]
   * @param {number} [options.hintLevel=1]
   * @returns {Promise<{ hints: Array<{ level: number, title: string, hint: string }> }>}
   */
  async generateHints(options) {
    throw new Error(`generateHints() not implemented in provider '${this.name}'`);
  }

  /**
   * Evaluates problem clarity, edge cases, and constraint rigor, returning actionable improvements.
   * @param {Object} options
   * @param {Object} options.question
   * @param {string} [options.instructions]
   * @returns {Promise<{ suggestions: Array<string>, refinedStatement?: string, missingEdgeCases?: Array<string> }>}
   */
  async improveQuestion(options) {
    throw new Error(`improveQuestion() not implemented in provider '${this.name}'`);
  }
}

export default AIProvider;
