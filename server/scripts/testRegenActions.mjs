import jwt from 'jsonwebtoken';
import { config } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';

async function main() {
  await connectDatabase();
  const teacher = await User.findOne({ role: { $in: ['teacher', 'admin'] } });
  console.log('Using real teacher ID:', teacher._id);

  const token = jwt.sign(
    { id: teacher._id, email: teacher.email, role: teacher.role },
    config.jwt.secret,
    { expiresIn: '1h' }
  );

  console.log('--- Testing action: referenceSolution ---');
  let res = await fetch('http://localhost:5001/api/v1/ai/regenerate-section', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      action: 'referenceSolution',
      currentQuestion: {
        title: 'Two Sum',
        statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'twoSum',
        referenceSolution: 'def twoSum(nums, target): return [0, 1]',
        sampleTestCase: { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]' }
      }
    })
  });
  console.log('Status referenceSolution:', res.status);
  let data = await res.json();
  console.log('referenceSolution data:', JSON.stringify(data, null, 2));

  console.log('\n--- Testing action: entireQuestion ---');
  res = await fetch('http://localhost:5001/api/v1/ai/regenerate-section', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      action: 'entireQuestion',
      currentQuestion: {
        title: 'Two Sum',
        statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
        difficulty: 'Easy',
        language: 'python',
        executionMode: 'FUNCTION',
        functionName: 'twoSum',
        tags: ['Array', 'Two Pointers'],
        referenceSolution: 'def twoSum(nums, target): return [0, 1]',
        sampleTestCase: { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]' }
      }
    })
  });
  console.log('Status entireQuestion:', res.status);
  data = await res.json();
  console.log('entireQuestion previewData:', JSON.stringify(data?.data?.previewData ? {
    title: data.data.previewData.title,
    statement: data.data.previewData.statement?.slice(0, 60),
    action: data.data.action
  } : data, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
