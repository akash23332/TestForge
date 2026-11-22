import { GeminiProvider } from './providers/gemini.provider.js';
import { validateMcqCandidate, filterPersistentDuplicates } from './mcqValidator.service.js';
import { ApiError } from '../../utils/apiError.js';

export class McqGeneratorService {
  constructor(provider = null) {
    this.provider = provider || new GeminiProvider();
    // In-memory session history: sessionKey -> Set of normalized statements
    this._sessionHistory = new Map();
  }

  /**
   * Retrieves or initializes session statement history.
   */
  _getSessionHistory(sessionKey) {
    if (!this._sessionHistory.has(sessionKey)) {
      this._sessionHistory.set(sessionKey, []);
    }
    return this._sessionHistory.get(sessionKey);
  }

  /**
   * Clears in-memory session history for a teacher.
   */
  clearSessionHistory(sessionKey) {
    this._sessionHistory.delete(sessionKey);
  }

  /**
   * Generates candidate MCQs with Gemini structured outputs,
   * server-side validation, and persistent + session duplicate prevention.
   */
  async generateCandidateMcqs({
    subject = 'Computer Science',
    topic = 'General',
    subtopics = [],
    count = 5,
    difficulty = 'Medium',
    style = 'conceptual',
    answerType = 'single',
    instructions = '',
    ownerId = null,
    sessionKey = 'default'
  } = {}) {
    const boundedCount = Math.max(1, Math.min(25, Number(count) || 5));
    const sessionHistory = this._getSessionHistory(sessionKey);

    // Call Gemini structured generator
    const rawResult = await this.provider.generateMcqs({
      subject,
      topic,
      subtopics,
      count: boundedCount,
      difficulty,
      style,
      answerType,
      instructions,
      existingStatements: sessionHistory.slice(-15) // Supply recent session statements for negative prompting
    });

    const rawQuestions = Array.isArray(rawResult?.questions) ? rawResult.questions : [];
    if (rawQuestions.length === 0) {
      throw ApiError.badGateway('Gemini returned zero MCQ candidates.', { code: 'GEMINI_EMPTY_MCQ_LIST' });
    }

    const validatedCandidates = [];
    let rejectedCount = 0;

    for (let idx = 0; idx < rawQuestions.length; idx++) {
      const raw = rawQuestions[idx];
      try {
        const validation = validateMcqCandidate(raw, {
          subject,
          topic,
          difficulty: difficulty === 'Mixed' ? undefined : difficulty,
          style,
          answerType
        });
        if (validation.isValid) {
          const item = validation.data;
          item.candidateId = `cand_mcq_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          item.isAiGenerated = true;
          validatedCandidates.push(item);
        } else {
          rejectedCount++;
        }
      } catch (err) {
        rejectedCount++;
      }
    }

    // Filter against persistent database duplicates (same teacher) & in-batch duplicates
    const { nonDuplicates, duplicateCount } = await filterPersistentDuplicates(
      validatedCandidates,
      ownerId
    );

    // Update in-memory session history
    for (const item of nonDuplicates) {
      sessionHistory.push(item.statement);
      if (sessionHistory.length > 50) sessionHistory.shift();
    }

    return {
      subject: rawResult.subject || subject,
      topic: rawResult.topic || topic,
      candidates: nonDuplicates,
      totalGenerated: rawQuestions.length,
      acceptedCount: nonDuplicates.length,
      duplicateCount,
      rejectedCount
    };
  }
}

export const mcqGeneratorService = new McqGeneratorService();
export default mcqGeneratorService;
