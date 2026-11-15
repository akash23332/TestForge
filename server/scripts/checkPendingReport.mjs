import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { MutationReport } from '../src/models/MutationReport.js';

async function main() {
  await connectDatabase();
  const reports = await MutationReport.find({ status: { $in: ['PENDING', 'RUNNING'] } })
    .sort({ createdAt: -1 })
    .lean();

  console.log('ACTIVE_OR_PENDING_REPORTS:', reports.length);
  for (const r of reports) {
    console.log(JSON.stringify({
      id: r._id,
      questionId: r.questionId,
      status: r.status,
      activeLock: r.activeLock,
      createdAt: r.createdAt,
      progress: r.progress
    }, null, 2));
  }

  // Also check the most recent 3 reports overall
  const recentReports = await MutationReport.find().sort({ createdAt: -1 }).limit(3).lean();
  console.log('MOST_RECENT_3_REPORTS:');
  for (const r of recentReports) {
    console.log(JSON.stringify({
      id: r._id,
      questionId: r.questionId,
      status: r.status,
      activeLock: r.activeLock,
      createdAt: r.createdAt,
      totalMutants: r.totalMutants,
      killedCount: r.killedCount,
      survivedCount: r.survivedCount,
      progress: r.progress
    }, null, 2));
  }

  await disconnectDatabase();
}

main();
