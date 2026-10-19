import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';

const seed = async () => {
  try {
    console.log('[Seed] Connecting to MongoDB...');
    await connectDatabase();

    console.log('[Seed] Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Question.deleteMany({}),
      TestCase.deleteMany({})
    ]);

    console.log('[Seed] Creating demo teacher user...');
    const passwordHash = await User.hashPassword('Teacher@123');
    const teacher = await User.create({
      name: 'Dr. Sarah Mitchell',
      email: 'teacher@testforge.edu',
      passwordHash,
      role: 'teacher'
    });

    console.log(`[Seed] Created teacher: ${teacher.email}`);

    // Create Sample Questions
    const questionsData = [
      {
        ownerId: teacher._id,
        title: 'Two Sum',
        difficulty: 'Easy',
        language: 'javascript',
        tags: ['Array', 'Hash Table', 'Algorithms'],
        statement: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
        constraints: '• 2 <= nums.length <= 10^4\n• -10^9 <= nums[i] <= 10^9\n• -10^9 <= target <= 10^9\n• Only one valid answer exists.',
        examples: [
          {
            input: 'nums = [2,7,11,15], target = 9',
            output: '[0,1]',
            explanation: 'Because nums[0] + nums[1] == 9, we return [0, 1].'
          },
          {
            input: 'nums = [3,2,4], target = 6',
            output: '[1,2]',
            explanation: 'nums[1] + nums[2] == 6, we return [1, 2].'
          }
        ],
        starterCode: 'function twoSum(nums, target) {\n  // Write your code here\n}',
        referenceSolution: 'function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}',
        status: 'published'
      },
      {
        ownerId: teacher._id,
        title: 'Valid Parentheses',
        difficulty: 'Easy',
        language: 'javascript',
        tags: ['Stack', 'Strings'],
        statement: 'Given a string `s` containing just the characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.',
        constraints: '• 1 <= s.length <= 10^4\n• `s` consists of parentheses only `()[]{}`.',
        examples: [
          {
            input: 's = "()"',
            output: 'true',
            explanation: 'Matching round brackets.'
          },
          {
            input: 's = "([)]"',
            output: 'false',
            explanation: 'Improperly interleaved brackets.'
          }
        ],
        starterCode: 'function isValid(s) {\n  // Implement stack validation\n}',
        referenceSolution: 'function isValid(s) {\n  const stack = [];\n  const pairs = { ")": "(", "}": "{", "]": "[" };\n  for (const char of s) {\n    if (char === "(" || char === "{" || char === "[") {\n      stack.push(char);\n    } else if (stack.pop() !== pairs[char]) {\n      return false;\n    }\n  }\n  return stack.length === 0;\n}',
        status: 'published'
      },
      {
        ownerId: teacher._id,
        title: 'Binary Search',
        difficulty: 'Medium',
        language: 'javascript',
        tags: ['Binary Search', 'Array'],
        statement: 'Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return `-1`.\n\nYou must write an algorithm with `O(log n)` runtime complexity.',
        constraints: '• 1 <= nums.length <= 10^4\n• -10^4 < nums[i], target < 10^4\n• All the integers in nums are unique.\n• `nums` is sorted in ascending order.',
        examples: [
          {
            input: 'nums = [-1,0,3,5,9,12], target = 9',
            output: '4',
            explanation: '9 exists in nums and its index is 4'
          }
        ],
        starterCode: 'function search(nums, target) {\n  // O(log n) solution\n}',
        referenceSolution: 'function search(nums, target) {\n  let left = 0;\n  let right = nums.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}',
        status: 'published'
      }
    ];

    const createdQuestions = await Question.insertMany(questionsData);
    console.log(`[Seed] Created ${createdQuestions.length} questions.`);

    // Create Test Cases for Two Sum
    const twoSumQ = createdQuestions[0];
    await TestCase.insertMany([
      {
        questionId: twoSumQ._id,
        input: '[2, 7, 11, 15], 9',
        expectedOutput: '[0, 1]',
        category: 'sample',
        visibility: 'public',
        verificationStatus: 'verified'
      },
      {
        questionId: twoSumQ._id,
        input: '[3, 2, 4], 6',
        expectedOutput: '[1, 2]',
        category: 'sample',
        visibility: 'public',
        verificationStatus: 'verified'
      },
      {
        questionId: twoSumQ._id,
        input: '[3, 3], 6',
        expectedOutput: '[0, 1]',
        category: 'boundary',
        visibility: 'hidden', // Secret test case!
        verificationStatus: 'verified'
      },
      {
        questionId: twoSumQ._id,
        input: '[-1, -2, -3, -4, -5], -8',
        expectedOutput: '[2, 4]',
        category: 'edge_case',
        visibility: 'hidden', // Secret test case!
        verificationStatus: 'verified'
      }
    ]);

    console.log('[Seed] Created test cases for Two Sum (public + hidden).');

    console.log('\x1b[32m✔ [Seed] Database seeding completed successfully!\x1b[0m');
    console.log('Credentials: teacher@testforge.edu / Teacher@123');
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error seeding database:', err);
    process.exit(1);
  }
};

seed();
