import { Question } from '../models/Question.js';
import { TestCase } from '../models/TestCase.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { evaluateMutants, synthesizeCandidateTests, calculateMutationScore } from '../services/mutation.service.js';

export const runMutations = async (req, res, next) => {
  try {
    const { id } = req.params;
    const question = await Question.findById(id);
    if (!question) {
      throw ApiError.notFound('Question not found');
    }

    const testCases = await TestCase.find({ questionId: id }).lean();
    const referenceCode = question.referenceSolution || question.starterCode || '';

    if (!referenceCode.trim()) {
      throw ApiError.badRequest('Question does not have reference code configured for mutation testing');
    }

    const questionContext = {
      title: question.title,
      tags: question.tags || [],
      language: question.language || 'javascript'
    };

    // Run real deterministic mutation tests
    const mutants = await evaluateMutants({
      referenceCode,
      testCases,
      questionContext,
      customMutants: req.body?.customMutants
    });

    const killed = mutants.filter((m) => m.status === 'killed').length;
    const survived = mutants.filter((m) => m.status === 'survived').length;
    const invalid = mutants.filter((m) => m.status === 'compilation_error' || m.status === 'invalid').length;
    const totalEligible = killed + survived;
    const mutationScore = calculateMutationScore(killed, survived);

    // Generate verified candidate test cases for any surviving mutants
    const survivingMutants = mutants.filter((m) => m.status === 'survived');
    const candidateTests = await synthesizeCandidateTests({
      referenceCode,
      survivingMutants,
      testCases,
      questionContext
    });

    const summaryText = totalEligible === 0
      ? 'No eligible valid mutants could be evaluated for this solution.'
      : `Mutation score: ${mutationScore}% (${killed}/${totalEligible} killed). ${
          survived === 0
            ? 'All mutants caught by your test suite.'
            : `${survived} mutant(s) survived! ${candidateTests.length > 0 ? 'Review verified candidate tests below.' : 'Add targeted test cases in Studio.'}`
        }`;

    return ApiResponse.success(
      res,
      200,
      {
        questionId: id,
        totalMutants: mutants.length,
        totalEligible,
        killed,
        survived,
        invalid,
        mutationScore,
        mutants,
        candidateTests,
        summary: summaryText
      },
      'Mutation test execution finished'
    );
  } catch (error) {
    next(error);
  }
};

export default {
  runMutations
};
