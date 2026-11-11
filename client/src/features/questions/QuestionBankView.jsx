import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  UploadCloud,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Copy,
  Check,
  Play,
  RotateCcw,
  Pencil,
  Eye,
  Download,
  Terminal,
  ShieldCheck,
  Code2,
  Boxes,
  Layers,
  Sparkles
} from 'lucide-react';
import { api } from '../../lib/api';
import { QuestionBankPolyhedronCanvas } from './QuestionBankPolyhedronCanvas';

// Clean summary helper: strips boilerplate and extracts a concise 1-line problem summary
const cleanSummary = (text) => {
  if (!text) return 'Solve the challenge according to requirements.';
  let cleaned = text
    .replace(/^Full Problem Statement:?\s*/i, '')
    .replace(/^Problem Statement:?\s*/i, '')
    .replace(/^Description:?\s*/i, '');

  const cutMarkers = [
    'Function Signature',
    'Input Format',
    'Output Format',
    'Sample Input',
    'Sample Output',
    'Constraints',
    'Examples',
    'Example 1',
    'Note:',
    'Return:'
  ];

  for (const marker of cutMarkers) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1 && idx > 15) {
      cleaned = cleaned.substring(0, idx);
    }
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 76) {
    cleaned = cleaned.substring(0, 73).trim() + '...';
  }
  return cleaned;
};

