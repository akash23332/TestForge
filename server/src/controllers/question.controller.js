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

    const requestedStatus = req.body.status || 'draft';
    const lang = (req.body.language || 'javascript').toLowerCase();
    const refSol = req.body.referenceSolution || '';
    const starter = req.body.starterCode || '';

    // Convert plain objects into proper Mongoose Map structures
    const initialRefSolutions = new Map();
    if (req.body.referenceSolutions && typeof req.body.referenceSolutions === 'object') {
      for (const [k, v] of Object.entries(req.body.referenceSolutions)) {
        if (v) initialRefSolutions.set(k.toLowerCase(), v);
      }
    }
    if (refSol) {
      initialRefSolutions.set(lang, refSol);
    }

    const initialStarterCodes = new Map();
    if (req.body.starterCodes && typeof req.body.starterCodes === 'object') {
      for (const [k, v] of Object.entries(req.body.starterCodes)) {
        if (v) initialStarterCodes.set(k.toLowerCase(), v);
      }
    }
    if (starter) {
      initialStarterCodes.set(lang, starter);
    }

    // 1. ALWAYS persist the question in MongoDB (starts as 'draft')
    const createData = { ...req.body };
    delete createData.referenceSolutions;
    delete createData.starterCodes;

    const question = await Question.create({
      ...createData,
      language: lang,
      referenceSolution: refSol,
      referenceSolutions: initialRefSolutions,
      starterCode: starter,
      starterCodes: initialStarterCodes,
      status: 'published',
      ownerId
    });

    // 2. Automatically create TestCase documents from examples if provided
    if (Array.isArray(req.body.examples) && req.body.examples.length > 0) {
      const testCasesToCreate = req.body.examples
        .filter((ex) => ex.input !== undefined && ex.output !== undefined && String(ex.input).trim() !== '' && String(ex.output).trim() !== '')
        .map((ex) => ({
          questionId: question._id,
          input: String(ex.input).trim(),
          expectedOutput: String(ex.output).trim(),
          explanation: ex.explanation || '',
          category: 'sample',
          visibility: 'public',
          weight: 1.0,
          verificationStatus: 'unverified'
        }));

      if (testCasesToCreate.length > 0) {
        await TestCase.insertMany(testCasesToCreate);
      }
    }

    // 3. Directly publish to Question Bank
    question.status = 'published';
    await question.save();
    const noticeMessage = 'Question created and published to Question Bank.';

    return ApiResponse.success(res, 201, question, noticeMessage);
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
  inputFormat: q.inputFormat || '',
  outputFormat: q.outputFormat || '',
  constraints: q.constraints || '',
  executionMode: q.executionMode || 'STDIN',
  dataStructure: q.dataStructure || 'ARRAY',
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

    // Authentic personal faculty account: strictly show their authored questions.
    // Demo account (teacher@testforge.edu) or admin: include platform/seed questions.
    const isDemo = req.user?.email === 'teacher@testforge.edu';
    if (isTeacher) {
      if (req.query.scope === 'all' || isDemo || isAdmin) {
        filter.$or = [
          { ownerId: req.user._id },
          { ownerId: { $exists: false } },
          { ownerId: null },
          { status: 'published' }
        ];
      } else {
        filter.ownerId = req.user._id;
      }
    } else if (!isAdmin) {
      // Unauthenticated or students: only published questions
      filter.status = 'published';
    }

    if (search) {
      const searchOr = [
        { title: { $regex: search, $options: 'i' } },
        { statement: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
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
      inputFormat: question.inputFormat || '',
      outputFormat: question.outputFormat || '',
      constraints: question.constraints,
      executionMode: question.executionMode || 'STDIN',
      dataStructure: question.dataStructure || 'ARRAY',
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
      (question.ownerId?.toString() === req.user._id.toString() ||
        !question.ownerId ||
        req.user.role === 'admin');

    if (!isOwnerOrAdmin) {
      throw ApiError.forbidden('You do not have permission to update this question.');
    }

    const targetLang = (req.body.language || question.language || 'javascript').toLowerCase();

    // 1. Sync referenceSolutions and starterCodes for the target language in Mongoose Maps
    if (!question.referenceSolutions) question.referenceSolutions = new Map();
    if (!question.starterCodes) question.starterCodes = new Map();

    if (req.body.referenceSolutions && typeof req.body.referenceSolutions === 'object') {
      for (const [k, v] of Object.entries(req.body.referenceSolutions)) {
        if (v) question.referenceSolutions.set(k.toLowerCase(), v);
      }
    }
    if (req.body.referenceSolution) {
      question.referenceSolutions.set(targetLang, req.body.referenceSolution);
    }

    if (req.body.starterCodes && typeof req.body.starterCodes === 'object') {
      for (const [k, v] of Object.entries(req.body.starterCodes)) {
        if (v) question.starterCodes.set(k.toLowerCase(), v);
      }
    }
    if (req.body.starterCode) {
      question.starterCodes.set(targetLang, req.body.starterCode);
    }

    const wasAlreadyPublished = question.status === 'published';

    // 2. Apply field updates to the question without clobbering the Mongoose Maps
    const updateData = { ...req.body };
    delete updateData.referenceSolutions;
    delete updateData.starterCodes;

    Object.assign(question, updateData);
    question.language = targetLang;
    if (req.body.referenceSolution) {
      question.referenceSolution = req.body.referenceSolution;
    }
    if (req.body.starterCode) {
      question.starterCode = req.body.starterCode;
    }
    await question.save();

    // 3. Strict Publishing Gate (Requirement 6)
    // Validate suite when transitioning from draft to published
    if (req.body.status === 'published' && !wasAlreadyPublished) {
      const suiteReport = await validateQuestionSuite({
        questionId: id,
        language: targetLang,
        user: req.user
      });
      if (!suiteReport.canPublish) {
        question.status = 'draft';
        await question.save();
        throw ApiError.badRequest(
          `Question cannot be published. Unresolved issues: ${suiteReport.blockingErrors.join('; ')}`
        );
      }
    }

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
      (question.ownerId?.toString() === req.user._id.toString() ||
        !question.ownerId ||
        req.user.role === 'admin');

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
