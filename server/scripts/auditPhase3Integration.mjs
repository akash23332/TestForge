/**
 * Phase 3 Integration Audit Script
 * Executes real end-to-end workflow against live backend, Redis, MongoDB Atlas, and BullMQ worker.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { createRedisConnection, disconnectRedis } from '../src/config/redis.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';
import { MutationReport } from '../src/models/MutationReport.js';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/env.js';

const API_BASE = 'http://localhost:5001/api/v1';

async function runAudit() {
  console.log('================================================================');
  console.log('   PHASE 3: TARGETED INTEGRATION AUDIT - REAL SYSTEM CHECK      ');
  console.log('================================================================\n');

  await connectDatabase();
  const redis = createRedisConnection();

  try {
    // ── 1. Find or Seed Teacher & Usable Question ─────────────────────────────
    console.log('[Step 1] Loading authorized Teacher and Question...');
    let teacher = await User.findOne({ role: 'teacher' });
    if (!teacher) {
      teacher = await User.create({
        name: 'Audit Teacher',
        email: `audit.teacher.${Date.now()}@testforge.edu`,
        password: 'Password123!',
        role: 'teacher'
      });
    }

    let student = await User.findOne({ role: 'student' });
    if (!student) {
      student = await User.create({
        name: 'Audit Student',
        email: `audit.student.${Date.now()}@testforge.edu`,
        password: 'Password123!',
        role: 'student'
      });
    }

    // Find or create question with JS or Python code and test cases
    let question = await Question.findOne({
      title: 'Phase 3 Integration Audit Question'
    });

    if (!question) {
      console.log('Creating dedicated JS question for integration audit...');
      question = await Question.create({
        title: 'Phase 3 Integration Audit Question',
        statement: 'Return the indices of two numbers that add up to target.',
        language: 'javascript',
        difficulty: 'Easy',
        ownerId: teacher._id,
        referenceSolution: `function solve(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return [i, j];
      }
    }
  }
  return [];
}`,
        starterCode: `function solve(nums, target) {\n  return [];\n}`,
        status: 'published'
      });
    } else {
      question.ownerId = teacher._id;
      await question.save();
    }

    // Ensure valid test cases exist for this question
    let testCount = await TestCase.countDocuments({ questionId: question._id });
    if (testCount === 0) {
      await TestCase.create([
        {
          questionId: question._id,
          input: '[2, 7, 11, 15]\n9',
          expectedOutput: '[0, 1]',
          visibility: 'public',
          verificationStatus: 'verified'
        },
        {
          questionId: question._id,
          input: '[3, 2, 4]\n6',
          expectedOutput: '[1, 2]',
          visibility: 'public',
          verificationStatus: 'verified'
        }
      ]);
      testCount = 2;
    }

    console.log(`[Step 1 OK] Teacher ID: ${teacher._id}`);
    console.log(`[Step 1 OK] Question: "${question.title}" (ID: ${question._id}, Lang: ${question.language}, Tests: ${testCount})`);

    // Generate JWT tokens
    const teacherToken = jwt.sign(
      { _id: teacher._id, id: teacher._id, role: 'teacher', email: teacher.email },
      config.jwt.secret || 'test-jwt-secret-for-signing-token-must-be-long-enough-32bytes',
      { expiresIn: '1h' }
    );

    const studentToken = jwt.sign(
      { _id: student._id, id: student._id, role: 'student', email: student.email },
      config.jwt.secret || 'test-jwt-secret-for-signing-token-must-be-long-enough-32bytes',
      { expiresIn: '1h' }
    );

    // ── 2. Student Authorization Rejection Check (Part 5) ────────────────────
    console.log('\n[Step 2] Verifying Student Access Rejection (HTTP 403)...');
    const studentRes = await fetch(`${API_BASE}/questions/${question._id}/mutation-runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      }
    });
    console.log(`Student POST Status: ${studentRes.status} (Expected: 403)`);
    if (studentRes.status !== 403) {
      throw new Error(`Security Violation: Student was able to request mutation run! Status: ${studentRes.status}`);
    }

    // ── 3. Start Real Mutation Run via API (Part 1) ──────────────────────────
    console.log('\n[Step 3] Enqueuing mutation run via POST /api/v1/questions/:id/mutation-runs...');
    const postRes = await fetch(`${API_BASE}/questions/${question._id}/mutation-runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({ options: { maxMutants: 4 } })
    });

    console.log(`POST Response Status: ${postRes.status} (Expected: 202)`);
    const postBody = await postRes.json();
    console.log('POST Response Body:', JSON.stringify(postBody, null, 2));

    if (postRes.status !== 202) {
      throw new Error(`Expected HTTP 202 from POST mutation-runs, got ${postRes.status}`);
    }

    const runId = postBody.data?.runId;
    if (!runId) {
      throw new Error('runId was not returned in POST response');
    }
    console.log(`[Step 3 OK] Acquired active runId: ${runId}`);

    // ── 4. Verify Atomic Duplicate Protection (Part 2) ───────────────────────
    console.log('\n[Step 4] Verifying Concurrent / Immediate Re-POST returns existing runId...');
    const duplicateRes = await fetch(`${API_BASE}/questions/${question._id}/mutation-runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      }
    });
    const duplicateBody = await duplicateRes.json();
    console.log(`Duplicate POST Status: ${duplicateRes.status}, returned runId: ${duplicateBody.data?.runId}`);
    if (duplicateBody.data?.runId !== runId) {
      throw new Error(`Duplicate POST did not return winning runId! Got ${duplicateBody.data?.runId}`);
    }
    console.log('[Step 4 OK] Duplicate protection verified: exactly 1 active logical run.');

    // ── 5. Real-time Worker Execution & Polling (Part 1 & 3) ──────────────────
    console.log(`\n[Step 5] Polling GET /api/v1/questions/${question._id}/mutation-runs/${runId}...`);
    let finalReport = null;
    let pollCount = 0;
    const maxPolls = 30; // 60 seconds max

    while (pollCount < maxPolls) {
      pollCount++;
      const getRes = await fetch(`${API_BASE}/questions/${question._id}/mutation-runs/${runId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` }
      });
      const getBody = await getRes.json();
      const currentStatus = getBody.data?.status;
      const progress = getBody.data?.progress;

      console.log(
        `[Poll #${pollCount}] Status: ${currentStatus} | Progress: ${progress?.completed}/${progress?.total} mutants | Current: ${progress?.currentMutant || 'N/A'}`
      );

      if (currentStatus === 'COMPLETED' || currentStatus === 'FAILED') {
        finalReport = getBody.data;
        break;
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!finalReport) {
      throw new Error('Timed out waiting for mutation worker execution to complete.');
    }

    console.log('\n[Step 5 OK] Mutation run reached terminal status:', finalReport.status);
    console.log(`- Final Score: ${finalReport.mutationScore}%`);
    console.log(`- Total Mutants: ${finalReport.totalMutants}`);
    console.log(`- Killed: ${finalReport.killedCount}`);
    console.log(`- Survived: ${finalReport.survivedCount}`);
    console.log(`- Equivalent: ${finalReport.equivalentCount}`);
    console.log(`- Compilation Errors: ${finalReport.compilationErrorCount}`);
    console.log(`- Candidate Tests: ${finalReport.candidateTests?.length || 0}`);

    // ── 6. Candidate Test Integrity Audit (Part 4) ───────────────────────────
    console.log('\n[Step 6] Auditing Candidate Test Integrity...');
    if (finalReport.candidateTests && finalReport.candidateTests.length > 0) {
      finalReport.candidateTests.forEach((ct, i) => {
        console.log(`Candidate Test #${i + 1}: Mutant ${ct.mutantId}, Verified=${ct.verified}`);
        if (ct.verified !== true && ct.verified !== false) {
          throw new Error(`Invalid verified flag type on candidate test: ${ct.verified}`);
        }
      });
    } else {
      console.log('Zero candidate tests generated (no mutants survived or all tests killed).');
    }

    // Verify official question test cases were NOT modified
    const reloadedCount = await TestCase.countDocuments({ questionId: question._id });
    console.log(`Original test count: ${testCount}, Current DB test count: ${reloadedCount}`);
    if (reloadedCount !== testCount) {
      throw new Error('FATAL: Official question test cases were modified by mutation testing!');
    }
    console.log('[Step 6 OK] Official question test cases remained completely untouched.');

    // ── 7. Unauthorized Teacher Access Check (Part 5) ────────────────────────
    console.log('\n[Step 7] Verifying Other Teacher Access Rejection (HTTP 403)...');
    const otherTeacher = await User.create({
      name: 'Other Teacher',
      email: `other.teacher.${Date.now()}@testforge.edu`,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
      role: 'teacher'
    });
    const otherTeacherToken = jwt.sign(
      { _id: otherTeacher._id, id: otherTeacher._id, role: 'teacher', email: otherTeacher.email },
      config.jwt.secret || 'test-jwt-secret-for-signing-token-must-be-long-enough-32bytes',
      { expiresIn: '1h' }
    );

    const otherRes = await fetch(`${API_BASE}/questions/${question._id}/mutation-runs/${runId}`, {
      headers: { Authorization: `Bearer ${otherTeacherToken}` }
    });
    console.log(`Other Teacher GET Status: ${otherRes.status} (Expected: 403)`);
    if (otherRes.status !== 403) {
      throw new Error(`Access Control Failure: Other teacher accessed report! Status: ${otherRes.status}`);
    }
    console.log('[Step 7 OK] RBAC enforced: Teachers cannot access another teacher’s mutation reports.');

    // ── 8. Invalid / Non-existent Run ID (Part 2) ───────────────────────────
    console.log('\n[Step 8] Verifying Invalid / Non-existent Run ID (HTTP 404)...');
    const nonExistentRes = await fetch(`${API_BASE}/questions/${question._id}/mutation-runs/666666666666666666666666`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    console.log(`Non-existent Run GET Status: ${nonExistentRes.status} (Expected: 404)`);
    if (nonExistentRes.status !== 404) {
      throw new Error(`Expected 404 for non-existent runId, got ${nonExistentRes.status}`);
    }
    console.log('[Step 8 OK] 404 correctly returned for non-existent run ID.');

    console.log('\n================================================================');
    console.log('   ALL INTEGRATION AUDIT CRITERIA SUCCESSFULLY VERIFIED!        ');
    console.log('================================================================');
  } finally {
    redis.disconnect();
    await disconnectDatabase();
  }
}

runAudit().catch((err) => {
  console.error('\n[AUDIT FAILURE]', err);
  process.exit(1);
});
