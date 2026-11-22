import mongoose from 'mongoose';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { McqQuestion } from '../models/McqQuestion.js';
import { User } from '../models/User.js';
import { validateMcqCandidate, computeMcqStatementHash } from '../services/ai/mcqValidator.service.js';

// Pre-seeded algorithmic & CS question templates for procedural generation
const QUESTION_KNOWLEDGE_BASE = {
  'Data Structures': [
    {
      q: 'What is the worst-case time complexity of searching an element in a balanced Binary Search Tree?',
      a: 'O(1)', b: 'O(n)', c: 'O(log n)', d: 'O(n log n)',
      ans: 'C', explanation: 'A balanced BST divides search space in half at each step resulting in logarithmic height.'
    },
    {
      q: 'Which data structure follows the LIFO (Last In First Out) principle?',
      a: 'Queue', b: 'Stack', c: 'Tree', d: 'Graph',
      ans: 'B', explanation: 'A Stack processes elements in reverse order of arrival (LIFO).'
    },
    {
      q: 'What is the minimum number of queues required to implement a stack?',
      a: '1', b: '2', c: '3', d: '4',
      ans: 'B', explanation: 'At least 2 queues are required to simulate LIFO behavior.'
    },
    {
      q: 'Which data structure is primarily used for implementing Breadth-First Search (BFS)?',
      a: 'Stack', b: 'Queue', c: 'Priority Queue', d: 'Binary Heap',
      ans: 'B', explanation: 'BFS explores vertices level by level, requiring FIFO ordering provided by a Queue.'
    },
    {
      q: 'What is the time complexity to insert a node at the head of a singly linked list?',
      a: 'O(1)', b: 'O(n)', c: 'O(log n)', d: 'O(n^2)',
      ans: 'A', explanation: 'Head insertion only requires updating head pointer and new node next pointer in O(1).'
    },
    {
      q: 'In a max-heap with N elements, what is the time complexity of deleting the maximum element?',
      a: 'O(1)', b: 'O(log N)', c: 'O(N)', d: 'O(N log N)',
      ans: 'B', explanation: 'Replacing root with last leaf and sift-down takes O(log N) operations.'
    },
    {
      q: 'Which collision resolution technique in hash tables maintains a linked list at each bucket?',
      a: 'Linear Probing', b: 'Quadratic Probing', c: 'Separate Chaining', d: 'Double Hashing',
      ans: 'C', explanation: 'Separate Chaining stores all keys that hash to the same slot in a linked list.'
    }
  ],
  'Algorithms': [
    {
      q: 'What is the worst-case time complexity of QuickSort?',
      a: 'O(n)', b: 'O(n log n)', c: 'O(n^2)', d: 'O(log n)',
      ans: 'C', explanation: 'QuickSort degrades to O(n^2) when chosen pivots consistently partition into empty subarrays.'
    },
    {
      q: 'Which algorithmic paradigm does Kadane algorithm belong to?',
      a: 'Divide and Conquer', b: 'Dynamic Programming', c: 'Greedy', d: 'Backtracking',
      ans: 'B', explanation: 'Kadane algorithm computes maximum subarray ending at current index using optimal substructure.'
    },
    {
      q: 'What is the time complexity of Merge Sort in all cases (worst, average, best)?',
      a: 'O(n log n)', b: 'O(n^2)', c: 'O(n)', d: 'O(2^n)',
      ans: 'A', explanation: 'Merge sort always divides array in half (log n levels) and performs O(n) work per level.'
    },
    {
      q: 'Which algorithm is used to find Single Source Shortest Path in a weighted graph with non-negative edges?',
      a: 'Prim algorithm', b: 'Kruskal algorithm', c: 'Dijkstra algorithm', d: 'Floyd-Warshall algorithm',
      ans: 'C', explanation: 'Dijkstra greedy algorithm finds shortest paths from source in O((V + E) log V).'
    },
    {
      q: 'What is the auxiliary space complexity of standard iterative Binary Search?',
      a: 'O(n)', b: 'O(log n)', c: 'O(1)', d: 'O(n log n)',
      ans: 'C', explanation: 'Iterative binary search only maintains low, high, and mid pointers in constant space.'
    }
  ],
  'Python': [
    {
      q: 'Which built-in Python data structure is mutable and ordered?',
      a: 'Tuple', b: 'Set', c: 'List', d: 'Frozenset',
      ans: 'C', explanation: 'Lists in Python are mutable sequences that preserve insertion order.'
    },
    {
      q: 'What is the output of bool([]) in Python?',
      a: 'True', b: 'False', c: 'None', d: 'Error',
      ans: 'B', explanation: 'Empty collections in Python evaluate to False in boolean context.'
    },
    {
      q: 'Which keyword is used to create an anonymous inline function in Python?',
      a: 'def', b: 'func', c: 'lambda', d: 'anon',
      ans: 'C', explanation: 'lambda creates small anonymous single-expression functions in Python.'
    },
    {
      q: 'What is the time complexity of dictionary key lookup in Python on average?',
      a: 'O(1)', b: 'O(n)', c: 'O(log n)', d: 'O(n^2)',
      ans: 'A', explanation: 'Python dict is implemented via hash table offering average O(1) key lookups.'
    }
  ],
  'Java': [
    {
      q: 'In Java, which collection class is synchronized and thread-safe by default?',
      a: 'ArrayList', b: 'Vector', c: 'LinkedList', d: 'HashSet',
      ans: 'B', explanation: 'Vector methods are synchronized, making it thread-safe unlike ArrayList.'
    },
    {
      q: 'Which keyword prevents a Java method from being overridden in subclasses?',
      a: 'static', b: 'abstract', c: 'final', d: 'const',
      ans: 'C', explanation: 'Declaring a method final prevents subclass overriding.'
    },
    {
      q: 'Where are Java object instances stored in memory during runtime?',
      a: 'Stack Memory', b: 'Heap Memory', c: 'Program Counter', d: 'Register',
      ans: 'B', explanation: 'All Java object instances are allocated dynamically on the Heap.'
    },
    {
      q: 'What is the size of the primitive "int" data type in Java?',
      a: '16 bits', b: '32 bits', c: '64 bits', d: 'Platform dependent',
      ans: 'B', explanation: 'In Java, primitive int is always 32 bits (4 bytes) signed two-complement integer.'
    }
  ],
  'C++': [
    {
      q: 'In C++ STL, which container is implemented as a self-balancing Red-Black Tree?',
      a: 'std::vector', b: 'std::set', c: 'std::unordered_set', d: 'std::deque',
      ans: 'B', explanation: 'std::set and std::map in C++ STL are ordered containers backed by Red-Black Trees.'
    },
    {
      q: 'Which operator cannot be overloaded in C++?',
      a: '+', b: '[]', c: '::', d: '<<',
      ans: 'C', explanation: 'Scope resolution operator (::), member access (.), and sizeof cannot be overloaded.'
    },
    {
      q: 'What is the size of a pointer in a 64-bit C++ compiled binary?',
      a: '4 bytes', b: '8 bytes', c: '16 bytes', d: '2 bytes',
      ans: 'B', explanation: 'On 64-bit architectures, pointers store 64-bit memory addresses requiring 8 bytes.'
    }
  ],
  'Databases & SQL': [
    {
      q: 'What does ACID stand for in database transactions?',
      a: 'Atomicity, Consistency, Isolation, Durability',
      b: 'Asynchrony, Concurrency, Indexing, Delivery',
      c: 'Action, Callback, Input, Data',
      d: 'Authentication, Cryptography, Integrity, Decryption',
      ans: 'A', explanation: 'ACID properties guarantee valid and resilient database transactions.'
    },
    {
      q: 'Which SQL clause is used to filter records resulting from a GROUP BY query?',
      a: 'WHERE', b: 'HAVING', c: 'ORDER BY', d: 'LIMIT',
      ans: 'B', explanation: 'HAVING filters aggregate groups whereas WHERE filters individual rows before grouping.'
    },
    {
      q: 'Which normal form eliminates partial dependency on a composite primary key?',
      a: '1NF', b: '2NF', c: '3NF', d: 'BCNF',
      ans: 'B', explanation: 'Second Normal Form (2NF) requires 1NF and no non-prime attribute dependent on a proper subset of candidate key.'
    }
  ],
  'Operating Systems': [
    {
      q: 'Which scheduling algorithm is non-preemptive and selects the process with lowest burst time?',
      a: 'Round Robin', b: 'SJF (Shortest Job First)', c: 'SRTF', d: 'Priority Preemptive',
      ans: 'B', explanation: 'Non-preemptive SJF runs the shortest available burst without interruption.'
    },
    {
      q: 'Which condition is NOT one of Coffman four conditions for Deadlock?',
      a: 'Mutual Exclusion', b: 'Hold and Wait', c: 'Circular Wait', d: 'Preemption Allowed',
      ans: 'D', explanation: 'No Preemption is required for deadlock; preemption prevents deadlock.'
    },
    {
      q: 'What is Thrashing in an operating system?',
      a: 'High CPU utilization', b: 'High disk swapping activity exceeding execution time',
      c: 'Network packet drop', d: 'Deadlock in kernel threads',
      ans: 'B', explanation: 'Thrashing occurs when the system spends more time page faulting and swapping pages than executing.'
    }
  ]
};

