import { questionGeneratorService } from '../services/ai/questionGenerator.service.js';
import { mcqGeneratorService } from '../services/ai/mcqGenerator.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Generates a complete structured coding question using the configured AI provider (Google Gemini),
 * with semantic diversity enforcement and duplicate prevention against recent session history.
 */
export const generateQuestion = async (req, res, next) => {
  try {
    const {
      topic = 'Algorithms and Data Structures',
      difficulty = 'Medium',
      language = 'python',
      executionMode = 'FUNCTION',
      requirements = '',
      recentQuestions = [],
      clearHistory = false,
      sessionKey = null
    } = req.body;

    const effectiveSessionKey = sessionKey || req.user?._id?.toString() || req.user?.id || 'default_session';

    if (clearHistory) {
      questionGeneratorService.clearSessionHistory(effectiveSessionKey);
    }

    const generatedQuestion = await questionGeneratorService.generateQuestion({
      topic,
      difficulty,
      language,
      executionMode,
      requirements,
      recentQuestions: Array.isArray(recentQuestions) ? recentQuestions.slice(-5) : [],
      sessionKey: effectiveSessionKey
    });

    return ApiResponse.success(
      res,
      200,
      generatedQuestion,
      'Coding question generated successfully with diversity verification.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Explicitly clears the recent question history for the current teacher session.
 */
export const clearSessionHistory = async (req, res, next) => {
  try {
    const sessionKey = req.body.sessionKey || req.user?._id?.toString() || req.user?.id || 'default_session';
    questionGeneratorService.clearSessionHistory(sessionKey);

    return ApiResponse.success(
      res,
      200,
      { cleared: true, sessionKey },
      'Session question generation history cleared successfully.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Regenerates a single section or entire question with preview data and dependency invalidations.
 * Validates teacher ownership and authorization.
 */
export const regenerateSection = async (req, res, next) => {
  try {
    const {
      action,
      section,
      currentQuestion,
      instructions = '',
      recentQuestions = []
    } = req.body;

    const rawAction = action || section;
    if (!rawAction) {
      throw ApiError.badRequest('Action or section name is required for regeneration.');
    }

    const targetAction =
      rawAction === 'referenceSolution' || rawAction === 'solution' ? 'solution' :
      rawAction === 'problemStatement' || rawAction === 'statement' ? 'statement' :
      rawAction === 'all' || rawAction === 'completeQuestion' || rawAction === 'entireQuestion' ? 'entireQuestion' :
      rawAction;

    if (!currentQuestion || typeof currentQuestion !== 'object') {
      throw ApiError.badRequest('Existing question context is required for section regeneration.');
    }

    // Security Authorization Check:
    // Teachers can only regenerate their own drafts. Admins can regenerate any draft.
    if (currentQuestion.ownerId && req.user) {
      const ownerIdStr = String(currentQuestion.ownerId);
      const userIdStr = String(req.user._id || req.user.id);
      if (ownerIdStr !== userIdStr && req.user.role !== 'admin') {
        throw ApiError.forbidden("You are not authorized to regenerate sections for another teacher's question draft.", {
          code: 'UNAUTHORIZED_TEACHER_DRAFT_REGENERATION'
        });
      }
    }

    const sessionKey = req.user?._id?.toString() || req.user?.id || 'default_session';

    const result = await questionGeneratorService.regenerateSection({
      action: targetAction,
      section: targetAction,
      currentQuestion,
      instructions,
      recentQuestions,
      sessionKey
    });

    return ApiResponse.success(
      res,
      200,
      result,
      `Action "${targetAction}" preview generated successfully.`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Generates candidate Multiple Choice Questions using Gemini with structured outputs,
 * strict server-side validation, and persistent duplicate filtering.
 * Returns reviewable in-memory candidate objects without persisting to the database.
 */
export const generateMcq = async (req, res, next) => {
  try {
    const {
      subject = 'Computer Science',
      topic = 'General',
      subtopics = [],
      count = 5,
      difficulty = 'Medium',
      style = 'conceptual',
      answerType = 'single',
      instructions = '',
      sessionKey = null
    } = req.body;

    const ownerId = req.user ? req.user._id : null;
    const effectiveSessionKey = sessionKey || (ownerId ? ownerId.toString() : 'default_session');

    const result = await mcqGeneratorService.generateCandidateMcqs({
      subject,
      topic,
      subtopics,
      count,
      difficulty,
      style,
      answerType,
      instructions,
      ownerId,
      sessionKey: effectiveSessionKey
    });

    return ApiResponse.success(
      res,
      200,
      result,
      `Synthesized ${result.acceptedCount} candidate MCQs ready for review.`
    );
  } catch (error) {
    next(error);
  }
};

export default {
  generateQuestion,
  regenerateSection,
  clearSessionHistory,
  generateMcq
};
