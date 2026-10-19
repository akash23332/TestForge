import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';

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

    const question = await Question.create({
      ...req.body,
      ownerId
    });

    return ApiResponse.success(res, 201, question, 'Question created successfully');
  } catch (error) {
    next(error);
  }
};

export const getQuestions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = '', difficulty = '', language = '', sort = '-updatedAt' } = req.query;

    const filter = {};
    if (req.user) {
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
    const [questions, total] = await Promise.all([
      Question.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Question.countDocuments(filter)
    ]);

    return ApiResponse.paginated(res, questions, page, limit, total);
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

    // Owner check if user is authenticated
    if (req.user && question.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      throw ApiError.forbidden('You do not have permission to access this question.');
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
      .select('-referenceSolution -status')
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
      language: question.language,
      difficulty: question.difficulty,
      examples: question.examples,
      starterCode: question.starterCode,
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

    if (req.user && question.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      throw ApiError.forbidden('You do not have permission to update this question.');
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

    if (req.user && question.ownerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
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