/**
 * Saves a batch of MCQs permanently into MongoDB.
 */
export const saveMcqBatch = async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw ApiError.badRequest('Expected non-empty "rows" array in request body.');
    }

    if (!req.user || !req.user._id) {
      throw ApiError.unauthorized('Authentication required to save MCQs.');
    }
    const ownerId = req.user._id;

    const docsToInsert = rows
      .map((r) => ({
        ownerId,
        question: (r.question || '').trim(),
        optionA: (r.optionA || '').trim(),
        optionB: (r.optionB || '').trim(),
        optionC: (r.optionC || '').trim(),
        optionD: (r.optionD || '').trim(),
        correctAnswer: (r.correctAnswer || 'A').toString().trim().toUpperCase(),
        marks: Number(r.marks) || 1,
        topic: (r.topic || 'General').trim(),
        explanation: (r.explanation || '').trim()
      }))
      .filter((r) => r.question && r.optionA && r.optionB && r.optionC && r.optionD);

    if (docsToInsert.length === 0) {
      throw ApiError.badRequest('No valid questions to save.');
    }

    const inserted = await McqQuestion.insertMany(docsToInsert);

    return ApiResponse.success(
      res,
      201,
      {
        count: inserted.length,
        items: inserted
      },
      `Successfully saved ${inserted.length} MCQs to MongoDB Question Bank`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves saved MCQs from MongoDB for the teacher.
 */
export const getSavedMcqs = async (req, res, next) => {
  try {
    const { topic = '', subject = '', difficulty = '', status = '', answerType = '', search = '' } = req.query;

    if (!req.user) {
      return ApiResponse.success(
        res,
        200,
        {
          count: 0,
          items: []
        },
        'Saved MCQs retrieved from MongoDB'
      );
    }

    const filter = { ownerId: req.user._id };

    if (topic && topic !== 'All') {
      filter.topic = topic;
    }
    if (subject && subject !== 'All') {
      filter.subject = subject;
    }
    if (difficulty && difficulty !== 'All') {
      filter.difficulty = difficulty;
    }
    if (status && status !== 'All') {
      filter.status = status;
    }
    if (answerType && answerType !== 'All') {
      filter.answerType = answerType;
    }

    if (search && search.trim()) {
      const qRegex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { question: qRegex },
        { statement: qRegex },
        { topic: qRegex },
        { subject: qRegex }
      ];
    }

    const items = await McqQuestion.find(filter).sort('-createdAt').lean();

    return ApiResponse.success(
      res,
      200,
      {
        count: items.length,
        items
      },
      'Saved MCQs retrieved from MongoDB'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes a single saved MCQ from MongoDB by ID.
 */
export const deleteSavedMcq = async (req, res, next) => {
  try {
    const { id } = req.params;
    const mcq = await McqQuestion.findById(id);
    if (!mcq) {
      throw ApiError.notFound('MCQ question not found');
    }

    const isOwner = req.user && mcq.ownerId.toString() === req.user._id.toString();
    const isAdmin = req.user && req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('You do not have permission to delete this MCQ question.');
    }

    await McqQuestion.findByIdAndDelete(id);
    return ApiResponse.success(res, 200, { id }, 'MCQ deleted from MongoDB');
  } catch (error) {
    next(error);
  }
};

/**
 * Clears all saved MCQs for the teacher from MongoDB.
 */
export const clearSavedMcqs = async (req, res, next) => {
  try {
    if (!req.user) {
      return ApiResponse.success(res, 200, { deletedCount: 0 }, 'No MCQs to clear');
    }
    const filter = { ownerId: req.user._id };
    const result = await McqQuestion.deleteMany(filter);
    return ApiResponse.success(res, 200, { deletedCount: result.deletedCount }, 'All MCQs cleared from MongoDB');
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a single MCQ directly in MongoDB with validation and persistent duplicate check.
 */
export const createSingleMcq = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      throw ApiError.unauthorized('Authentication required to save MCQs.');
    }
    const ownerId = req.user._id;

    // Support modern and legacy payload structure
    const statement = req.body.statement || req.body.question;
    let options = req.body.options;
    let correctAnswers = req.body.correctAnswers;
    const answerType = req.body.answerType || 'single';

    if (!options && (req.body.optionA || req.body.optionB)) {
      options = [
        { id: 'A', text: req.body.optionA || '' },
        { id: 'B', text: req.body.optionB || '' },
        { id: 'C', text: req.body.optionC || '' },
        { id: 'D', text: req.body.optionD || '' }
      ];
    }

    if (!correctAnswers && req.body.correctAnswer) {
      correctAnswers = [String(req.body.correctAnswer).trim().toUpperCase()];
    }

    const candidateData = {
      statement,
      options,
      correctAnswers,
      answerType,
      subject: req.body.subject,
      topic: req.body.topic,
      difficulty: req.body.difficulty,
      style: req.body.style,
      marks: req.body.marks,
      explanation: req.body.explanation
    };

    const validation = validateMcqCandidate(candidateData);
    if (!validation.isValid) {
      throw ApiError.badRequest(`MCQ validation failed: ${validation.errors.join('; ')}`);
    }

    const statementHash = computeMcqStatementHash(validation.data.statement);

    // Persistent duplicate detection for this teacher
    const existing = await McqQuestion.findOne({ ownerId, statementHash });
    if (existing) {
      throw ApiError.conflict('An identical MCQ already exists in your question bank.', {
        existingId: existing._id
      });
    }

    const docToCreate = {
      ownerId,
      statement: validation.data.statement,
      question: validation.data.statement,
      options: validation.data.options,
      correctAnswers: validation.data.correctAnswers,
      answerType: validation.data.answerType,
      subject: req.body.subject || 'Computer Science',
      topic: req.body.topic || 'General',
      difficulty: req.body.difficulty || 'Medium',
      style: req.body.style || 'conceptual',
      bloomTaxonomy: req.body.bloomTaxonomy || 'Understand',
      marks: Number(req.body.marks) || 1,
      explanation: validation.data.explanation,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      status: req.body.status === 'published' ? 'published' : 'draft',
      isAiGenerated: Boolean(req.body.isAiGenerated),
      statementHash
    };

    const created = await McqQuestion.create(docToCreate);

    return ApiResponse.success(res, 201, created, 'MCQ created successfully in MongoDB');
  } catch (error) {
    next(error);
  }
};

/**
 * Updates an existing MCQ by ID in MongoDB.
 */
export const updateSavedMcq = async (req, res, next) => {
  try {
    const { id } = req.params;
    const mcq = await McqQuestion.findById(id);
    if (!mcq) {
      throw ApiError.notFound('MCQ question not found');
    }

    const isOwner = req.user && mcq.ownerId.toString() === req.user._id.toString();
    const isAdmin = req.user && req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('You do not have permission to modify this MCQ question.');
    }

    const updateData = {};
    if (req.body.statement !== undefined || req.body.question !== undefined) {
      const stmt = (req.body.statement || req.body.question).trim();
      updateData.statement = stmt;
      updateData.question = stmt;
      updateData.statementHash = computeMcqStatementHash(stmt);
    }
    if (Array.isArray(req.body.options)) {
      updateData.options = req.body.options;
    }
    if (Array.isArray(req.body.correctAnswers)) {
      updateData.correctAnswers = req.body.correctAnswers;
    }
    if (req.body.optionA !== undefined) updateData.optionA = req.body.optionA.trim();
    if (req.body.optionB !== undefined) updateData.optionB = req.body.optionB.trim();
    if (req.body.optionC !== undefined) updateData.optionC = req.body.optionC.trim();
    if (req.body.optionD !== undefined) updateData.optionD = req.body.optionD.trim();
    if (req.body.correctAnswer !== undefined) {
      updateData.correctAnswer = req.body.correctAnswer.toString().trim().toUpperCase();
    }
    if (req.body.answerType !== undefined) updateData.answerType = req.body.answerType;
    if (req.body.subject !== undefined) updateData.subject = req.body.subject.trim();
    if (req.body.topic !== undefined) updateData.topic = (req.body.topic || 'General').trim();
    if (req.body.difficulty !== undefined) updateData.difficulty = req.body.difficulty;
    if (req.body.style !== undefined) updateData.style = req.body.style;
    if (req.body.marks !== undefined) updateData.marks = Number(req.body.marks) || 1;
    if (req.body.explanation !== undefined) updateData.explanation = (req.body.explanation || '').trim();
    if (req.body.status !== undefined) updateData.status = req.body.status;
    if (Array.isArray(req.body.tags)) updateData.tags = req.body.tags;

    Object.assign(mcq, updateData);
    const updated = await mcq.save();

    return ApiResponse.success(res, 200, updated, 'MCQ updated successfully in MongoDB');
  } catch (error) {
    next(error);
  }
};