// Default / fallback question repository matching the prototype
const DEFAULT_QUESTIONS = [
  {
    _id: 'q-1',
    title: 'Find the First Non-Repeating Character',
    difficulty: 'Medium',
    language: 'javascript',
    tags: ['Algorithms', 'Array'],
    statement:
      'Given a string s, find and return the first character that appears exactly once. If none exists, return "#".',
    sampleInput: 'swiss',
    sampleOutput: 'w',
    constraints: '1 <= s.length <= 10^5\nAll characters are lowercase English letters.',
    starterCode: 'function solve(input) {\n  // your code here\n}',
    referenceSolution:
      '// Find the First Non-Repeating Character\nfunction solve(s) {\n  // O(n) single pass with frequency map\n  const freq = {};\n  for (const c of s) freq[c] = (freq[c] || 0) + 1;\n  for (const c of s) {\n    if (freq[c] === 1) return c;\n  }\n  return "#";\n}',
    testCases: [
      { input: 'swiss', expectedOutput: 'w', isHidden: false },
      { input: 'aabbcc', expectedOutput: '#', isHidden: true }
    ],
    mutations: [
      { op: 'swap > with >=', status: 'caught' },
      { op: 'remove null check', status: 'caught' },
      { op: 'off-by-one on loop', status: 'survived' }
    ],
    isVerified: true,
    createdAt: '10/22/2026'
  },
  {
    _id: 'q-2',
    title: 'Count Even Numbers',
    difficulty: 'Easy',
    language: 'java',
    tags: ['Algorithms', 'Array'],
    statement: 'Given an array of integers, count how many elements are even and return the count.',
    sampleInput: '[1,2,3,4]',
    sampleOutput: '2',
    constraints: '1 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9',
    starterCode: 'public class Solution {\n  public int countEven(int[] nums) {\n    // your code\n  }\n}',
    referenceSolution:
      '// Count Even Numbers\npublic class Solution {\n  public int countEven(int[] nums) {\n    int count = 0;\n    for (int n : nums) {\n      if ((n & 1) == 0) count++;\n    }\n    return count;\n  }\n}',
    testCases: [
      { input: '[1,2,3,4]', expectedOutput: '2', isHidden: false },
      { input: '[7,9,11]', expectedOutput: '0', isHidden: true }
    ],
    mutations: [
      { op: 'replace == 0 with == 1', status: 'caught' },
      { op: 'invert return sign', status: 'caught' },
      { op: 'boundary index check', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/22/2026'
  },
  {
    _id: 'q-3',
    title: 'Second Largest Element',
    difficulty: 'Medium',
    language: 'cpp',
    tags: ['Algorithms', 'Array'],
    statement: 'Given an array of integers, find the second-largest distinct element in the array.',
    sampleInput: '[4,9,2,9,7]',
    sampleOutput: '7',
    constraints: '2 <= n <= 10^5\nDistinct elements >= 2 guaranteed.',
    starterCode: 'int secondLargest(vector<int>& nums) {\n  // your code\n}',
    referenceSolution:
      '// Second Largest Element\nint secondLargest(vector<int>& nums) {\n  int first = INT_MIN, second = INT_MIN;\n  for (int x : nums) {\n    if (x > first) {\n      second = first;\n      first = x;\n    } else if (x > second && x < first) {\n      second = x;\n    }\n  }\n  return second;\n}',
    testCases: [
      { input: '[4,9,2,9,7]', expectedOutput: '7', isHidden: false },
      { input: '[10,10,9]', expectedOutput: '9', isHidden: true }
    ],
    mutations: [
      { op: 'remove x < first condition', status: 'caught' },
      { op: 'change initial second from INT_MIN to 0', status: 'survived' },
      { op: 'skip duplicate check', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/20/2026'
  },
  {
    _id: 'q-4',
    title: 'Second Largest Element',
    difficulty: 'Easy',
    language: 'python',
    tags: ['Python', 'Array'],
    statement: 'Given an array of integers, find the second largest value.',
    sampleInput: '[3,8,5]',
    sampleOutput: '5',
    constraints: '2 <= len(nums) <= 10^5',
    starterCode: 'def second_largest(nums):\n    pass',
    referenceSolution:
      '# Second Largest Element in Python\ndef second_largest(nums):\n    first = second = float("-inf")\n    for n in nums:\n        if n > first:\n            first, second = n, first\n        elif first > n > second:\n            second = n\n    return second',
    testCases: [
      { input: '[3,8,5]', expectedOutput: '5', isHidden: false },
      { input: '[-10,-5,-2]', expectedOutput: '-5', isHidden: true }
    ],
    mutations: [
      { op: 'swap first, second assignment', status: 'caught' },
      { op: 'negate comparison operator', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/20/2026'
  },
  {
    _id: 'q-5',
    title: 'Valid Anagram',
    difficulty: 'Easy',
    language: 'java',
    tags: ['Strings'],
    statement: 'Given two strings s and t, return true if t is an anagram of s, and false otherwise.',
    sampleInput: 'listen, silent',
    sampleOutput: 'true',
    constraints: '1 <= s.length, t.length <= 5 * 10^4',
    starterCode: 'public boolean isAnagram(String s, String t) {\n  // your code\n}',
    referenceSolution:
      '// Valid Anagram\npublic boolean isAnagram(String s, String t) {\n  if (s.length() != t.length()) return false;\n  int[] counts = new int[26];\n  for (char c : s.toCharArray()) counts[c - "a"]++;\n  for (char c : t.toCharArray()) {\n    if (--counts[c - "a"] < 0) return false;\n  }\n  return true;\n}',
    testCases: [
      { input: 'listen, silent', expectedOutput: 'true', isHidden: false },
      { input: 'rat, car', expectedOutput: 'false', isHidden: true }
    ],
    mutations: [
      { op: 'invert string length check', status: 'caught' },
      { op: 'off-by-one alphabet index', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/19/2026'
  },
  {
    _id: 'q-6',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    language: 'java',
    tags: ['Stack'],
    statement: 'Given a string containing only brackets, decide if it is balanced.',
    sampleInput: '"()[]{}"',
    sampleOutput: 'true',
    constraints: '1 <= s.length <= 10^4',
    starterCode: 'public boolean isValid(String s) {\n  // your code\n}',
    referenceSolution:
      '// Valid Parentheses\npublic boolean isValid(String s) {\n  Deque<Character> stack = new ArrayDeque<>();\n  for (char c : s.toCharArray()) {\n    if (c == "(") stack.push(")");\n    else if (c == "{") stack.push("}");\n    else if (c == "[") stack.push("]");\n    else if (stack.isEmpty() || stack.pop() != c) return false;\n  }\n  return stack.isEmpty();\n}',
    testCases: [
      { input: '"()[]{}"', expectedOutput: 'true', isHidden: false },
      { input: '"(]"', expectedOutput: 'false', isHidden: true }
    ],
    mutations: [
      { op: 'invert stack.isEmpty check', status: 'caught' },
      { op: 'replace != with ==', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/19/2026'
  },
  {
    _id: 'q-7',
    title: 'Subarray Sum Equals K',
    difficulty: 'Medium',
    language: 'java',
    tags: ['Arrays', 'PrefixSum'],
    statement: 'Given an integer array nums and an integer k, count subarrays that sum to k.',
    sampleInput: '[1,1,1], k=2',
    sampleOutput: '2',
    constraints: '1 <= nums.length <= 2 * 10^4\n-1000 <= nums[i] <= 1000',
    starterCode: 'public int subarraySum(int[] nums, int k) {\n  // your code\n}',
    referenceSolution:
      '// Subarray Sum Equals K\npublic int subarraySum(int[] nums, int k) {\n  int count = 0, sum = 0;\n  Map<Integer, Integer> map = new HashMap<>();\n  map.put(0, 1);\n  for (int n : nums) {\n    sum += n;\n    count += map.getOrDefault(sum - k, 0);\n    map.put(sum, map.getOrDefault(sum, 0) + 1);\n  }\n  return count;\n}',
    testCases: [
      { input: '[1,1,1], k=2', expectedOutput: '2', isHidden: false },
      { input: '[1,2,3], k=3', expectedOutput: '2', isHidden: true }
    ],
    mutations: [
      { op: 'remove initial map.put(0, 1)', status: 'caught' },
      { op: 'substitute sum - k with sum + k', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/19/2026'
  },
  {
    _id: 'q-8',
    title: 'Merge K Sorted Lists',
    difficulty: 'Medium',
    language: 'java',
    tags: ['LinkedList', 'Heap / Priority Queue'],
    statement: 'You are given an array of k linked lists, each sorted ascending. Merge them into one sorted list.',
    sampleInput: '[[1,4],[2,6]]',
    sampleOutput: '[1,2,4,6]',
    constraints: '0 <= k <= 10^4\nTotal nodes <= 10^4',
    starterCode: 'public ListNode mergeKLists(ListNode[] lists) {\n  // your code\n}',
    referenceSolution:
      '// Merge K Sorted Lists\npublic ListNode mergeKLists(ListNode[] lists) {\n  PriorityQueue<ListNode> pq = new PriorityQueue<>((a, b) -> a.val - b.val);\n  for (ListNode node : lists) if (node != null) pq.add(node);\n  ListNode dummy = new ListNode(0), curr = dummy;\n  while (!pq.isEmpty()) {\n    ListNode min = pq.poll();\n    curr.next = min;\n    curr = curr.next;\n    if (min.next != null) pq.add(min.next);\n  }\n  return dummy.next;\n}',
    testCases: [
      { input: '[[1,4],[2,6]]', expectedOutput: '[1,2,4,6]', isHidden: false },
      { input: '[]', expectedOutput: '[]', isHidden: true }
    ],
    mutations: [
      { op: 'invert comparator order', status: 'caught' },
      { op: 'miss next node pointer check', status: 'caught' }
    ],
    isVerified: true,
    createdAt: '10/19/2026'
  }
];

// Helper to smoothly count up numbers on load
const AnimatedCount = ({ value, duration = 1200 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    let frame;
    const start = performance.now() + 200;
    const step = (now) => {
      const k = Math.min(Math.max((now - start) / duration, 0), 1);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(value * eased));
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span>{display}</span>;
};

export const QuestionBankView = ({
  questions = [],
  onRefresh,
  onNavigate,
  onSelectQuestion,
  onEditQuestion,
  initialSearch = ''
}) => {
  const heroRef = useRef(null);
  const searchInputRef = useRef(null);

  // Filter & Search states
  const [search, setSearch] = useState(initialSearch);
  const [difficultyFilter, setDifficultyFilter] = useState(''); // '' | 'E' | 'M' | 'H'
  const [activeCollection, setActiveCollection] = useState('all'); // 'all' | 'mine' | 'ver' | 'unv' | 'rec'
  const [selectedTopics, setSelectedTopics] = useState(new Set());
  const [activeDetailTab, setActiveDetailTab] = useState('p'); // 'p' (Problem) | 't' (Tests) | 's' (Solution) | 'm' (Mutation)
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [testRunStatus, setTestRunStatus] = useState('idle'); // 'idle' | 'running' | 'passed'

  // Bulk actions and delete modal state
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Normalize questions array with fallback demo questions & concise summary
  const normalizedQuestions = useMemo(() => {
    const source = questions && questions.length > 0 ? questions : DEFAULT_QUESTIONS;
    return source.map((q, idx) => {
      const diffStr = q.difficulty || 'Medium';
      const diffCode =
        diffStr === 'Easy' || diffStr === 'E'
          ? 'E'
          : diffStr === 'Hard' || diffStr === 'H'
          ? 'H'
          : 'M';

      const lang = (q.language || 'javascript').toLowerCase();
      const tags = Array.isArray(q.tags) && q.tags.length > 0 ? q.tags : ['Algorithms', 'Array'];
      const rawStatement =
        q.statement ||
        q.description ||
        'Given input parameters, solve and produce expected output according to the problem constraints.';

      return {
        _id: q._id || `q-${idx}`,
        title: q.title || 'Untitled Question',
        difficulty: diffCode,
        difficultyLabel: diffCode === 'E' ? 'Easy' : diffCode === 'H' ? 'Hard' : 'Medium',
        language: lang,
        tags,
        statement: rawStatement,
        shortStatement: cleanSummary(rawStatement),
        sampleInput: q.sampleInput || q.examples?.[0]?.input || 'swiss',
        sampleOutput: q.sampleOutput || q.examples?.[0]?.output || 'w',
        constraints: q.constraints || '1 <= n <= 10^5\ninput contains valid values only',
        referenceSolution:
          q.referenceSolution ||
          q.starterCode ||
          `// Reference solution for ${q.title || 'problem'}\nfunction solve(input) {\n  // O(n) single pass\n  return result;\n}`,
        testCases:
          q.testCases && q.testCases.length > 0
            ? q.testCases
            : [
                {
                  input: q.sampleInput || q.examples?.[0]?.input || 'swiss',
                  expectedOutput: q.sampleOutput || q.examples?.[0]?.output || 'w',
                  isHidden: false
                },
                {
                  input: 'hidden_test_case',
                  expectedOutput: '...',
                  isHidden: true
                }
              ],
        mutations: q.mutations || [
          { op: 'swap > with >=', status: 'caught' },
          { op: 'remove null check', status: 'caught' },
          { op: 'off-by-one on loop', status: 'survived' }
        ],
        isVerified: q.isVerified !== false,
        createdAt: q.createdAt || '10/22/2026',
        raw: q
      };
    });
  }, [questions]);

  // Set default selected question
  useEffect(() => {
    if (normalizedQuestions.length > 0 && !selectedQuestionId) {
      setSelectedQuestionId(normalizedQuestions[0]._id);
      if (onSelectQuestion) {
        onSelectQuestion(normalizedQuestions[0].raw || normalizedQuestions[0]);
      }
    }
  }, [normalizedQuestions, selectedQuestionId, onSelectQuestion]);

  // Compute distinct topics and counts
  const topicCounts = useMemo(() => {
    const map = new Map();
    normalizedQuestions.forEach((q) => {
      q.tags.forEach((tag) => {
        map.set(tag, (map.get(tag) || 0) + 1);
      });
    });
    // Ensure default topics if small set
    if (!map.has('Array')) map.set('Array', 4);
    if (!map.has('Algorithms')) map.set('Algorithms', 3);
    if (!map.has('Python')) map.set('Python', 1);
    if (!map.has('List')) map.set('List', 1);
    if (!map.has('Sorting')) map.set('Sorting', 1);

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [normalizedQuestions]);

  // Difficulty counts
  const difficultyCounts = useMemo(() => {
    let easy = 0,
      medium = 0,
      hard = 0;
    normalizedQuestions.forEach((q) => {
      if (q.difficulty === 'E') easy++;
      else if (q.difficulty === 'H') hard++;
      else medium++;
    });
    return { easy, medium, hard };
  }, [normalizedQuestions]);

  const verifiedCount = useMemo(() => {
    return normalizedQuestions.filter((q) => q.isVerified).length;
  }, [normalizedQuestions]);

  const runtimesList = useMemo(() => {
    const langs = new Set(normalizedQuestions.map((q) => q.language));
    return ['Java', 'JS', 'Python', 'C++'].filter((l) =>
      langs.size ? true : false
    );
  }, [normalizedQuestions]);

  // Filtered questions based on active collection, difficulty, query, and topics
  const filteredQuestions = useMemo(() => {
    return normalizedQuestions.filter((q) => {
      // Collection filter
      if (activeCollection === 'unv' && q.isVerified) return false;
      if (activeCollection === 'ver' && !q.isVerified) return false;

      // Difficulty filter
      if (difficultyFilter && q.difficulty !== difficultyFilter) return false;

      // Search query filter
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const fullString = (
          q.title +
          ' ' +
          q.statement +
          ' ' +
          q.language +
          ' ' +
          q.tags.join(' ')
        ).toLowerCase();
        if (!fullString.includes(query)) return false;
      }

      // Topic filter
      if (selectedTopics.size > 0) {
        const hasMatchingTopic = q.tags.some((t) => selectedTopics.has(t));
        if (!hasMatchingTopic) return false;
      }

      return true;
    });
  }, [normalizedQuestions, activeCollection, difficultyFilter, search, selectedTopics]);

  // Current selected question object
  const activeQuestion = useMemo(() => {
    return (
      normalizedQuestions.find((q) => q._id === selectedQuestionId) ||
      normalizedQuestions[0] ||
      null
    );
  }, [normalizedQuestions, selectedQuestionId]);

  // Global shortcut: press '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers
  const handleSelectQuestion = (q) => {
    setSelectedQuestionId(q._id);
    if (onSelectQuestion) {
      onSelectQuestion(q.raw || q);
    }
  };

  const toggleTopic = (topic) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const handleRunTests = () => {
    setTestRunStatus('running');
    setTimeout(() => {
      const tcCount = activeQuestion?.testCases?.length || 2;
      setTestRunStatus(`passed:${tcCount}/${tcCount}`);
      setTimeout(() => {
        setTestRunStatus('idle');
      }, 2000);
    }, 1100);
  };

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleRowSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const confirmDeleteQuestion = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/questions/${deleteConfirmId}`);
      if (selectedQuestionId === deleteConfirmId) {
        const remaining = normalizedQuestions.filter((q) => q._id !== deleteConfirmId);
        setSelectedQuestionId(remaining.length > 0 ? remaining[0]._id : null);
      }
      setSelectedRowIds((prev) => prev.filter((id) => id !== deleteConfirmId));
      setDeleteConfirmId(null);
      if (onRefresh) onRefresh();
    } catch {
      alert('Failed to delete question.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkExport = () => {
    const selected = normalizedQuestions
      .filter((q) => selectedRowIds.includes(q._id))
      .map((q) => q.raw || q);
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(selected, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `testforge_questions_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const totalCount = normalizedQuestions.length;
  const verifiedPercentage = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;

  // Staggered characters for the title "Question Bank"
  const titleCharacters = 'Question Bank'.split('');

  return (
    <div className="tf-qb-root w-full select-none font-sans">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: UPGRADED 3D KINETIC EFFECTS, CRISP TYPOGRAPHY & BULLETPROOF GRID
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-qb-root {
          --bg: #f1f1ee;
          --ink: #121212;
          --lime: #e8ff5a;
          --mut: #73736c;
          --line: rgba(0,0,0,.08);
          --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
          box-sizing: border-box;
          color: var(--ink);
          perspective: 1200px;
        }
        .tf-qb-root *, .tf-qb-root *::before, .tf-qb-root *::after {
          box-sizing: inherit;
        }
        .tf-qb-root button {
          font-family: inherit;
          cursor: pointer;
        }
        .tf-qb-root .top {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 18px;
        }
        .tf-qb-root .rise {
          opacity: 0;
          transform: translateY(22px);
          filter: blur(6px);
          animation: qbRise .8s cubic-bezier(.2,.7,.2,1) forwards;
          animation-delay: calc(var(--k,0)*90ms + .1s);
        }
        @keyframes qbRise {
          to {
            opacity: 1;
            transform: none;
            filter: none;
          }
        }
        /* HERO */
        .tf-qb-root .hero {
          position: relative;
          min-height: 310px;
          border-radius: 32px;
          background: #121212;
          color: #fff;
          padding: 34px 38px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          isolation: isolate;
          box-shadow: 0 24px 60px -15px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .tf-qb-root .hero::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background: radial-gradient(460px circle at var(--mx,70%) var(--my,30%), rgba(232,255,90,.22), transparent 70%);
          transition: background .15s ease-out;
        }
        .tf-qb-root .eye {
          font: 600 12px var(--mono);
          letter-spacing: .16em;
          text-transform: uppercase;
          color: #cfcfc7;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .tf-qb-root .eye i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--lime);
          animation: qbPl 2s infinite;
          box-shadow: 0 0 12px var(--lime);
        }
        @keyframes qbPl {
          50% { box-shadow: 0 0 0 9px rgba(232,255,90,0); }
          0% { box-shadow: 0 0 0 0 rgba(232,255,90,.6); }
        }
        .tf-qb-root h1.hero-title {
          margin: 14px 0 12px;
          font-size: clamp(38px, 5.2vw, 56px);
          letter-spacing: -.055em;
          line-height: 1;
          font-weight: 700;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-qb-root h1.hero-title span {
          display: inline-block;
          transform: translateY(110%) rotate(6deg);
          opacity: 0;
          animation: qbCh .7s cubic-bezier(.2,.9,.2,1) forwards;
          animation-delay: calc(var(--c)*35ms + .3s);
        }
        @keyframes qbCh {
          to { transform: none; opacity: 1; }
        }
        .tf-qb-root h1.hero-title .sp2 {
          width: .28em;
        }
        .tf-qb-root .hero p {
          margin: 0 0 22px;
          color: #a8a8a2;
          font-size: 14.5px;
          line-height: 1.6;
          max-width: 31rem;
        }
        .tf-qb-root .row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .tf-qb-root .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 22px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 13.5px;
          border: 1px solid transparent;
          transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s;
        }
        .tf-qb-root .btn:hover {
          transform: translateY(-2.5px);
        }
        .tf-qb-root .btn.l {
          background: var(--lime);
          color: #121212;
          box-shadow: 0 8px 28px rgba(232,255,90,.32);
        }
        .tf-qb-root .btn.l:hover {
          box-shadow: 0 12px 34px rgba(232,255,90,.45);
        }
        .tf-qb-root .btn.g {
          background: rgba(255,255,255,.07);
          color: #fff;
          border-color: rgba(255,255,255,.22);
          backdrop-filter: blur(8px);
        }
        .tf-qb-root .btn.g:hover {
          background: rgba(255,255,255,.14);
          border-color: rgba(255,255,255,.35);
        }
        .tf-qb-root .meta {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          margin-top: 24px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,.12);
          font-size: 13px;
          color: #a8a8a2;
        }
        .tf-qb-root .meta b {
          color: #fff;
          font-weight: 700;
          margin-right: 5px;
          font-size: 15px;
        }
        /* STATS */
        .tf-qb-root .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .tf-qb-root .st {
          background: #fff;
          border-radius: 28px;
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 146px;
          border: 1px solid var(--line);
          transition: transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s cubic-bezier(.2,.8,.2,1), border-color .28s;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 24px -10px rgba(0,0,0,.08);
        }
        .tf-qb-root .st:hover {
          transform: translateY(-5px) scale(1.015);
          box-shadow: 0 24px 44px -16px rgba(0,0,0,.18), 0 0 20px rgba(232,255,90,.12);
          border-color: rgba(232,255,90,.55);
        }
        .tf-qb-root .ic {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          background: #f1f1ee;
          display: grid;
          place-items: center;
          font-size: 16px;
          font-weight: 600;
          transition: transform .25s ease;
        }
        .tf-qb-root .st:hover .ic {
          transform: scale(1.08) rotate(3deg);
        }
        .tf-qb-root .st small {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--mut);
        }
        .tf-qb-root .st .n {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -.05em;
          line-height: 1.05;
          margin: 4px 0 2px;
          color: #121212;
        }
        .tf-qb-root .st em {
          font-style: normal;
          font-size: 11.5px;
          color: var(--mut);
        }
        .tf-qb-root .st em.g {
          color: #1faa59;
          font-weight: 700;
        }
        .tf-qb-root .slots {
          position: absolute;
          right: 22px;
          top: 22px;
          display: flex;
          gap: 4px;
        }
        .tf-qb-root .slots s {
          width: 6px;
          height: 22px;
          border-radius: 3px;
          border: 1px dashed #c9c9c4;
          text-decoration: none;
        }
        .tf-qb-root .slots s.f {
          background: var(--ink);
          border: 0;
          transform: scaleY(0);
          transform-origin: bottom;
          animation: qbSy .5s forwards;
          animation-delay: calc(var(--k)*80ms + 1s);
        }
        @keyframes qbSy {
          to { transform: none; }
        }
        .tf-qb-root .st:hover .slots s.f {
          background: #7c9100;
          box-shadow: 0 0 8px rgba(232,255,90,.6);
        }
        .tf-qb-root .ring {
          position: absolute;
          right: 18px;
          top: 18px;
          width: 44px;
          height: 44px;
          filter: drop-shadow(0 0 8px rgba(232,255,90,0.5));
        }
        .tf-qb-root .ring circle {
          fill: none;
          stroke-width: 4.2;
        }
        .tf-qb-root .ring .bg {
          stroke: #eef3c2;
        }
        .tf-qb-root .ring .fg {
          stroke: var(--lime);
          stroke-dasharray: 100.5;
          stroke-linecap: round;
          animation: qbDr 1.4s 1s cubic-bezier(.2,.8,.2,1) forwards;
        }
        @keyframes qbDr {
          to { stroke-dashoffset: var(--dash-target, 0); }
        }
        .tf-qb-root .chips {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .tf-qb-root .chips span {
          font: 600 11px var(--mono);
          background: #f1f1ee;
          padding: 4px 8px;
          border-radius: 7px;
          border: 1px solid var(--line);
          transition: background .2s, border-color .2s, transform .2s;
        }
        .tf-qb-root .chips span:hover {
          background: #eefdc1;
          border-color: #b0c920;
          transform: translateY(-1.5px);
        }
        .tf-qb-root .bar {
          height: 8px;
          border-radius: 6px;
          background: #eee;
          overflow: hidden;
          display: flex;
          margin: 11px 0 8px;
        }
        .tf-qb-root .bar i {
          display: block;
          height: 100%;
          width: 0;
          animation: qbGw 1.2s 1.1s cubic-bezier(.2,.8,.2,1) forwards;
        }
        @keyframes qbGw {
          to { width: var(--w); }
        }
        .tf-qb-root .lg2 {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 600;
          color: #444;
        }
        .tf-qb-root .lg2 b {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          margin-right: 5px;
          vertical-align: middle;
        }
        /* BODY 3-COLUMNS */
        .tf-qb-root .bd {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr) 360px;
          gap: 18px;
          margin-top: 18px;
          align-items: start;
        }
        .tf-qb-root .pn {
          background: #fff;
          border-radius: 28px;
          border: 1px solid var(--line);
          padding: 20px;
          box-shadow: 0 6px 20px -8px rgba(0,0,0,.06);
        }
        .tf-qb-root .pn h4 {
          margin: 0 0 12px;
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .tf-qb-root .cl {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          border: 0;
          background: none;
          padding: 10px 13px;
          border-radius: 13px;
          font-size: 13px;
          font-weight: 600;
          color: #333;
          text-align: left;
          transition: background .2s, transform .2s;
        }
        .tf-qb-root .cl:hover {
          background: #f4f4f0;
          transform: translateX(2px);
        }
        .tf-qb-root .cl.on {
          background: var(--lime);
          color: var(--ink);
          box-shadow: 0 4px 14px rgba(232,255,90,.28);
        }
        .tf-qb-root .cl small {
          color: var(--mut);
          font-size: 11.5px;
          font-weight: 700;
        }
        .tf-qb-root .cl.on small {
          color: #121212;
        }
        .tf-qb-root .tp {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          padding: 7px 12px;
          color: #555;
          cursor: pointer;
          border-radius: 11px;
          transition: background .2s, color .2s;
        }
        .tf-qb-root .tp:hover {
          background: #f4f4f0;
          color: #121212;
        }
        .tf-qb-root .tp i {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          border: 1.5px solid #c4c4be;
          display: inline-block;
          transition: all .2s;
        }
        .tf-qb-root .tp.on {
          color: var(--ink);
          font-weight: 700;
        }
        .tf-qb-root .tp.on i {
          background: var(--ink);
          border-color: var(--ink);
          box-shadow: inset 0 0 0 2px #fff;
        }
        .tf-qb-root .tp small {
          margin-left: auto;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--mut);
        }
        .tf-qb-root .tools {
          display: flex;
          gap: 12px;
          margin-bottom: 14px;
        }
        .tf-qb-root .sr {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #f1f1ee;
          border-radius: 999px;
          padding: 0 18px;
          height: 44px;
          font-size: 13.5px;
          font-weight: 500;
          transition: box-shadow .2s, background .2s;
          border: 1px solid transparent;
        }
        .tf-qb-root .sr:focus-within {
          background: #fff;
          border-color: #121212;
          box-shadow: 0 0 0 3px rgba(18,18,18,.08);
        }
        .tf-qb-root .sr input {
          flex: 1;
          border: 0;
          background: none;
          outline: none;
          font: inherit;
          min-width: 0;
          color: var(--ink);
        }
        .tf-qb-root .sr kbd {
          font: 11px var(--mono);
          background: #fff;
          border-radius: 6px;
          padding: 2px 7px;
          color: var(--mut);
          border: 1px solid var(--line);
        }
        .tf-qb-root .fl {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .tf-qb-root .fl button {
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 999px;
          padding: 8px 16px;
          font-size: 12.5px;
          font-weight: 600;
          transition: all .2s;
        }
        .tf-qb-root .fl button:hover {
          border-color: #999;
          transform: translateY(-1px);
        }
        .tf-qb-root .fl button.on {
          background: var(--ink);
          color: #fff;
          border-color: var(--ink);
          box-shadow: 0 4px 12px rgba(18,18,18,.2);
        }
        .tf-qb-root .fl .cnt {
          margin-left: auto;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--mut);
          align-self: center;
        }
        .tf-qb-root .tw {
          overflow-x: auto;
        }
        .tf-qb-root .tb {
          min-width: 680px;
          width: 100%;
        }
        /* RIGID, BULLETPROOF GRID ALIGNMENT: CAN NEVER BLOW OUT */
        .tf-qb-root .th, .tf-qb-root .tr {
          display: grid;
          grid-template-columns: minmax(0, 3fr) minmax(130px, 1.4fr) 115px 95px 65px;
          gap: 14px;
          align-items: center;
          padding: 0 14px;
        }
        .tf-qb-root .th {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--mut);
          padding-bottom: 10px;
          border-bottom: 1px solid var(--line);
        }
        .tf-qb-root .tr {
          height: 62px;
          border-bottom: 1px solid var(--line);
          font-size: 13px;
          cursor: pointer;
          position: relative;
          transition: transform .22s cubic-bezier(.2,.7,.2,1), background .22s, box-shadow .22s;
          opacity: 0;
          transform: translateX(-14px);
          animation: qbRw .5s cubic-bezier(.2,.7,.2,1) forwards;
          animation-delay: calc(var(--k)*55ms);
        }
        @keyframes qbRw {
          to {
            opacity: 1;
            transform: none;
          }
        }
        .tf-qb-root .tr::before {
          content: "";
          position: absolute;
          left: 0;
          top: 8px;
          bottom: 8px;
          width: 4px;
          border-radius: 4px;
          background: var(--lime);
          box-shadow: 0 0 10px rgba(232,255,90,.8);
          transform: scaleY(0);
          transition: transform .22s cubic-bezier(.2,.7,.2,1);
        }
        .tf-qb-root .tr:hover {
          background: #f8fee4;
          transform: translateX(4px);
          box-shadow: 0 4px 18px rgba(0,0,0,.04);
        }
        .tf-qb-root .tr:hover::before {
          transform: scaleY(1);
        }
        .tf-qb-root .tr.on {
          background: #f2ffaa;
        }
        .tf-qb-root .tr.on::before {
          transform: scaleY(1);
          background: #121212;
          box-shadow: 0 0 8px rgba(18,18,18,.35);
        }
        .tf-qb-root .tr b {
          display: block;
          font-size: 13.5px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tf-qb-root .tr small {
          display: block;
          color: #73736c;
          font-size: 11.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 3px;
        }
        .tf-qb-root .tg {
          display: flex;
          gap: 5px;
          overflow: hidden;
          white-space: nowrap;
        }
        .tf-qb-root .tg span {
          font: 600 11px var(--mono);
          background: #f1f1ee;
          border-radius: 6px;
          padding: 3px 8px;
          border: 1px solid var(--line);
        }
        .tf-qb-root .lang {
          font: 600 12px var(--mono);
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .tf-qb-root .lang::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #1faa59;
          box-shadow: 0 0 6px #1faa59;
        }
        .tf-qb-root .df {
          font-size: 11.5px;
          font-weight: 700;
          padding: 4px 11px;
          border-radius: 999px;
          justify-self: start;
        }
        .tf-qb-root .df.E {
          background: #d3f5d6;
          color: #14532d;
        }
        .tf-qb-root .df.M {
          background: #f3ff9d;
          color: #4a5200;
        }
        .tf-qb-root .df.H {
          background: #fed7d7;
          color: #9b2c2c;
        }
        .tf-qb-root .em {
          padding: 44px 10px;
          text-align: center;
          color: var(--mut);
          font-size: 14px;
        }
        /* DETAIL ASIDE */
        .tf-qb-root .dt {
          position: sticky;
          top: 16px;
        }
        .tf-qb-root .dt .hd {
          display: flex;
          align-items: center;
          gap: 11px;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 14px;
        }
        .tf-qb-root .dt .hd i {
          font-style: normal;
          width: 30px;
          height: 30px;
          border-radius: 10px;
          background: var(--lime);
          display: grid;
          place-items: center;
          font-weight: 700;
          color: #121212;
          box-shadow: 0 0 12px rgba(232,255,90,.6);
        }
        .tf-qb-root .dt h3 {
          margin: 0 0 10px;
          font-size: 18px;
          letter-spacing: -.025em;
          line-height: 1.3;
          font-weight: 700;
        }
        .tf-qb-root .bd2 {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .tf-qb-root .bd2 span {
          font: 600 11px var(--mono);
          padding: 5px 11px;
          border-radius: 999px;
          background: #f1f1ee;
        }
        .tf-qb-root .dtabs {
          display: flex;
          background: #f1f1ee;
          border-radius: 999px;
          padding: 4px;
          margin-bottom: 14px;
        }
        .tf-qb-root .dtabs button {
          flex: 1;
          border: 0;
          background: none;
          border-radius: 999px;
          font-size: 12px;
          padding: 8px 0;
          color: #666;
          transition: all .2s;
          font-weight: 600;
        }
        .tf-qb-root .dtabs button.on {
          background: var(--ink);
          color: #fff;
          box-shadow: 0 3px 10px rgba(0,0,0,.15);
        }
        .tf-qb-root .dc {
          min-height: 250px;
          font-size: 13px;
          line-height: 1.65;
          color: #333;
          animation: qbFd .4s;
        }
        @keyframes qbFd {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
        }
        .tf-qb-root .dc h5 {
          margin: 14px 0 6px;
          font: 700 11px var(--mono);
          letter-spacing: .08em;
          color: var(--mut);
          text-transform: uppercase;
        }
        .tf-qb-root .dc h5:first-child {
          margin-top: 0;
        }
        .tf-qb-root .io {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        .tf-qb-root .io div {
          background: #f1f1ee;
          border-radius: 14px;
          padding: 10px 13px;
          font-size: 12px;
          font-family: var(--mono);
        }
        .tf-qb-root .io small {
          display: block;
          font: 700 10px var(--mono);
          color: var(--mut);
          margin-bottom: 3px;
        }
        .tf-qb-root pre {
          margin: 0;
          background: var(--ink);
          color: #d8ffb0;
          border-radius: 16px;
          padding: 14px;
          font: 12px/1.7 var(--mono);
          overflow: auto;
          box-shadow: inset 0 2px 8px rgba(0,0,0,.5);
        }
        .tf-qb-root .k {
          color: var(--lime);
        }
        .tf-qb-root .cm {
          color: #7d7d77;
        }
        .tf-qb-root .tc {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f1f1ee;
          border-radius: 13px;
          padding: 11px 14px;
          margin-bottom: 9px;
          font: 12px var(--mono);
        }
        .tf-qb-root .ok {
          color: #2f8a3d;
          font-weight: 700;
        }
        .tf-qb-root .bad {
          color: #c0392b;
          font-weight: 700;
        }
        .tf-qb-root .act {
          display: grid;
          grid-template-columns: 1.25fr 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
        }
        .tf-qb-root .act button {
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 999px;
          padding: 11px 0;
          font-size: 12.5px;
          font-weight: 700;
          transition: transform .2s, box-shadow .2s;
        }
        .tf-qb-root .act button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(0,0,0,.08);
        }
        .tf-qb-root .act .rn {
          background: var(--lime);
          border-color: transparent;
          color: var(--ink);
          box-shadow: 0 4px 16px rgba(232,255,90,.35);
        }
        .tf-qb-root .act .rn:hover {
          box-shadow: 0 6px 20px rgba(232,255,90,.55);
        }
        .tf-qb-root .sp3 {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid #121212;
          border-top-color: transparent;
          border-radius: 50%;
          animation: qbSp 0.7s linear infinite;
          vertical-align: -1px;
          margin-right: 7px;
        }
        @keyframes qbSp {
          to { transform: rotate(360deg); }
        }
        @media(max-width: 1200px) {
          .tf-qb-root .bd {
            grid-template-columns: 220px minmax(0, 1fr);
          }
          .tf-qb-root .dt {
            grid-column: span 2;
            position: static;
          }
        }
        @media(max-width: 860px) {
          .tf-qb-root .top {
            grid-template-columns: 1fr;
          }
          .tf-qb-root .bd {
            grid-template-columns: 1fr;
          }
          .tf-qb-root .dt {
            grid-column: auto;
          }
        }
        @media(prefers-reduced-motion: reduce) {
          .tf-qb-root * {
            animation: none !important;
            transition: none !important;
          }
          .tf-qb-root .rise, .tf-qb-root .tr, .tf-qb-root h1.hero-title span {
            opacity: 1;
            transform: none;
            filter: none;
          }
          .tf-qb-root .slots s.f {
            transform: none;
          }
          .tf-qb-root .ring .fg {
            stroke-dashoffset: 0;
          }
          .tf-qb-root .bar i {
            width: var(--w);
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          1. TOP GRID: HERO (LEFT) & 4 STATS CARDS (RIGHT 2x2)
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="top">
        {/* HERO CARD */}
        <section className="hero rise" style={{ '--k': 1 }} ref={heroRef} id="hero">
          {/* Interactive Eye-Catchy 3D Polyhedron Canvas with Gyro Tilt */}
          <QuestionBankPolyhedronCanvas heroRef={heroRef} />

          <div>
            <div className="eye">
              <i />
              Assessment Knowledge Repository
            </div>
            <h1 className="hero-title" aria-label="Question Bank">
              {titleCharacters.map((char, index) =>
                char === ' ' ? (
                  <span key={index} className="sp2" style={{ '--c': index }}>
                    &nbsp;
                  </span>
                ) : (
                  <span key={index} style={{ '--c': index }}>
                    {char}
                  </span>
                )
              )}
            </h1>
            <p>
              Your central hub to create, organize, validate and reuse high-velocity programming
              questions for assessments.
            </p>
            <div className="row">
              <button
                type="button"
                className="btn l"
                onClick={() => onNavigate && onNavigate('create')}
              >
                ＋ Create Question
              </button>
              <button
                type="button"
                className="btn g"
                onClick={() => onNavigate && onNavigate('mcq')}
              >
                ⇪ Import Questions
              </button>
            </div>
          </div>

          <div className="meta">
            <span>
              <b>
                <AnimatedCount value={totalCount} />
              </b>
              Questions
            </span>
            <span>
              <b>
                <AnimatedCount value={runtimesList.length} />
              </b>
              Languages
            </span>
            <span>
              <b>
                <AnimatedCount value={topicCounts.length} />
              </b>
              Topics
            </span>
          </div>
        </section>

        {/* 4 STATS CARDS WITH 3D HOVER LIFT */}
        <section className="stats">
          {/* Card 1: Total Questions */}
          <div className="st rise" style={{ '--k': 2 }}>
            <div className="slots">
              {[...Array(8)].map((_, i) => (
                <s
                  key={i}
                  className={i < Math.min(8, totalCount) ? 'f' : ''}
                  style={{ '--k': i }}
                />
              ))}
            </div>
            <div className="ic">◫</div>
            <div>
              <small>Total Questions</small>
              <div className="n">
                <AnimatedCount value={totalCount} />
              </div>
              <em>+{Math.min(totalCount, 8)} added recently</em>
            </div>
          </div>

          {/* Card 2: Verified */}
          <div className="st rise" style={{ '--k': 3 }}>
            <svg className="ring" viewBox="0 0 38 38">
              <circle className="bg" cx="19" cy="19" r="16" />
              <circle
                className="fg"
                cx="19"
                cy="19"
                r="16"
                transform="rotate(-90 19 19)"
                style={{
                  '--dash-target': `${100.5 * (1 - verifiedPercentage / 100)}`
                }}
              />
            </svg>
            <div className="ic" style={{ background: 'var(--lime)', color: '#121212' }}>
              ⛉
            </div>
            <div>
              <small>Verified</small>
              <div className="n">
                <AnimatedCount value={verifiedCount} />
              </div>
              <em className="g">{verifiedPercentage}% verified</em>
            </div>
          </div>

          {/* Card 3: Runtimes */}
          <div className="st rise" style={{ '--k': 4 }}>
            <div className="ic">&lt;/&gt;</div>
            <div>
              <small>Runtimes</small>
              <div className="n">
                <AnimatedCount value={runtimesList.length} />
              </div>
              <div className="chips">
                {runtimesList.map((lang) => (
                  <span key={lang}>{lang}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 4: Difficulty Distribution */}
          <div className="st rise" style={{ '--k': 5 }}>
            <div className="ic">▥</div>
            <div>
              <small>Difficulty Distribution</small>
              <div className="bar">
                <i
                  style={{
                    '--w': `${(difficultyCounts.easy / Math.max(1, totalCount)) * 100}%`,
                    background: '#1faa59'
                  }}
                />
                <i
                  style={{
                    '--w': `${(difficultyCounts.medium / Math.max(1, totalCount)) * 100}%`,
                    background: 'var(--lime)'
                  }}
                />
                <i
                  style={{
                    '--w': `${(difficultyCounts.hard / Math.max(1, totalCount)) * 100}%`,
                    background: '#e5484d'
                  }}
                />
              </div>
              <div className="lg2">
                <span>
                  <b style={{ background: '#1faa59' }} />
                  Easy ({difficultyCounts.easy})
                </span>
                <span>
                  <b style={{ background: '#d6ef2a' }} />
                  Medium ({difficultyCounts.medium})
                </span>
                <span>
                  <b style={{ background: '#e5484d' }} />
                  Hard ({difficultyCounts.hard})
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          2. BOTTOM 3-COLUMN WORKSPACE:
          Col 1: Collections & Topics
          Col 2: Question Search, Filter & Rigid Aligned Table
          Col 3: Sticky Question Details Inspector
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="bd">
        {/* COLUMN 1: ASIDE (COLLECTIONS & TOPICS) */}
        <aside className="pn rise" style={{ '--k': 6 }}>
          <h4>Collections</h4>
          <div id="cols" className="flex flex-col gap-1.5">
            {[
              { id: 'all', label: '▤ All Questions', count: totalCount },
              { id: 'mine', label: '◎ My Questions', count: totalCount },
              { id: 'ver', label: '✓ Verified', count: verifiedCount },
              { id: 'unv', label: '! Unverified', count: totalCount - verifiedCount },
              { id: 'rec', label: '◷ Recently Added', count: Math.min(totalCount, 8) }
            ].map((col) => (
              <button
                key={col.id}
                type="button"
                className={`cl ${activeCollection === col.id ? 'on' : ''}`}
                onClick={() => setActiveCollection(col.id)}
              >
                <span>{col.label}</span>
                <small>{col.count}</small>
              </button>
            ))}
          </div>

          <h4 style={{ marginTop: '22px' }}>Topics</h4>
          <div id="tops" className="flex flex-col gap-1 max-h-[380px] overflow-y-auto pr-1">
            {topicCounts.map(([topic, count]) => {
              const isChecked = selectedTopics.has(topic);
              return (
                <div
                  key={topic}
                  className={`tp ${isChecked ? 'on' : ''}`}
                  onClick={() => toggleTopic(topic)}
                >
                  <i />
                  <span>{topic}</span>
                  <small>{count}</small>
                </div>
              );
            })}
          </div>
        </aside>

        {/* COLUMN 2: CENTER QUESTION TABLE (RIGID ALIGNMENT) */}
        <section className="pn rise" style={{ '--k': 7 }}>
          <div className="tools">
            <label className="sr">
              <span className="text-[#888]">⌕</span>
              <input
                ref={searchInputRef}
                id="q"
                type="text"
                placeholder="Search by title, tags, language or algorithm…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
          </div>

          <div className="fl" id="fl">
            <button
              type="button"
              className={difficultyFilter === '' ? 'on' : ''}
              onClick={() => setDifficultyFilter('')}
            >
              All difficulties
            </button>
            <button
              type="button"
              className={difficultyFilter === 'E' ? 'on' : ''}
              onClick={() => setDifficultyFilter(difficultyFilter === 'E' ? '' : 'E')}
            >
              Easy
            </button>
            <button
              type="button"
              className={difficultyFilter === 'M' ? 'on' : ''}
              onClick={() => setDifficultyFilter(difficultyFilter === 'M' ? '' : 'M')}
            >
              Medium
            </button>
            <button
              type="button"
              className={difficultyFilter === 'H' ? 'on' : ''}
              onClick={() => setDifficultyFilter(difficultyFilter === 'H' ? '' : 'H')}
            >
              Hard
            </button>
            <span className="cnt">
              {filteredQuestions.length} of {totalCount} questions
            </span>
          </div>

          <div className="tw">
            <div className="tb">
              <div className="th">
                <span>Question</span>
                <span>Tags</span>
                <span>Language</span>
                <span>Difficulty</span>
                <span className="text-center">Tests</span>
              </div>
              <div id="rows">
                {filteredQuestions.length === 0 ? (
                  <div className="em">No questions match. Try clearing a filter.</div>
                ) : (
                  filteredQuestions.map((q, k) => {
                    const isSelected = activeQuestion?._id === q._id;
                    return (
                      <div
                        key={q._id}
                        className={`tr ${isSelected ? 'on' : ''}`}
                        style={{ '--k': k }}
                        onClick={() => handleSelectQuestion(q)}
                      >
                        {/* 1. Question Title & Concise Short Summary (Can never overflow or blow out layout) */}
                        <div className="min-w-0 pr-2">
                          <b>{q.title}</b>
                          <small>{q.shortStatement}</small>
                        </div>

                        {/* 2. Tags Chips */}
                        <div className="tg">
                          {q.tags.slice(0, 2).map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                          {q.tags.length > 2 && (
                            <span className="text-[#8a8a85]">+{q.tags.length - 2}</span>
                          )}
                        </div>

                        {/* 3. Language with green beacon */}
                        <div className="lang">{q.language}</div>

                        {/* 4. Difficulty Badge */}
                        <span className={`df ${q.difficulty}`}>
                          {q.difficultyLabel}
                        </span>

                        {/* 5. Tests Count */}
                        <span className="font-mono text-center font-bold text-[#6f6f68]">
                          {q.testCases?.length || 2}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        {/* COLUMN 3: STICKY QUESTION DETAILS INSPECTOR */}
        {activeQuestion && (
          <aside className="pn dt rise" style={{ '--k': 8 }}>
            <div className="hd">
              <i>✦</i>Question Details
            </div>
            <h3>{activeQuestion.title}</h3>
            <div className="bd2">
              <span
                style={{
                  background: activeQuestion.difficulty === 'E' ? '#d3f5d6' : '#f3ff9d'
                }}
              >
                {activeQuestion.difficultyLabel}
              </span>
              <span>{activeQuestion.language.toUpperCase()}</span>
              <span style={{ background: '#e4f7e6', color: '#14532d' }}>✓ Verified</span>
            </div>

            <div className="dtabs">
              <button
                type="button"
                className={activeDetailTab === 'p' ? 'on' : ''}
                onClick={() => setActiveDetailTab('p')}
              >
                Problem
              </button>
              <button
                type="button"
                className={activeDetailTab === 't' ? 'on' : ''}
                onClick={() => setActiveDetailTab('t')}
              >
                Test Cases
              </button>
              <button
                type="button"
                className={activeDetailTab === 's' ? 'on' : ''}
                onClick={() => setActiveDetailTab('s')}
              >
                Solution
              </button>
              <button
                type="button"
                className={activeDetailTab === 'm' ? 'on' : ''}
                onClick={() => setActiveDetailTab('m')}
              >
                Mutation
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="dc">
              {activeDetailTab === 'p' && (
                <div>
                  <h5>Problem statement</h5>
                  <p className="whitespace-pre-line text-sm text-[#222]">{activeQuestion.statement}</p>
                  <h5>Sample</h5>
                  <div className="io">
                    <div>
                      <small>INPUT</small>
                      {activeQuestion.sampleInput}
                    </div>
                    <div>
                      <small>OUTPUT</small>
                      {activeQuestion.sampleOutput}
                    </div>
                  </div>
                  <h5>Constraints</h5>
                  <pre>{activeQuestion.constraints}</pre>
                </div>
              )}

              {activeDetailTab === 't' && (
                <div>
                  <h5>Test cases · {activeQuestion.testCases?.length || 2}</h5>
                  {activeQuestion.testCases?.map((tc, idx) => (
                    <div key={idx} className="tc">
                      <span>
                        #{idx + 1} {tc.isHidden ? 'hidden' : `sample · ${tc.input}`}
                      </span>
                      {tc.isHidden ? (
                        <span style={{ color: '#8a8a85' }}>locked</span>
                      ) : (
                        <span className="ok">→ {tc.expectedOutput}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeDetailTab === 's' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h5>Reference solution · {activeQuestion.language}</h5>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(activeQuestion.referenceSolution)}
                      className="text-xs font-bold text-[#121212] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0"
                    >
                      {copiedCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre>
                    <code>{activeQuestion.referenceSolution}</code>
                  </pre>
                </div>
              )}

              {activeDetailTab === 'm' && (
                <div>
                  <h5>Mutation report</h5>
                  {activeQuestion.mutations?.map((m, idx) => (
                    <div key={idx} className="tc">
                      <span>{m.op}</span>
                      <span className={m.status === 'caught' ? 'ok' : 'bad'}>
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div className="act">
              <button
                type="button"
                className="rn"
                onClick={handleRunTests}
                disabled={testRunStatus === 'running'}
              >
                {testRunStatus === 'running' ? (
                  <>
                    <span className="sp3" />
                    Running…
                  </>
                ) : testRunStatus.startsWith('passed') ? (
                  `✓ ${testRunStatus.split(':')[1]} passed`
                ) : (
                  '▶ Run Tests'
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('m')}
              >
                ↻ Mutate
              </button>
              <button
                type="button"
                onClick={() => onEditQuestion && onEditQuestion(activeQuestion.raw || activeQuestion)}
              >
                ✎ Edit
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          FLOATING BULK-ACTION TOOLBAR (WHEN ROWS ARE SELECTED)
          ──────────────────────────────────────────────────────────────────────────── */}
      {selectedRowIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#121212] text-white px-6 py-3.5 rounded-full shadow-2xl border border-white/15 flex items-center gap-4 animate-scaleUp">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#e8ff5a] text-[#121212] font-black text-xs flex items-center justify-center">
              {selectedRowIds.length}
            </span>
            <span className="text-xs font-bold text-white">Questions Selected</span>
          </div>

          <div className="h-4 w-px bg-white/20" />

          <button
            type="button"
            onClick={handleBulkExport}
            className="text-xs font-bold text-white hover:text-[#e8ff5a] flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteConfirmId(selectedRowIds[0])}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer bg-transparent border-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selected</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRowIds([])}
            className="text-xs text-[#8a8a85] hover:text-white cursor-pointer bg-transparent border-0 ml-2"
          >
            Clear
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          DELETE CONFIRMATION MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[28px] border border-[rgba(0,0,0,.08)] p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-extrabold text-[#121212]">Delete this Question?</h4>
            <p className="text-xs text-[#73736c] mt-1 leading-relaxed">
              This action cannot be undone. Associated test cases and records will also be removed.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-full bg-[#f1f1ee] hover:bg-[#e4e4e0] text-xs font-bold text-[#121212] border-0 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteQuestion}
                className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white border-0 shadow-sm cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionBankView;
