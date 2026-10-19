import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';

export const previewMcq = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
      throw ApiError.badRequest('Expected "rows" array in request body.');
    }

    if (rows.length === 0) {
      throw ApiError.badRequest('MCQ rows array cannot be empty.');
    }

    const processedRows = [];
    const summary = {
      total: rows.length,
      valid: 0,
      invalid: 0
    };

    const seenQuestions = new Set();

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const errors = [];

      // Check required fields
      if (!row.question || typeof row.question !== 'string' || row.question.trim().length < 5) {
        errors.push('Question statement is missing or too short (min 5 chars).');
      }

      // Check duplicate in same batch
      const normalizedQ = (row.question || '').trim().toLowerCase();
      if (seenQuestions.has(normalizedQ)) {
        errors.push('Duplicate question detected in uploaded batch.');
      } else if (normalizedQ) {
        seenQuestions.add(normalizedQ);
      }

      // Check options A-D
      if (!row.optionA || !String(row.optionA).trim()) errors.push('Option A is missing.');
      if (!row.optionB || !String(row.optionB).trim()) errors.push('Option B is missing.');
      if (!row.optionC || !String(row.optionC).trim()) errors.push('Option C is missing.');
      if (!row.optionD || !String(row.optionD).trim()) errors.push('Option D is missing.');

      // Check correct answer key
      const validAnswers = ['A', 'B', 'C', 'D'];
      const answer = (row.correctAnswer || '').toString().trim().toUpperCase();
      if (!validAnswers.includes(answer)) {
        errors.push(`Invalid correct answer "${row.correctAnswer}". Must be one of A, B, C, or D.`);
      }

      // Check marks
      const marks = Number(row.marks);
      if (isNaN(marks) || marks <= 0) {
        errors.push('Marks must be a positive number.');
      }

      const isValid = errors.length === 0;
      if (isValid) {
        summary.valid += 1;
      } else {
        summary.invalid += 1;
      }

      processedRows.push({
        rowNumber,
        question: row.question || '',
        optionA: row.optionA || '',
        optionB: row.optionB || '',
        optionC: row.optionC || '',
        optionD: row.optionD || '',
        correctAnswer: answer,
        marks: marks || 1,
        topic: row.topic || 'General',
        explanation: row.explanation || '',
        isValid,
        errors
      });
    });

    return ApiResponse.success(
      res,
      200,
      {
        summary,
        rows: processedRows
      },
      'MCQ batch parsed and validated'
    );
  } catch (error) {
    next(error);
  }
};

export default {
  previewMcq
};