/**
 * Atomically batch-saves a set of validated MCQ candidates to MongoDB.
 */
export const batchSaveMcqCandidates = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      throw ApiError.unauthorized('Authentication required to save MCQs.');
    }
    const ownerId = req.user._id;

    const rawList = req.body.candidates || req.body.questions || [];
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw ApiError.badRequest('A non-empty array of candidate MCQs is required in candidates or questions.');
    }

    if (rawList.length > 25) {
      throw ApiError.badRequest('Batch save limit exceeded. Maximum 25 MCQs allowed per batch.');
    }

    const validatedDocs = [];
    const batchHashes = new Set();

    // 1. Validate candidates and check duplicate hashes within the batch
    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const validation = validateMcqCandidate(item);
      if (!validation.isValid) {
        throw ApiError.badRequest(`Candidate #${i + 1} validation failed: ${validation.errors.join('; ')}`);
      }

      const stHash = computeMcqStatementHash(validation.data.statement);
      if (batchHashes.has(stHash)) {
        throw ApiError.badRequest(`Duplicate MCQ statement detected within batch at item #${i + 1}.`);
      }
      batchHashes.add(stHash);

      validatedDocs.push({
        ownerId,
        statement: validation.data.statement,
        question: validation.data.statement,
        options: validation.data.options,
        correctAnswers: validation.data.correctAnswers,
        answerType: validation.data.answerType,
        subject: item.subject || 'Computer Science',
        topic: item.topic || 'General',
        difficulty: item.difficulty || 'Medium',
        style: item.style || 'conceptual',
        bloomTaxonomy: item.bloomTaxonomy || 'Understand',
        marks: Number(item.marks) || 1,
        explanation: validation.data.explanation,
        tags: Array.isArray(item.tags) ? item.tags : [],
        status: item.status === 'published' ? 'published' : 'draft',
        isAiGenerated: true,
        statementHash: stHash
      });
    }

    // 2. Check for persistent duplicates against this teacher's existing collection
    const existingDuplicates = await McqQuestion.find({
      ownerId,
      statementHash: { $in: Array.from(batchHashes) }
    }).select('statement statementHash').lean();

    if (existingDuplicates.length > 0) {
      throw ApiError.conflict(
        `Batch contains ${existingDuplicates.length} candidate(s) that already exist in your question bank.`,
        { duplicateCount: existingDuplicates.length }
      );
    }

    // 3. Atomic persistence using MongoDB transaction with safe fallback
    let session;
    let savedDocs;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      savedDocs = await McqQuestion.create(validatedDocs, { session, ordered: true });
      await session.commitTransaction();
    } catch (txErr) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (_) {}
      }
      if (txErr.message && txErr.message.includes('Transactions are not supported')) {
        savedDocs = await McqQuestion.create(validatedDocs);
      } else {
        throw ApiError.internal('Failed to persist MCQ batch atomically: ' + txErr.message);
      }
    } finally {
      if (session) {
        session.endSession();
      }
    }

    return ApiResponse.success(
      res,
      201,
      savedDocs,
      `Successfully saved ${savedDocs.length} MCQs to question bank.`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Procedural AI Generator for TestPad MCQs.
 */
export const generateMcqBatch = async (req, res, next) => {
  try {
    const {
      topic = 'Data Structures',
      subtopic = '',
      count = 5,
      marks = 1,
      difficulty = 'Medium'
    } = req.body;

    const requestedCount = Math.min(Math.max(Number(count) || 5, 1), 50);
    const itemMarks = Number(marks) || 1;

    let questionsPool = QUESTION_KNOWLEDGE_BASE[topic];
    if (!questionsPool) {
      const match = Object.keys(QUESTION_KNOWLEDGE_BASE).find(
        (k) => k.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(k.toLowerCase())
      );
      questionsPool = match ? QUESTION_KNOWLEDGE_BASE[match] : QUESTION_KNOWLEDGE_BASE['Data Structures'];
    }

    let filtered = questionsPool;
    if (subtopic && subtopic.trim()) {
      const sub = subtopic.trim().toLowerCase();
      const matched = questionsPool.filter(
        (q) => q.q.toLowerCase().includes(sub) || (q.explanation && q.explanation.toLowerCase().includes(sub))
      );
      if (matched.length > 0) filtered = matched;
    }

    const generatedRows = [];
    for (let i = 0; i < requestedCount; i++) {
      const template = filtered[i % filtered.length];
      const rowNumber = i + 1;
      const repeatIdx = Math.floor(i / filtered.length);
      const questionText = repeatIdx > 0 ? `${template.q} (Case ${repeatIdx + 1})` : template.q;

      generatedRows.push({
        rowNumber,
        question: questionText,
        optionA: template.a,
        optionB: template.b,
        optionC: template.c,
        optionD: template.d,
        correctAnswer: template.ans,
        marks: itemMarks,
        topic: topic,
        explanation: template.explanation,
        isValid: true,
        errors: []
      });
    }

    return ApiResponse.success(
      res,
      200,
      {
        summary: {
          total: generatedRows.length,
          valid: generatedRows.length,
          invalid: 0,
          totalMarks: generatedRows.length * itemMarks
        },
        rows: generatedRows
      },
      `Generated ${generatedRows.length} MCQ questions for topic "${topic}"`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Previews and validates an uploaded MCQ batch.
 */
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
      invalid: 0,
      totalMarks: 0
    };

    const seenQuestions = new Set();

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      const errors = [];

      if (!row.question || typeof row.question !== 'string' || row.question.trim().length < 5) {
        errors.push('Question statement is missing or too short (min 5 chars).');
      }

      const normalizedQ = (row.question || '').trim().toLowerCase();
      if (seenQuestions.has(normalizedQ)) {
        errors.push('Duplicate question detected in uploaded batch.');
      } else if (normalizedQ) {
        seenQuestions.add(normalizedQ);
      }

      if (!row.optionA || !String(row.optionA).trim()) errors.push('Option A is missing.');
      if (!row.optionB || !String(row.optionB).trim()) errors.push('Option B is missing.');
      if (!row.optionC || !String(row.optionC).trim()) errors.push('Option C is missing.');
      if (!row.optionD || !String(row.optionD).trim()) errors.push('Option D is missing.');

      const validAnswers = ['A', 'B', 'C', 'D'];
      const answer = (row.correctAnswer || '').toString().trim().toUpperCase();
      if (!validAnswers.includes(answer)) {
        errors.push(`Invalid correct answer "${row.correctAnswer}". Must be one of A, B, C, or D.`);
      }

      const marks = Number(row.marks);
      if (isNaN(marks) || marks <= 0) {
        errors.push('Marks must be a positive number.');
      }

      const isValid = errors.length === 0;
      if (isValid) {
        summary.valid += 1;
        summary.totalMarks += marks || 1;
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
  saveMcqBatch,
  createSingleMcq,
  getSavedMcqs,
  updateSavedMcq,
  deleteSavedMcq,
  clearSavedMcqs,
  previewMcq,
  generateMcqBatch
};
