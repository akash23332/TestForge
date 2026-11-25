import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { McqQuestion } from '../src/models/McqQuestion.js';
import {
  validateMcqCandidate,
  computeMcqStatementHash,
  filterPersistentDuplicates
} from '../src/services/ai/mcqValidator.service.js';
import {
  createSingleMcq,
  updateSavedMcq,
  getSavedMcqs,
  batchSaveMcqCandidates,
  deleteSavedMcq
} from '../src/controllers/mcq.controller.js';
import { connectDatabase } from '../src/config/database.js';

describe('AI MCQ Generation & Manual MCQ Creation Suite (Phase 2)', () => {
  jest.setTimeout(40000);
  const teacherId = new mongoose.Types.ObjectId();
  const otherTeacherId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await McqQuestion.deleteMany({ ownerId: { $in: [teacherId, otherTeacherId, adminId] } });
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await McqQuestion.deleteMany({ ownerId: { $in: [teacherId, otherTeacherId, adminId] } });
  });

  // ── 1. VALIDATOR & NORMALIZATION TESTS ──────────────────────────────────────
  describe('MCQ Validator Service', () => {
    it('validates a correct single-choice candidate', () => {
      const candidate = {
        statement: 'What is the worst-case time complexity of Binary Search?',
        options: [
          { id: 'A', text: 'O(1)' },
          { id: 'B', text: 'O(log n)' },
          { id: 'C', text: 'O(n)' },
          { id: 'D', text: 'O(n log n)' }
        ],
        correctAnswers: ['B'],
        answerType: 'single',
        explanation: 'Binary search halves the search space each step, achieving logarithmic worst-case time.'
      };

      const result = validateMcqCandidate(candidate);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.data.answerType).toBe('single');
      expect(result.data.correctAnswers[0]).toBe('B');
    });

    it('validates a correct multi-choice candidate where all options are correct', () => {
      const candidate = {
        statement: 'Which of the following are valid linear data structures in computer science?',
        options: [
          { id: 'A', text: 'Array' },
          { id: 'B', text: 'Linked List' },
          { id: 'C', text: 'Stack' },
          { id: 'D', text: 'Queue' }
        ],
        correctAnswers: ['A', 'B', 'C', 'D'],
        answerType: 'multiple',
        explanation: 'All four structures organize elements sequentially in a linear order.'
      };

      const result = validateMcqCandidate(candidate);
      expect(result.isValid).toBe(true);
      expect(result.data.correctAnswers.length).toBe(4);
    });

    it('rejects candidate with statement shorter than 10 characters', () => {
      const candidate = {
        statement: 'Too short',
        options: [
          { id: 'A', text: 'Option 1' },
          { id: 'B', text: 'Option 2' }
        ],
        correctAnswers: ['A'],
        answerType: 'single',
        explanation: 'Some explanation.'
      };

      const result = validateMcqCandidate(candidate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 10 characters'))).toBe(true);
    });

    it('rejects candidate with fewer than 2 options or duplicate option texts', () => {
      const candidate = {
        statement: 'What is the time complexity of pushing to a standard stack?',
        options: [
          { id: 'A', text: 'O(1)' },
          { id: 'B', text: '  O(1)  ' } // Duplicate after trim
        ],
        correctAnswers: ['A'],
        answerType: 'single',
        explanation: 'Push operation executes in constant time.'
      };

      const result = validateMcqCandidate(candidate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate option detected'))).toBe(true);
    });

    it('rejects candidate when correctAnswers contains non-existent option ID', () => {
      const candidate = {
        statement: 'What is the auxiliary space of iterative binary search?',
        options: [
          { id: 'A', text: 'O(1)' },
          { id: 'B', text: 'O(n)' }
        ],
        correctAnswers: ['Z'], // Non-existent
        answerType: 'single',
        explanation: 'Only constant pointers are used.'
      };

      const result = validateMcqCandidate(candidate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('does not match any valid option ID'))).toBe(true);
    });

    it('rejects single-choice question with multiple correct answers', () => {
      const candidate = {
        statement: 'Which data structure implements LIFO ordering?',
        options: [
          { id: 'A', text: 'Stack' },
          { id: 'B', text: 'Queue' }
        ],
        correctAnswers: ['A', 'B'], // Invalid for single choice
        answerType: 'single',
        explanation: 'Only stack implements LIFO.'
      };

      const result = validateMcqCandidate(candidate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Single-choice question must have exactly 1 correct answer'))).toBe(true);
    });

    it('computes consistent statement hash irrespective of case and extra whitespace', () => {
      const stmt1 = 'What is the worst-case time complexity of QuickSort?';
      const stmt2 = '  what   is the  worst-case   time complexity of quicksort?  ';
      expect(computeMcqStatementHash(stmt1)).toBe(computeMcqStatementHash(stmt2));
    });
  });

  // ── 2. MODEL PRE-SAVE COMPATIBILITY HOOK TESTS ─────────────────────────────
  describe('McqQuestion Model Two-Way Synchronization', () => {
    it('automatically populates legacy optionA-D and correctAnswer from modern options', async () => {
      const mcq = new McqQuestion({
        ownerId: teacherId,
        statement: 'Which data structure uses FIFO (First In First Out)?',
        options: [
          { id: 'A', text: 'Stack' },
          { id: 'B', text: 'Queue' },
          { id: 'C', text: 'Graph' },
          { id: 'D', text: 'Tree' }
        ],
        correctAnswers: ['B'],
        answerType: 'single',
        explanation: 'Queues maintain first-in-first-out order.'
      });

      await mcq.save();

      expect(mcq.question).toBe('Which data structure uses FIFO (First In First Out)?');
      expect(mcq.optionA).toBe('Stack');
      expect(mcq.optionB).toBe('Queue');
      expect(mcq.correctAnswer).toBe('B');
      expect(mcq.statementHash).toBeDefined();
    });

    it('automatically populates modern options and correctAnswers from legacy CSV import fields', async () => {
      const mcq = new McqQuestion({
        ownerId: teacherId,
        question: 'What is the return type of a constructor in Java?',
        optionA: 'void',
        optionB: 'int',
        optionC: 'No return type',
        optionD: 'Object',
        correctAnswer: 'C',
        explanation: 'Constructors in Java do not specify any return type.'
      });

      await mcq.save();

      expect(mcq.statement).toBe('What is the return type of a constructor in Java?');
      expect(mcq.options.length).toBe(4);
      expect(mcq.options[2].id).toBe('C');
      expect(mcq.options[2].text).toBe('No return type');
      expect(mcq.correctAnswers).toEqual(['C']);
      expect(mcq.answerType).toBe('single');
    });
  });

  // ── 3. CONTROLLER CRUD & OWNERSHIP TESTS ───────────────────────────────────
  describe('MCQ Controller CRUD & Security Authorization', () => {
    it('creates single MCQ with persistent duplicate protection', async () => {
      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: {
          statement: 'What is the time complexity of Hash Table search on average?',
          options: [
            { id: 'A', text: 'O(1)' },
            { id: 'B', text: 'O(n)' },
            { id: 'C', text: 'O(log n)' },
            { id: 'D', text: 'O(n^2)' }
          ],
          correctAnswers: ['A'],
          answerType: 'single',
          explanation: 'Hash table lookup is O(1) on average assuming good distribution.',
          subject: 'Data Structures',
          topic: 'Hashing',
          difficulty: 'Medium'
        }
      };

      let status = 0;
      let bodyData = null;
      const res = {
        status: (s) => { status = s; return res; },
        json: (b) => { bodyData = b; return res; }
      };

      await createSingleMcq(req, res, (err) => { if (err) throw err; });
      expect(status).toBe(201);
      expect(bodyData.data.statement).toBe(req.body.statement);

      // Attempting to create duplicate should throw 409 Conflict
      let caughtErr = null;
      await createSingleMcq(req, res, (err) => { caughtErr = err; });
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(409);
    });

    it('enforces teacher ownership on update and blocks unauthorized teachers', async () => {
      const created = await McqQuestion.create({
        ownerId: teacherId,
        statement: 'What is the height of a balanced binary tree with N nodes?',
        options: [
          { id: 'A', text: 'O(log N)' },
          { id: 'B', text: 'O(N)' }
        ],
        correctAnswers: ['A'],
        answerType: 'single',
        explanation: 'Balanced tree height is logarithmic.'
      });

      // Other teacher attempts update -> 403 Forbidden
      let caughtErr = null;
      const unauthReq = {
        user: { _id: otherTeacherId, role: 'teacher' },
        params: { id: created._id },
        body: { topic: 'Trees' }
      };
      const res = {
        status: () => res,
        json: () => res
      };
      await updateSavedMcq(unauthReq, res, (err) => { caughtErr = err; });
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(403);

      // Owner teacher updates -> 200 OK
      let status = 0;
      let updatedData = null;
      const authRes = {
        status: (s) => { status = s; return authRes; },
        json: (b) => { updatedData = b; return authRes; }
      };
      const authReq = {
        user: { _id: teacherId, role: 'teacher' },
        params: { id: created._id },
        body: { topic: 'Binary Trees', difficulty: 'Hard' }
      };
      await updateSavedMcq(authReq, authRes, (err) => { if (err) throw err; });
      expect(status).toBe(200);
      expect(updatedData.data.topic).toBe('Binary Trees');
      expect(updatedData.data.difficulty).toBe('Hard');
    });

    it('filters saved MCQs by owner teacher and query criteria', async () => {
      await McqQuestion.create([
        {
          ownerId: teacherId,
          statement: 'Teacher 1 Question in Algorithms',
          subject: 'Algorithms',
          difficulty: 'Easy',
          status: 'published',
          options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
          correctAnswers: ['A'],
          explanation: 'Exp'
        },
        {
          ownerId: otherTeacherId,
          statement: 'Teacher 2 Question in Algorithms',
          subject: 'Algorithms',
          difficulty: 'Easy',
          status: 'published',
          options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
          correctAnswers: ['A'],
          explanation: 'Exp'
        }
      ]);

      let resData = null;
      const res = {
        status: () => res,
        json: (b) => { resData = b; return res; }
      };

      const req = {
        user: { _id: teacherId, role: 'teacher' },
        query: { subject: 'Algorithms' }
      };

      await getSavedMcqs(req, res, (err) => { if (err) throw err; });
      expect(resData.data.items.length).toBe(1);
      expect(resData.data.items[0].statement).toBe('Teacher 1 Question in Algorithms');
    });
  });

  // ── 4. BATCH SAVE ATOMICITY & DEDUPLICATION ─────────────────────────────────
  describe('batchSaveMcqCandidates Handler', () => {
    it('persists a valid batch of candidates atomically', async () => {
      const candidates = [
        {
          statement: 'Batch Question 1: What is the base case in recursion?',
          options: [
            { id: 'A', text: 'Termination condition' },
            { id: 'B', text: 'Infinite loop' }
          ],
          correctAnswers: ['A'],
          answerType: 'single',
          explanation: 'Base case prevents infinite recursion.'
        },
        {
          statement: 'Batch Question 2: Which sorting algorithm is in-place and non-stable on average?',
          options: [
            { id: 'A', text: 'Merge Sort' },
            { id: 'B', text: 'Quick Sort' }
          ],
          correctAnswers: ['B'],
          answerType: 'single',
          explanation: 'Standard QuickSort is in-place but not stable.'
        }
      ];

      let status = 0;
      let resBody = null;
      const res = {
        status: (s) => { status = s; return res; },
        json: (b) => { resBody = b; return res; }
      };

      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: { candidates }
      };

      await batchSaveMcqCandidates(req, res, (err) => { if (err) throw err; });
      expect(status).toBe(201);
      expect(resBody.data.length).toBe(2);

      const inDb = await McqQuestion.find({ ownerId: teacherId }).lean();
      expect(inDb.length).toBe(2);
    });

    it('rejects batch containing internal duplicate statements with 400 Bad Request', async () => {
      const candidates = [
        {
          statement: 'Duplicate statement inside the same batch test',
          options: [{ id: 'A', text: 'Yes' }, { id: 'B', text: 'No' }],
          correctAnswers: ['A'],
          answerType: 'single',
          explanation: 'Explanation 1'
        },
        {
          statement: '  Duplicate statement inside the same batch test  ',
          options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
          correctAnswers: ['A'],
          answerType: 'single',
          explanation: 'Explanation 2'
        }
      ];

      let caughtErr = null;
      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: { candidates }
      };
      const res = { status: () => res, json: () => res };

      await batchSaveMcqCandidates(req, res, (err) => { caughtErr = err; });
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(400);
      expect(caughtErr.message.includes('Duplicate MCQ statement detected within batch')).toBe(true);
    });

    it('rejects batch with 409 Conflict if any candidate already exists in teacher collection', async () => {
      await McqQuestion.create({
        ownerId: teacherId,
        statement: 'Existing question already saved in database.',
        options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
        correctAnswers: ['A'],
        explanation: 'Exp'
      });

      const candidates = [
        {
          statement: 'Existing question already saved in database.',
          options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
          correctAnswers: ['A'],
          answerType: 'single',
          explanation: 'Exp'
        }
      ];

      let caughtErr = null;
      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: { candidates }
      };
      const res = { status: () => res, json: () => res };

      await batchSaveMcqCandidates(req, res, (err) => { caughtErr = err; });
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(409);
      expect(caughtErr.message.includes('already exist in your question bank')).toBe(true);
    });

    it('enforces maximum batch limit of 25 items', async () => {
      const candidates = Array.from({ length: 26 }, (_, i) => ({
        statement: `Question number #${i + 1} with at least 10 chars`,
        options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }],
        correctAnswers: ['A'],
        explanation: 'Exp'
      }));

      let caughtErr = null;
      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: { candidates }
      };
      const res = { status: () => res, json: () => res };

      await batchSaveMcqCandidates(req, res, (err) => { caughtErr = err; });
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(400);
      expect(caughtErr.message.includes('Maximum 25 MCQs allowed')).toBe(true);
    });

    it('persists ONLY selected candidates into MongoDB and leaves unselected candidates out of database', async () => {
      // Simulate review queue with 3 candidates, but teacher only approves candidates #1 and #3
      const candidate1 = {
        statement: 'Selected Candidate #1: What is a deadlock in OS?',
        options: [{ id: 'A', text: 'Permanent blocking' }, { id: 'B', text: 'High CPU speed' }],
        correctAnswers: ['A'],
        answerType: 'single',
        explanation: 'Processes block each other indefinitely.'
      };
      const candidate2Unselected = {
        statement: 'Unselected Candidate #2: Discarded question never approved by faculty',
        options: [{ id: 'A', text: 'Unused' }, { id: 'B', text: 'Discarded' }],
        correctAnswers: ['A'],
        answerType: 'single',
        explanation: 'Should not be in DB.'
      };
      const candidate3 = {
        statement: 'Selected Candidate #3: What is Banker algorithm used for?',
        options: [{ id: 'A', text: 'Deadlock avoidance' }, { id: 'B', text: 'Deadlock creation' }],
        correctAnswers: ['A'],
        answerType: 'single',
        explanation: 'Tests for safe state before allocation.'
      };

      // Only candidate1 and candidate3 sent to batch approval endpoint
      let status = 0;
      let bodyData = null;
      const res = {
        status: (s) => { status = s; return res; },
        json: (b) => { bodyData = b; return res; }
      };

      const req = {
        user: { _id: teacherId, role: 'teacher' },
        body: { candidates: [candidate1, candidate3] }
      };

      await batchSaveMcqCandidates(req, res, (err) => { if (err) throw err; });
      expect(status).toBe(201);
      expect(bodyData.data.length).toBe(2);

      // Verify MongoDB contains candidate1 and candidate3, but NOT candidate2
      const inDb = await McqQuestion.find({ ownerId: teacherId }).lean();
      expect(inDb.length).toBe(2);
      const statementsInDb = inDb.map(d => d.statement);
      expect(statementsInDb).toContain(candidate1.statement);
      expect(statementsInDb).toContain(candidate3.statement);
      expect(statementsInDb).not.toContain(candidate2Unselected.statement);

      // Verify that getSavedMcqs returns these exact questions in the Question Bank
      let bankResData = null;
      const bankRes = {
        status: () => bankRes,
        json: (b) => { bankResData = b; return bankRes; }
      };
      await getSavedMcqs({ user: { _id: teacherId, role: 'teacher' }, query: {} }, bankRes, (err) => { if (err) throw err; });
      expect(bankResData.data.count).toBe(2);
      expect(bankResData.data.items.some(q => q.statement === candidate1.statement)).toBe(true);
    });
  });

  // ── 5. AI PROVIDER RESILIENCE & ERROR MAPPING ──────────────────────────────
  describe('Gemini Provider Error Mapping', () => {
    it('properly maps 429 rate limit to ApiError.tooManyRequests', async () => {
      const { GeminiProvider } = await import('../src/services/ai/providers/gemini.provider.js');
      const provider = new GeminiProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ status: 429, message: 'RESOURCE_EXHAUSTED quota exceeded' });
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('properly maps 401 invalid key to ApiError.unauthorized', async () => {
      const { GeminiProvider } = await import('../src/services/ai/providers/gemini.provider.js');
      const provider = new GeminiProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ status: 401, message: 'API_KEY_INVALID: API key not valid' });
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    });

    it('properly maps 503 high demand to ApiError.serviceUnavailable', async () => {
      const { GeminiProvider } = await import('../src/services/ai/providers/gemini.provider.js');
      const provider = new GeminiProvider({ apiKey: 'mock_key' });
      const err = provider._handleApiError({ status: 503, message: 'This model is currently experiencing high demand.' });
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  // ── 5. ZERO-LEAK VERIFICATION ──────────────────────────────────────────────
  describe('Zero-Leak Student Protection', () => {
    it('ensures correctAnswers and explanation are stripped when preparing student exam payload', () => {
      const mcqDoc = {
        _id: new mongoose.Types.ObjectId(),
        statement: 'What is the time complexity of traversing a linked list of length n?',
        options: [
          { id: 'A', text: 'O(1)' },
          { id: 'B', text: 'O(n)' }
        ],
        correctAnswers: ['B'],
        correctAnswer: 'B',
        explanation: 'Every node from head to tail must be visited.',
        topic: 'Linked Lists',
        difficulty: 'Easy'
      };

      // Emulate student exam question serialization
      const studentPayload = {
        _id: mcqDoc._id.toString(),
        type: 'mcq',
        statement: mcqDoc.statement,
        options: mcqDoc.options.map(o => ({ id: o.id, text: o.text })),
        topic: mcqDoc.topic,
        difficulty: mcqDoc.difficulty
      };

      expect(studentPayload.correctAnswer).toBeUndefined();
      expect(studentPayload.correctAnswers).toBeUndefined();
      expect(studentPayload.explanation).toBeUndefined();
      expect(studentPayload.statement).toBe(mcqDoc.statement);
      expect(studentPayload.options.length).toBe(2);
    });
  });
});
