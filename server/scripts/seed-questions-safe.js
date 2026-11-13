import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { Question } from '../src/models/Question.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';

const questionsSeed = [
  {
    _id: new mongoose.Types.ObjectId('6ad7548ed80722492f11f4c1'),
    title: 'Two Sum',
    difficulty: 'Easy',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    language: 'javascript',
    tags: ['Array', 'Hash Table', 'Algorithms'],
    statement: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.',
    constraints: '• 2 <= nums.length <= 10^4\n• -10^9 <= nums[i] <= 10^9\n• -10^9 <= target <= 10^9\n• Exactly one valid solution exists.',
    starterCode: 'function solution(nums, target) {\n  // Write your code here\n  return [0, 1];\n}',
    referenceSolution: 'function solution(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}',
    starterCodes: {
      javascript: 'function solution(nums, target) {\n  // Write your code here\n  return [0, 1];\n}',
      python: 'def solution(nums, target):\n    # Write your code here\n    return [0, 1]',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> solution(vector<int>& nums, int target) {\n        return {0, 1};\n    }\n};',
      java: 'import java.util.*;\n\nclass Solution {\n    public int[] solution(int[] nums, int target) {\n        return new int[]{0, 1};\n    }\n}'
    },
    referenceSolutions: {
      javascript: 'function solution(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}',
      python: 'def solution(nums, target):\n    lookup = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in lookup:\n            return [lookup[diff], i]\n        lookup[num] = i\n    return []',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> solution(vector<int>& nums, int target) {\n        unordered_map<int, int> mp;\n        for (int i = 0; i < (int)nums.size(); i++) {\n            int diff = target - nums[i];\n            if (mp.count(diff)) return {mp[diff], i};\n            mp[nums[i]] = i;\n        }\n        return {};\n    }\n};',
      java: 'import java.util.*;\n\nclass Solution {\n    public int[] solution(int[] nums, int target) {\n        Map<Integer, Integer> map = new HashMap<>();\n        for (int i = 0; i < nums.length; i++) {\n            int diff = target - nums[i];\n            if (map.containsKey(diff)) {\n                return new int[]{map.get(diff), i};\n            }\n            map.put(nums[i], i);\n        }\n        return new int[]{};\n    }\n}'
    },
    status: 'published',
    validationSummary: {
      referenceSolutionStatus: 'PASS',
      expectedOutputStatus: 'VERIFIED',
      testQualityStatus: 'ADEQUATE',
      publishingStatus: 'READY'
    },
    tests: [
      { input: '[2, 7, 11, 15]\n9', expectedOutput: '[0, 1]', category: 'sample', visibility: 'public' },
      { input: '[3, 2, 4]\n6', expectedOutput: '[1, 2]', category: 'sample', visibility: 'public' },
      { input: '[3, 3]\n6', expectedOutput: '[0, 1]', category: 'edge_case', visibility: 'hidden' }
    ]
  },
  {
    _id: new mongoose.Types.ObjectId('6ad74f8ed80722492f11f45a'),
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    executionMode: 'STDIN',
    functionName: 'solution',
    language: 'javascript',
    tags: ['Stack', 'String', 'Algorithms'],
    statement: 'Given a string `s` containing just the characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.',
    constraints: '• 1 <= s.length <= 10^4\n• s consists of parentheses only ()[]{}.',
    starterCode: 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\n// Write your solution here\nconsole.log(true);',
    referenceSolution: 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\nconst pairs = { ")": "(", "}": "{", "]": "[" };\nconst stack = [];\nlet ok = true;\nfor (const ch of input) {\n  if (ch === "(" || ch === "{" || ch === "[") stack.push(ch);\n  else if (stack.pop() !== pairs[ch]) { ok = false; break; }\n}\nif (stack.length > 0) ok = false;\nconsole.log(ok ? "true" : "false");',
    starterCodes: {
      javascript: 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\nconsole.log(true);',
      python: 'import sys\ns = sys.stdin.read().strip()\nprint("true")',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    string s;\n    if (cin >> s) cout << "true" << endl;\n    return 0;\n}',
      java: 'import java.util.*;\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNext()) sc.next();\n        System.out.println("true");\n    }\n}'
    },
    referenceSolutions: {
      javascript: 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\nconst pairs = { ")": "(", "}": "{", "]": "[" };\nconst stack = [];\nlet ok = true;\nfor (const ch of input) {\n  if (ch === "(" || ch === "{" || ch === "[") stack.push(ch);\n  else if (stack.pop() !== pairs[ch]) { ok = false; break; }\n}\nif (stack.length > 0) ok = false;\nconsole.log(ok ? "true" : "false");',
      python: 'import sys\ns = sys.stdin.read().strip()\npairs = {")": "(", "}": "{", "]": "["}\nstack = []\nok = True\nfor ch in s:\n    if ch in "({[":\n        stack.append(ch)\n    elif not stack or stack.pop() != pairs.get(ch):\n        ok = False\n        break\nif stack:\n    ok = False\nprint("true" if ok else "false")',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    string s;\n    if (!(cin >> s)) { cout << "true" << endl; return 0; }\n    stack<char> st;\n    bool ok = true;\n    for (char c : s) {\n        if (c == \'(\' || c == \'{\' || c == \'[\') st.push(c);\n        else {\n            if (st.empty()) { ok = false; break; }\n            char top = st.top(); st.pop();\n            if ((c == \')\' && top != \'(\') || (c == \'}\' && top != \'{\') || (c == \']\' && top != \'[\')) { ok = false; break; }\n        }\n    }\n    if (!st.empty()) ok = false;\n    cout << (ok ? "true" : "false") << endl;\n    return 0;\n}',
      java: 'import java.util.*;\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNext()) { System.out.println("true"); return; }\n        String s = sc.next();\n        Stack<Character> st = new Stack<>();\n        boolean ok = true;\n        for (char c : s.toCharArray()) {\n            if (c == \'(\' || c == \'{\' || c == \'[\') st.push(c);\n            else {\n                if (st.isEmpty()) { ok = false; break; }\n                char top = st.pop();\n                if ((c == \')\' && top != \'(\') || (c == \'}\' && top != \'{\') || (c == \']\' && top != \'[\')) { ok = false; break; }\n            }\n        }\n        if (!st.isEmpty()) ok = false;\n        System.out.println(ok ? "true" : "false");\n    }\n}'
    },
    status: 'published',
    validationSummary: {
      referenceSolutionStatus: 'PASS',
      expectedOutputStatus: 'VERIFIED',
      testQualityStatus: 'ADEQUATE',
      publishingStatus: 'READY'
    },
    tests: [
      { input: '()', expectedOutput: 'true', category: 'sample', visibility: 'public' },
      { input: '()[]{}', expectedOutput: 'true', category: 'sample', visibility: 'public' },
      { input: '(]', expectedOutput: 'false', category: 'sample', visibility: 'public' },
      { input: '([)]', expectedOutput: 'false', category: 'edge_case', visibility: 'hidden' }
    ]
  },
  {
    _id: new mongoose.Types.ObjectId('6ad60d148f430fd69b230cc8'),
    title: 'Valid Anagram',
    difficulty: 'Easy',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    language: 'javascript',
    tags: ['Hash Table', 'String', 'Sorting'],
    statement: 'Given two strings `s` and `t`, return `true` if `t` is an anagram of `s`, and `false` otherwise.\n\nAn Anagram is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.',
    constraints: '• 1 <= s.length, t.length <= 5 * 10^4\n• s and t consist of lowercase English letters.',
    starterCode: 'function solution(s, t) {\n  // Write your code here\n  return true;\n}',
    referenceSolution: 'function solution(s, t) {\n  if (s.length !== t.length) return false;\n  const count = {};\n  for (const c of s) count[c] = (count[c] || 0) + 1;\n  for (const c of t) {\n    if (!count[c]) return false;\n    count[c]--;\n  }\n  return true;\n}',
    starterCodes: {
      javascript: 'function solution(s, t) {\n  return true;\n}',
      python: 'def solution(s, t):\n    return True',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    bool solution(string s, string t) {\n        return true;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public boolean solution(String s, String t) {\n        return true;\n    }\n}'
    },
    referenceSolutions: {
      javascript: 'function solution(s, t) {\n  if (s.length !== t.length) return false;\n  const count = {};\n  for (const c of s) count[c] = (count[c] || 0) + 1;\n  for (const c of t) {\n    if (!count[c]) return false;\n    count[c]--;\n  }\n  return true;\n}',
      python: 'def solution(s, t):\n    if len(s) != len(t): return False\n    from collections import Counter\n    return Counter(s) == Counter(t)',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    bool solution(string s, string t) {\n        if (s.size() != t.size()) return false;\n        vector<int> cnt(26, 0);\n        for (char c : s) cnt[c - \'a\']++;\n        for (char c : t) if (--cnt[c - \'a\'] < 0) return false;\n        return true;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public boolean solution(String s, String t) {\n        if (s.length() != t.length()) return false;\n        int[] count = new int[26];\n        for (char c : s.toCharArray()) count[c - \'a\']++;\n        for (char c : t.toCharArray()) if (--count[c - \'a\'] < 0) return false;\n        return true;\n    }\n}'
    },
    status: 'published',
    validationSummary: {
      referenceSolutionStatus: 'PASS',
      expectedOutputStatus: 'VERIFIED',
      testQualityStatus: 'ADEQUATE',
      publishingStatus: 'READY'
    },
    tests: [
      { input: 'anagram\nnagaram', expectedOutput: 'true', category: 'sample', visibility: 'public' },
      { input: 'rat\ncar', expectedOutput: 'false', category: 'sample', visibility: 'public' },
      { input: 'listen\nsilent', expectedOutput: 'true', category: 'edge_case', visibility: 'hidden' }
    ]
  },
  {
    _id: new mongoose.Types.ObjectId('6ad60487e7f63fd402bf5ee1'),
    title: 'Binary Search',
    difficulty: 'Easy',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    language: 'javascript',
    tags: ['Array', 'Binary Search', 'Algorithms'],
    statement: 'Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return `-1`.\n\nYou must write an algorithm with `O(log n)` runtime complexity.',
    constraints: '• 1 <= nums.length <= 10^4\n• -10^4 < nums[i], target < 10^4\n• All the integers in nums are unique.\n• nums is sorted in ascending order.',
    starterCode: 'function solution(nums, target) {\n  // Write your code here\n  return -1;\n}',
    referenceSolution: 'function solution(nums, target) {\n  let left = 0, right = nums.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}',
    starterCodes: {
      javascript: 'function solution(nums, target) {\n  return -1;\n}',
      python: 'def solution(nums, target):\n    return -1',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    int solution(vector<int>& nums, int target) {\n        return -1;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public int solution(int[] nums, int target) {\n        return -1;\n    }\n}'
    },
    referenceSolutions: {
      javascript: 'function solution(nums, target) {\n  let left = 0, right = nums.length - 1;\n  while (left <= right) {\n    const mid = Math.floor((left + right) / 2);\n    if (nums[mid] === target) return mid;\n    if (nums[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}',
      python: 'def solution(nums, target):\n    left, right = 0, len(nums) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if nums[mid] == target: return mid\n        elif nums[mid] < target: left = mid + 1\n        else: right = mid - 1\n    return -1',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    int solution(vector<int>& nums, int target) {\n        int l = 0, r = (int)nums.size() - 1;\n        while (l <= r) {\n            int m = l + (r - l) / 2;\n            if (nums[m] == target) return m;\n            if (nums[m] < target) l = m + 1;\n            else r = m - 1;\n        }\n        return -1;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public int solution(int[] nums, int target) {\n        int l = 0, r = nums.length - 1;\n        while (l <= r) {\n            int m = l + (r - l) / 2;\n            if (nums[m] == target) return m;\n            if (nums[m] < target) l = m + 1;\n            else r = m - 1;\n        }\n        return -1;\n    }\n}'
    },
    status: 'published',
    validationSummary: {
      referenceSolutionStatus: 'PASS',
      expectedOutputStatus: 'VERIFIED',
      testQualityStatus: 'ADEQUATE',
      publishingStatus: 'READY'
    },
    tests: [
      { input: '[-1, 0, 3, 5, 9, 12]\n9', expectedOutput: '4', category: 'sample', visibility: 'public' },
      { input: '[-1, 0, 3, 5, 9, 12]\n2', expectedOutput: '-1', category: 'sample', visibility: 'public' },
      { input: '[5]\n5', expectedOutput: '0', category: 'edge_case', visibility: 'hidden' }
    ]
  },
  {
    _id: new mongoose.Types.ObjectId('6ad9ed641f6f202cf318f235'),
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    language: 'javascript',
    tags: ['Hash Table', 'String', 'Sliding Window'],
    statement: 'Given a string `s`, find the length of the longest substring without duplicate characters.',
    constraints: '• 0 <= s.length <= 5 * 10^4\n• s consists of English letters, digits, symbols and spaces.',
    starterCode: 'function solution(s) {\n  // Write your code here\n  return 0;\n}',
    referenceSolution: 'function solution(s) {\n  let maxLen = 0, start = 0;\n  const map = new Map();\n  for (let i = 0; i < s.length; i++) {\n    if (map.has(s[i]) && map.get(s[i]) >= start) {\n      start = map.get(s[i]) + 1;\n    }\n    map.set(s[i], i);\n    maxLen = Math.max(maxLen, i - start + 1);\n  }\n  return maxLen;\n}',
    starterCodes: {
      javascript: 'function solution(s) {\n  return 0;\n}',
      python: 'def solution(s):\n    return 0',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    int solution(string s) {\n        return 0;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public int solution(String s) {\n        return 0;\n    }\n}'
    },
    referenceSolutions: {
      javascript: 'function solution(s) {\n  let maxLen = 0, start = 0;\n  const map = new Map();\n  for (let i = 0; i < s.length; i++) {\n    if (map.has(s[i]) && map.get(s[i]) >= start) {\n      start = map.get(s[i]) + 1;\n    }\n    map.set(s[i], i);\n    maxLen = Math.max(maxLen, i - start + 1);\n  }\n  return maxLen;\n}',
      python: 'def solution(s):\n    max_len = 0\n    start = 0\n    used = {}\n    for i, ch in enumerate(s):\n        if ch in used and start <= used[ch]:\n            start = used[ch] + 1\n        else:\n            max_len = max(max_len, i - start + 1)\n        used[ch] = i\n    return max_len',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    int solution(string s) {\n        vector<int> pos(256, -1);\n        int maxLen = 0, start = -1;\n        for (int i = 0; i < (int)s.size(); i++) {\n            if (pos[(unsigned char)s[i]] > start) start = pos[(unsigned char)s[i]];\n            pos[(unsigned char)s[i]] = i;\n            maxLen = max(maxLen, i - start);\n        }\n        return maxLen;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public int solution(String s) {\n        int[] pos = new int[256];\n        Arrays.fill(pos, -1);\n        int maxLen = 0, start = -1;\n        for (int i = 0; i < s.length(); i++) {\n            char c = s.charAt(i);\n            if (pos[c] > start) start = pos[c];\n            pos[c] = i;\n            maxLen = Math.max(maxLen, i - start);\n        }\n        return maxLen;\n    }\n}'
    },
    status: 'published',
    validationSummary: {
      referenceSolutionStatus: 'PASS',
      expectedOutputStatus: 'VERIFIED',
      testQualityStatus: 'ADEQUATE',
      publishingStatus: 'READY'
    },
    tests: [
      { input: 'abcabcbb', expectedOutput: '3', category: 'sample', visibility: 'public' },
      { input: 'bbbbb', expectedOutput: '1', category: 'sample', visibility: 'public' },
      { input: 'pwwkew', expectedOutput: '3', category: 'sample', visibility: 'public' },
      { input: 'dvdf', expectedOutput: '3', category: 'edge_case', visibility: 'hidden' }
    ]
  },
  {
    _id: new mongoose.Types.ObjectId('6ad9ec291f6f202cf318f203'),
    title: 'Maximum Subarray Sum',
    difficulty: 'Medium',
    executionMode: 'FUNCTION',
    functionName: 'solution',
    language: 'javascript',
    tags: ['Array', 'Dynamic Programming', 'Divide and Conquer'],
    statement: 'Given an integer array `nums`, find the subarray with the largest sum, and return its sum.',
    constraints: '• 1 <= nums.length <= 10^5\n• -10^4 <= nums[i] <= 10^4',
    starterCode: 'function solution(nums) {\n  // Write your code here\n  return 0;\n}',
    referenceSolution: 'function solution(nums) {\n  let maxSoFar = nums[0];\n  let currMax = nums[0];\n  for (let i = 1; i < nums.length; i++) {\n    currMax = Math.max(nums[i], currMax + nums[i]);\n    maxSoFar = Math.max(maxSoFar, currMax);\n  }\n  return maxSoFar;\n}',
    starterCodes: {
      javascript: 'function solution(nums) {\n  return 0;\n}',
      python: 'def solution(nums):\n    return 0',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    int solution(vector<int>& nums) {\n        return 0;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public int solution(int[] nums) {\n        return 0;\n    }\n}'
    },
    referenceSolutions: {
      javascript: 'function solution(nums) {\n  let maxSoFar = nums[0];\n  let currMax = nums[0];\n  for (let i = 1; i < nums.length; i++) {\n    currMax = Math.max(nums[i], currMax + nums[i]);\n    maxSoFar = Math.max(maxSoFar, currMax);\n  }\n  return maxSoFar;\n}',
      python: 'def solution(nums):\n    max_so_far = nums[0]\n    curr_max = nums[0]\n    for x in nums[1:]:\n        curr_max = max(x, curr_max + x)\n        max_so_far = max(max_so_far, curr_max)\n    return max_so_far',
      cpp: '#include <bits/stdc++.h>\nusing namespace std;\nclass Solution {\npublic:\n    int solution(vector<int>& nums) {\n        int maxSoFar = nums[0], currMax = nums[0];\n        for (int i = 1; i < (int)nums.size(); i++) {\n            currMax = max(nums[i], currMax + nums[i]);\n            maxSoFar = max(maxSoFar, currMax);\n        }\n        return maxSoFar;\n    }\n};',
      java: 'import java.util.*;\nclass Solution {\n    public int solution(int[] nums) {\n        int maxSoFar = nums[0], currMax = nums[0];\n        for (int i = 1; i < nums.length; i++) {\n            currMax = Math.max(nums[i], currMax + nums[i]);\n            maxSoFar = Math.max(maxSoFar, currMax);\n        }\n        return maxSoFar;\n    }\n}'
    },
    status: 'published',
    validationSummary: {
      referenceSolutionStatus: 'PASS',
      expectedOutputStatus: 'VERIFIED',
      testQualityStatus: 'ADEQUATE',
      publishingStatus: 'READY'
    },
    tests: [
      { input: '[-2, 1, -3, 4, -1, 2, 1, -5, 4]', expectedOutput: '6', category: 'sample', visibility: 'public' },
      { input: '[1]', expectedOutput: '1', category: 'sample', visibility: 'public' },
      { input: '[5, 4, -1, 7, 8]', expectedOutput: '23', category: 'sample', visibility: 'public' },
      { input: '[-1, -2, -3]', expectedOutput: '-1', category: 'edge_case', visibility: 'hidden' }
    ]
  }
];

async function seedSafe() {
  try {
    console.log('[SeedSafe] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    // Find first teacher to assign as default owner if available
    const teacher = await User.findOne({ role: 'teacher' });
    const teacherId = teacher ? teacher._id : null;

    for (const qData of questionsSeed) {
      const { tests, ...qFields } = qData;
      const refMap = new Map(Object.entries(qFields.referenceSolutions));
      const starterMap = new Map(Object.entries(qFields.starterCodes));

      await Question.findByIdAndUpdate(
        qFields._id,
        {
          ...qFields,
          ownerId: teacherId,
          referenceSolutions: refMap,
          starterCodes: starterMap
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[SeedSafe] Upserted question: ${qFields.title} (${qFields._id})`);

      // Delete old test cases for this question and insert verified ones
      await TestCase.deleteMany({ questionId: qFields._id });
      const testDocs = tests.map((t, idx) => ({
        questionId: qFields._id,
        input: t.input,
        expectedOutput: t.expectedOutput,
        category: t.category || 'sample',
        visibility: t.visibility || 'public',
        weight: 1,
        order: idx + 1
      }));
      await TestCase.insertMany(testDocs);
      console.log(`[SeedSafe] Inserted ${testDocs.length} tests for ${qFields.title}`);
    }

    console.log('[SeedSafe] Successfully seeded real-time verified questions and tests into MongoDB Atlas!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[SeedSafe] Failed to seed questions:', err);
    process.exit(1);
  }
}

seedSafe();
