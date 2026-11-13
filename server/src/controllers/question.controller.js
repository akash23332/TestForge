import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { validateQuestionSuite } from '../services/testValidation.service.js';

export const createQuestion = async (req, res, next) => {
  try {
    let ownerId = req.user ? req.user._id : req.body.ownerId;
    if (!ownerId || String(ownerId).length !== 24) {
      const defaultUser = await User.findOne({ role: 'teacher' });
      if (defaultUser) {
        ownerId = defaultUser._id;
      } else {
        throw ApiError.unauthorized('User must be authenticated to create a question.');
      }
    }

    if (req.body.status === 'published') {
      throw ApiError.badRequest(
        'Questions must be saved as draft and validated against test cases in Test Studio before publishing.'
      );
    }

    const question = await Question.create({
      ...req.body,
      ownerId
    });

    return ApiResponse.success(res, 201, question, 'Question created successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Explicit student-facing allowlist for coding questions.
 * Strict zero-leak security: never contains referenceSolution, hidden tests, or private teacher fields.
 */
export const sanitizeQuestionAllowlist = (q) => ({
  _id: q._id,
  title: q.title,
  statement: q.statement,
  constraints: q.constraints || '',
  executionMode: q.executionMode || 'STDIN',
  functionName: q.functionName || 'solution',
  functionSignature: q.functionSignature || null,
  supportedLanguages: q.supportedLanguages || ['javascript', 'python', 'java', 'cpp'],
  language: q.language || 'javascript',
  difficulty: q.difficulty || 'Medium',
  tags: q.tags || [],
  examples: q.examples || [],
  starterCode: q.starterCode || '',
  starterCodes: q.starterCodes ? (q.starterCodes instanceof Map ? Object.fromEntries(q.starterCodes) : q.starterCodes) : {},
  createdAt: q.createdAt,
  updatedAt: q.updatedAt
});

export const getQuestions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', difficulty = '', language = '', sort = '-updatedAt' } = req.query;

    const filter = {};
    const isTeacher = req.user && req.user.role === 'teacher';
    const isAdmin = req.user && req.user.role === 'admin';

    // If authenticated teacher, show their authored questions
    if (isTeacher) {
      filter.ownerId = req.user._id;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { statement: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (difficulty) {
      filter.difficulty = difficulty;
    }

    if (language) {
      filter.language = language;
    }

    const skip = (Number(page) - 1) * Number(limit);

    // ZERO-LEAK: If not an authorized teacher or admin, exclude referenceSolution at database projection level
    const isAuthorizedFaculty = isTeacher || isAdmin;
    let query = Question.find(filter).sort(sort).skip(skip).limit(Number(limit));
    if (!isAuthorizedFaculty) {
      query = query.select('-referenceSolution -referenceSolutions');
    }

    const [questions, total] = await Promise.all([
      query.lean(),
      Question.countDocuments(filter)
    ]);

    // Apply explicit student allowlist for non-faculty/student callers
    const safeQuestions = isAuthorizedFaculty
      ? questions
      : questions.map(sanitizeQuestionAllowlist);

    return ApiResponse.paginated(res, safeQuestions, page, limit, total);
  } catch (error) {
    next(error);
  }
};

export const getQuestionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id).lean();

    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    const isOwnerOrAdmin =
      req.user &&
      (question.ownerId.toString() === req.user._id.toString() || req.user.role === 'admin');

    if (!isOwnerOrAdmin) {
      // ZERO-LEAK: Explicit student-facing allowlist - never leaks referenceSolution or private fields
      return ApiResponse.success(res, 200, sanitizeQuestionAllowlist(question), 'Question retrieved');
    }

    return ApiResponse.success(res, 200, question, 'Question retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * Strict Student Preview endpoint.
 * Conforms to Section 13: Never returns reference solution or private teacher fields.
 */
export const getQuestionStudentView = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id)
      .select('-referenceSolution -referenceSolutions -status')
      .lean();

    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    // Also fetch only public test cases
    const publicTests = await TestCase.find({
      questionId: id,
      visibility: 'public'
    })
      .select('input expectedOutput category')
      .lean();

    const sanitizedQuestion = {
      id: question._id,
      title: question.title,
      statement: question.statement,
      constraints: question.constraints,
      executionMode: question.executionMode || 'STDIN',
      functionName: question.functionName || 'solution',
      functionSignature: question.functionSignature || null,
      supportedLanguages: question.supportedLanguages || ['javascript', 'python', 'java', 'cpp'],
      language: question.language,
      difficulty: question.difficulty,
      examples: question.examples,
      starterCode: question.starterCode,
      starterCodes: question.starterCodes || {},
      publicTestCases: publicTests
    };

    return ApiResponse.success(res, 200, sanitizedQuestion, 'Student sanitized question retrieved');
  } catch (error) {
    next(error);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);

    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    const isOwnerOrAdmin =
      req.user &&
      (question.ownerId.toString() === req.user._id.toString() || req.user.role === 'admin');

    if (!isOwnerOrAdmin) {
      throw ApiError.forbidden('You do not have permission to update this question.');
    }

    // Strict Publishing Gate (Requirement 6)
    if (req.body.status === 'published') {
      const suiteReport = await validateQuestionSuite({
        questionId: id,
        language: req.body.language || question.language,
        user: req.user
      });
      if (!suiteReport.canPublish) {
        throw ApiError.badRequest(
          `Question cannot be published. Unresolved issues: ${suiteReport.blockingErrors.join('; ')}`
        );
      }
    }

    Object.assign(question, req.body);
    await question.save();

    return ApiResponse.success(res, 200, question, 'Question updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);

    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    const isOwnerOrAdmin =
      req.user &&
      (question.ownerId.toString() === req.user._id.toString() || req.user.role === 'admin');

    if (!isOwnerOrAdmin) {
      throw ApiError.forbidden('You do not have permission to delete this question.');
    }

    await Promise.all([
      Question.findByIdAndDelete(id),
      TestCase.deleteMany({ questionId: id })
    ]);

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export default {
  createQuestion,
  getQuestions,
  getQuestionById,
  getQuestionStudentView,
  updateQuestion,
  deleteQuestion
};
