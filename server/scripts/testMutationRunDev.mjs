import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { MutationReport } from '../src/models/MutationReport.js';
import { enqueueMutationJob } from '../src/services/queue/mutationQueue.js';

async function main() {
  await connectDatabase();

  const question = await Question.findOne({ referenceSolution: { $exists: true, $ne: '' } }).sort({ createdAt: -1 });
  if (!question) {
    console.log('No question found with referenceSolution');
    await disconnectDatabase();
    return;
  }

  const tcCount = await TestCase.countDocuments({ questionId: question._id });
  console.log(`Testing with Question: ${question.title} (${question._id}), TestCases: ${tcCount}`);

  // Create report
  const report = await MutationReport.create({
    questionId: question._id,
    teacherId: question.ownerId,
    status: 'PENDING',
    activeLock: question._id.toString(),
    totalMutants: 0,
    progress: { total: 0, completed: 0, currentMutant: 0, currentTestCase: 0 }
  });

  console.log(`Created MutationReport: ${report._id}`);

  // Enqueue job via enqueueMutationJob (development in-memory fallback / watchdog)
  console.log('Calling enqueueMutationJob...');
  await enqueueMutationJob({
    reportId: report._id,
    questionId: question._id,
    teacherId: question.ownerId,
    options: { maxMutants: 5 }
  });

  // Poll for completion
  console.log('Waiting for background processing to finish...');
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const polled = await MutationReport.findById(report._id).lean();
    console.log(`[Poll ${i + 1}s] Status: ${polled.status}, Mutants: ${polled.totalMutants}, Progress: ${polled.progress?.completed}/${polled.progress?.total}`);
    if (polled.status === 'COMPLETED' || polled.status === 'FAILED') {
      console.log('Run finished with status:', polled.status, 'Score:', polled.mutationScore);
      break;
    }
  }

  await disconnectDatabase();
}

main();
