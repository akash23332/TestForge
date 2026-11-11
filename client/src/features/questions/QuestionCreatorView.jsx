import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Pencil,
  FileText,
  Code2,
  BookOpen,
  ArrowRight,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Eye,
  Save,
  Send,
  CheckCircle2,
  Circle,
  HelpCircle,
  Maximize2,
  Minimize2,
  Undo,
  Redo,
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  Quote,
  Link2,
  Table as TableIcon,
  Heading1,
  Heading2,
  Heading3,
  AlertCircle,
  ChevronDown,
  X,
  Layers,
  Cpu,
  ArrowLeft
} from 'lucide-react';
import { api } from '../../lib/api';

// Default code templates per language
export const LANGUAGE_TEMPLATES = {
  java: {
    name: 'Java',
    starterCode: `class Solution {
    public int[] solution(int[] nums, int target) {
        // Implement your solution here
        return new int[]{};
    }
}`,
    referenceSolution: `class Solution {
    public int[] solution(int[] nums, int target) {
        java.util.Map<Integer, Integer> map = new java.util.HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (map.containsKey(complement)) {
                return new int[]{map.get(complement), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{};
    }
}`
  },
  javascript: {
    name: 'JavaScript',
    starterCode: `function solution(nums, target) {
  // Implement your solution here
  return [];
}`,
    referenceSolution: `function solution(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
  return [];
}`
  },
  python: {
    name: 'Python',
    starterCode: `def solution(nums, target):
    # Implement your solution here
    pass`,
    referenceSolution: `def solution(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []`
  },
  cpp: {
    name: 'C++',
    starterCode: `class Solution {
public:
    std::vector<int> solution(std::vector<int>& nums, int target) {
        // Implement your solution here
        return {};
    }
};`,
    referenceSolution: `class Solution {
public:
    std::vector<int> solution(std::vector<int>& nums, int target) {
        std::unordered_map<int, int> map;
        for (int i = 0; i < nums.size(); ++i) {
            int complement = target - nums[i];
            if (map.find(complement) != map.end()) {
                return {map[complement], i};
            }
            map[nums[i]] = i;
        }
        return {};
    }
};`
  }
};

// Algorithmic Knowledge Repository for Instant Smart AI Generation
const AI_QUESTION_TEMPLATES = {
  'Two Pointers': {
    title: 'Container With Most Water',
    statement: `You are given an integer array \`height\` of length \`n\`. There are \`n\` vertical lines drawn such that the two endpoints of the \`i-th\` line are \`(i, 0)\` and \`(i, height[i])\`.

Find two lines that together with the x-axis form a container, such that the container contains the most water.

Return *the maximum amount of water a container can store*.

Notice that you may not slant the container.`,
    inputFormat: 'An integer array `height` representing the line heights.',
    outputFormat: 'An integer denoting the maximum area of water that can be trapped.',
    constraints: '• 2 ≤ height.length ≤ 10⁵\n• 0 ≤ height[i] ≤ 10⁴\n• Time Complexity: O(n)\n• Space Complexity: O(1)',
    examples: [
      {
        input: 'height = [1,8,6,2,5,4,8,3,7]',
        output: '49',
        explanation: 'The vertical lines are at indices 1 and 8 (1-based: heights 8 and 7). Distance is 7, height is min(8, 7) = 7. Max Area = 7 * 7 = 49.'
      },
      {
        input: 'height = [1,1]',
        output: '1',
        explanation: 'Only two lines with height 1 and distance 1. Area = 1 * 1 = 1.'
      }
    ],
    explanation: 'Using two pointers starting at both extremities, move the pointer pointing to the shorter vertical line inward at each step to seek a taller barrier.',
    topics: ['Arrays', 'Two Pointers', 'Greedy']
  },
  'Sliding Window': {
    title: 'Longest Substring Without Repeating Characters',
    statement: `Given a string \`s\`, find the length of the **longest substring** without repeating characters.

A **substring** is a contiguous non-empty sequence of characters within a string.`,
    inputFormat: 'A single string `s` consisting of English letters, digits, symbols and spaces.',
    outputFormat: 'An integer representing the length of the longest distinct character substring.',
    constraints: '• 0 ≤ s.length ≤ 5 × 10⁴\n• `s` consists of standard ASCII characters.\n• Time Complexity: O(n)\n• Auxiliary Space: O(min(m, n))',
    examples: [
      {
        input: 's = "abcabcbb"',
        output: '3',
        explanation: 'The answer is "abc", with the length of 3.'
      },
      {
        input: 's = "bbbbb"',
        output: '1',
        explanation: 'The answer is "b", with the length of 1.'
      }
    ],
    explanation: 'Maintain a dynamic sliding window `[left, right]` and a hash map of last seen indices. Slide the right pointer, and upon encountering a duplicate, advance the left pointer past its previous occurrence.',
    topics: ['Strings', 'Sliding Window', 'Hash Table']
  },
  'Prefix Sums': {
    title: 'Subarray Sum Equals K',
    statement: `Given an array of integers \`nums\` and an integer \`k\`, return *the total number of subarrays whose sum equals to \`k\`*.

A subarray is a contiguous non-empty sequence of elements within an array.`,
    inputFormat: 'An integer array `nums` and an integer `k`.',
    outputFormat: 'An integer denoting the count of subarrays with sum equal to `k`.',
    constraints: '• 1 ≤ nums.length ≤ 2 × 10⁴\n• -1000 ≤ nums[i] ≤ 1000\n• -10⁷ ≤ k ≤ 10⁷\n• Optimal Time: O(n)',
    examples: [
      {
        input: 'nums = [1,1,1], k = 2',
        output: '2',
        explanation: 'Subarrays [1, 1] at indices [0, 1] and [1, 2] both sum to 2.'
      },
      {
        input: 'nums = [1,2,3], k = 3',
        output: '2',
        explanation: 'Subarrays [1, 2] and [3] sum to 3.'
      }
    ],
    explanation: 'Use a prefix sum with a frequency hash table. If `current_prefix_sum - k` exists in the hash table, add its frequency to the answer.',
    topics: ['Arrays', 'Hash Table', 'Prefix Sums']
  },
  'Binary Search': {
    title: 'Search in Rotated Sorted Array',
    statement: `There is an integer array \`nums\` sorted in ascending order (with distinct values).

Prior to being passed to your function, \`nums\` is possibly rotated at an unknown pivot index \`k\` (1 ≤ k < nums.length).

Given the array \`nums\` after the possible rotation and an integer \`target\`, return *the index of \`target\` if it is in \`nums\`, or \`-1\` if it is not in \`nums\`*.

You must write an algorithm with **O(log n)** runtime complexity.`,
    inputFormat: 'An integer array `nums` of distinct values and an integer `target`.',
    outputFormat: 'The zero-based integer index of target, or -1 if not found.',
    constraints: '• 1 ≤ nums.length ≤ 5000\n• -10⁴ ≤ nums[i], target ≤ 10⁴\n• All values of nums are unique.\n• Algorithm runtime must strictly be O(log n).',
    examples: [
      {
        input: 'nums = [4,5,6,7,0,1,2], target = 0',
        output: '4',
        explanation: '0 is found at index 4.'
      },
      {
        input: 'nums = [4,5,6,7,0,1,2], target = 3',
        output: '-1',
        explanation: '3 is not present in the array.'
      }
    ],
    explanation: 'At any pivot point in a rotated sorted array, at least one half (left or right) is guaranteed to be strictly sorted. Test the sorted half to determine if target falls inside its range.',
    topics: ['Arrays', 'Binary Search']
  }
};

export const QuestionCreatorView = ({
  initialQuestion,
  onSuccess,
  onCancel,
  currentUser
}) => {
  const isEditing = Boolean(initialQuestion && initialQuestion._id);

  // 1. Authoring Mode: 'manual' or 'ai'
  const [creationMode, setCreationMode] = useState('manual'); // 'manual' | 'ai'

  // 2. Active Tab: 'details' | 'starter' | 'reference'
  const [activeTab, setActiveTab] = useState('details');

  // 3. Core Question Fields
  const [title, setTitle] = useState(initialQuestion?.title || '');
  const [statement, setStatement] = useState(initialQuestion?.statement || '');
  const [inputFormat, setInputFormat] = useState(initialQuestion?.inputFormat || '');
  const [outputFormat, setOutputFormat] = useState(initialQuestion?.outputFormat || '');
  const [constraints, setConstraints] = useState(
    initialQuestion?.constraints || '• 1 ≤ n ≤ 10⁵\n• Time limit: 1.0s\n• Memory limit: 256MB'
  );
  const [explanation, setExplanation] = useState(initialQuestion?.explanation || '');

  // 4. Multiple Examples Support
  const [examples, setExamples] = useState(() => {
    if (initialQuestion?.examples && initialQuestion.examples.length > 0) {
      return initialQuestion.examples.map((ex) => ({
        input: ex.input || '',
        output: ex.output || '',
        explanation: ex.explanation || ''
      }));
    }
    return [
      {
        input: '[1, 2, 3, 4], target = 5',
        output: '[0, 3]',
        explanation: 'Elements at index 0 and 3 sum up to 5.'
      }
    ];
  });

  // 5. Configuration Fields
  const getPreferredLang = () => {
    const saved = localStorage.getItem('testforge_pref_lang');
    if (saved) {
      const lower = saved.toLowerCase();
      if (lower === 'c++') return 'cpp';
      return lower;
    }
    return 'java';
  };

  const [language, setLanguage] = useState(initialQuestion?.language || getPreferredLang());
  const [difficulty, setDifficulty] = useState(initialQuestion?.difficulty || 'Medium');
  const [topics, setTopics] = useState(() => {
    if (Array.isArray(initialQuestion?.tags) && initialQuestion.tags.length > 0) {
      return initialQuestion.tags;
    }
    return ['Arrays', 'Two Pointers'];
  });
  const [newTopicInput, setNewTopicInput] = useState('');
  const [isAddingTopic, setIsAddingTopic] = useState(false);

  // 6. Code Editors
  const [starterCode, setStarterCode] = useState(
    initialQuestion?.starterCode || LANGUAGE_TEMPLATES[initialQuestion?.language || getPreferredLang()]?.starterCode || ''
  );
  const [referenceSolution, setReferenceSolution] = useState(
    initialQuestion?.referenceSolution || LANGUAGE_TEMPLATES[initialQuestion?.language || getPreferredLang()]?.referenceSolution || ''
  );

  // 7. AI Assisted Generation State
  const [aiTopic, setAiTopic] = useState('Arrays');
  const [aiDifficulty, setAiDifficulty] = useState('Medium');
  const [aiLanguage, setAiLanguage] = useState(getPreferredLang());
  const [aiConcept, setAiConcept] = useState('Two Pointers');
  const [aiPrompt, setAiPrompt] = useState(
    'Generate a medium-level array question involving two pointers with clear examples and edge cases.'
  );
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiSuccessBanner, setAiSuccessBanner] = useState(false);

  // 8. General UI States
  const [loading, setLoading] = useState(false);
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [copiedStarter, setCopiedStarter] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [isFullscreenEditor, setIsFullscreenEditor] = useState(false);

  // Rich Text Undo/Redo Stack
  const statementRef = useRef(null);
  const [history, setHistory] = useState([statement]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Set initial data if initialQuestion changes
  useEffect(() => {
    if (initialQuestion) {
      setTitle(initialQuestion.title || '');
      setStatement(initialQuestion.statement || '');
      setInputFormat(initialQuestion.inputFormat || '');
      setOutputFormat(initialQuestion.outputFormat || '');
      setConstraints(initialQuestion.constraints || '');
      setExplanation(initialQuestion.explanation || '');
      setLanguage(initialQuestion.language || 'java');
      setDifficulty(initialQuestion.difficulty || 'Medium');
      if (Array.isArray(initialQuestion.tags)) setTopics(initialQuestion.tags);
      if (initialQuestion.starterCode) setStarterCode(initialQuestion.starterCode);
      if (initialQuestion.referenceSolution) setReferenceSolution(initialQuestion.referenceSolution);
      if (initialQuestion.examples && initialQuestion.examples.length > 0) {
        setExamples(initialQuestion.examples);
      }
    }
  }, [initialQuestion?._id]);

  // Handle statement changes with simple undo/redo
  const handleStatementChange = (newVal) => {
    setStatement(newVal);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newVal);
    if (newHistory.length > 30) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setStatement(history[newIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setStatement(history[newIdx]);
    }
  };

  // Language Change Sync
  const handleLanguageSelect = (newLang) => {
    setLanguage(newLang);
    // If starterCode or referenceSolution is default or empty, switch to new template
    const tpl = LANGUAGE_TEMPLATES[newLang];
    if (tpl) {
      if (!starterCode || Object.values(LANGUAGE_TEMPLATES).some((t) => t.starterCode.trim() === starterCode.trim())) {
        setStarterCode(tpl.starterCode);
      }
      if (!referenceSolution || Object.values(LANGUAGE_TEMPLATES).some((t) => t.referenceSolution.trim() === referenceSolution.trim())) {
        setReferenceSolution(tpl.referenceSolution);
      }
    }
  };

  // Reset Template
  const handleResetStarter = () => {
    const tpl = LANGUAGE_TEMPLATES[language];
    if (tpl) setStarterCode(tpl.starterCode);
  };

  const handleResetReference = () => {
    const tpl = LANGUAGE_TEMPLATES[language];
    if (tpl) setReferenceSolution(tpl.referenceSolution);
  };

  // Rich-Text Toolbar helper
  const applyToolbarAction = (type) => {
    const textarea = statementRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = statement.substring(start, end);
    let replacement = '';
    let cursorOffset = 0;

    switch (type) {
      case 'h1':
        replacement = `\n# ${selected || 'Heading 1'}\n`;
        break;
      case 'h2':
        replacement = `\n## ${selected || 'Heading 2'}\n`;
        break;
      case 'h3':
        replacement = `\n### ${selected || 'Heading 3'}\n`;
        break;
      case 'bold':
        replacement = `**${selected || 'bold text'}**`;
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'italic':
        replacement = `*${selected || 'italic text'}*`;
        cursorOffset = selected ? replacement.length : 1;
        break;
      case 'code':
        replacement = `\`${selected || 'code'}\``;
        cursorOffset = selected ? replacement.length : 1;
        break;
      case 'bullet':
        replacement = `\n- ${selected || 'List item'}\n`;
        break;
      case 'numbered':
        replacement = `\n1. ${selected || 'First item'}\n`;
        break;
      case 'quote':
        replacement = `\n> ${selected || 'Important note or quote'}\n`;
        break;
      case 'link':
        replacement = `[${selected || 'Link Title'}](https://example.com)`;
        break;
      case 'table':
        replacement = `\n| Column 1 | Column 2 |\n| -------- | -------- |\n| Data 1   | Data 2   |\n`;
        break;
      default:
        return;
    }

    const updated = statement.substring(0, start) + replacement + statement.substring(end);
    handleStatementChange(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + (cursorOffset || replacement.length), start + (cursorOffset || replacement.length));
    }, 10);
  };

  // Examples Management
  const handleAddExample = () => {
    setExamples([
      ...examples,
      {
        input: '',
        output: '',
        explanation: ''
      }
    ]);
  };

  const handleUpdateExample = (idx, field, value) => {
    const updated = [...examples];
    updated[idx][field] = value;
    setExamples(updated);
  };

  const handleRemoveExample = (idx) => {
    if (examples.length <= 1) return;
    setExamples(examples.filter((_, i) => i !== idx));
  };

  // Topics Management
  const handleAddTopic = () => {
    const trimmed = newTopicInput.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics([...topics, trimmed]);
    }
    setNewTopicInput('');
    setIsAddingTopic(false);
  };

  const handleRemoveTopic = (topicToRemove) => {
    setTopics(topics.filter((t) => t !== topicToRemove));
  };

  // AI Generation Trigger
  const handleGenerateAI = () => {
    setIsGeneratingAI(true);
    setError(null);

    // Pick best template matching concept or topic, or fallback
    setTimeout(() => {
      let chosenKey = 'Two Pointers';
      if (aiConcept.toLowerCase().includes('window') || aiPrompt.toLowerCase().includes('window')) {
        chosenKey = 'Sliding Window';
      } else if (aiConcept.toLowerCase().includes('prefix') || aiPrompt.toLowerCase().includes('prefix')) {
        chosenKey = 'Prefix Sums';
      } else if (aiConcept.toLowerCase().includes('search') || aiPrompt.toLowerCase().includes('search')) {
        chosenKey = 'Binary Search';
      } else if (AI_QUESTION_TEMPLATES[aiConcept]) {
        chosenKey = aiConcept;
      }

      const generated = AI_QUESTION_TEMPLATES[chosenKey] || AI_QUESTION_TEMPLATES['Two Pointers'];

      setTitle(generated.title);
      setStatement(generated.statement);
      setInputFormat(generated.inputFormat);
      setOutputFormat(generated.outputFormat);
      setConstraints(generated.constraints);
      setExplanation(generated.explanation);
      setExamples(generated.examples);
      setDifficulty(aiDifficulty);
      setLanguage(aiLanguage);
      setTopics(generated.topics);

      // Adjust templates for chosen language
      const langTpl = LANGUAGE_TEMPLATES[aiLanguage] || LANGUAGE_TEMPLATES.java;
      setStarterCode(langTpl.starterCode);
      setReferenceSolution(langTpl.referenceSolution);

      setIsGeneratingAI(false);
      setAiSuccessBanner(true);
      setActiveTab('details');

      setTimeout(() => setAiSuccessBanner(false), 5000);
    }, 800);
  };

  // Completeness Calculation (100% dynamic)
  const completenessDetails = useMemo(() => {
    const items = [
      {
        id: 'basic',
        label: 'Basic Information',
        isComplete: title.trim().length >= 3 && Boolean(difficulty) && Boolean(language)
      },
      {
        id: 'statement',
        label: 'Problem Statement',
        isComplete: statement.trim().length >= 15
      },
      {
        id: 'io',
        label: 'Input / Output Format',
        isComplete: inputFormat.trim().length > 0 || outputFormat.trim().length > 0
      },
      {
        id: 'constraints',
        label: 'Constraints',
        isComplete: constraints.trim().length > 0
      },
      {
        id: 'examples',
        label: 'Examples',
        isComplete: examples.length > 0 && examples[0].input.trim().length > 0 && examples[0].output.trim().length > 0
      },
      {
        id: 'explanation',
        label: 'Explanation',
        isComplete: explanation.trim().length > 0 || examples.some((ex) => ex.explanation?.trim().length > 0)
      },
      {
        id: 'code',
        label: 'Code (Starter & Reference)',
        isComplete: starterCode.trim().length > 10 && referenceSolution.trim().length > 10
      }
    ];

    const completedCount = items.filter((i) => i.isComplete).length;
    const percentage = Math.round((completedCount / items.length) * 100);

    return { items, percentage };
  }, [
    title,
    difficulty,
    language,
    statement,
    inputFormat,
    outputFormat,
    constraints,
    examples,
    explanation,
    starterCode,
    referenceSolution
  ]);

  // Submit Handler (Draft or Publish)
  const handleSaveQuestion = async (targetStatus = 'published') => {
    if (!title.trim()) {
      setError('Question Title is required.');
      setActiveTab('details');
      return;
    }
    if (!statement.trim()) {
      setError('Problem Statement is required.');
      setActiveTab('details');
      return;
    }

    if (targetStatus === 'draft') {
      setSaveDraftLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Build composite statement if separate input/output formats are populated
      let finalStatement = statement;
      if (inputFormat.trim() && !finalStatement.includes('**Input Format:**')) {
        finalStatement += `\n\n### Input Format\n${inputFormat}`;
      }
      if (outputFormat.trim() && !finalStatement.includes('**Output Format:**')) {
        finalStatement += `\n\n### Output Format\n${outputFormat}`;
      }

      const payload = {
        title: title.trim(),
        statement: finalStatement,
        constraints: constraints.trim(),
        language,
        difficulty,
        tags: topics,
        examples: examples.map((ex) => ({
          input: ex.input || 'Sample Input',
          output: ex.output || 'Sample Output',
          explanation: ex.explanation || ''
        })),
        starterCode: starterCode || LANGUAGE_TEMPLATES[language]?.starterCode || '',
        referenceSolution: referenceSolution || LANGUAGE_TEMPLATES[language]?.referenceSolution || '',
        status: targetStatus,
        ...(currentUser && { ownerId: currentUser.id || currentUser._id })
      };

      if (isEditing) {
        await api.patch(`/questions/${initialQuestion._id}`, payload);
      } else {
        await api.post('/questions', payload);
      }

      setSuccessMsg(
        targetStatus === 'draft'
          ? 'Draft successfully saved!'
          : isEditing
          ? 'Question updated successfully!'
          : 'Question published successfully!'
      );

      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 700);
    } catch (err) {
      const serverMsg =
        err.response?.data?.error?.message ||
        err?.customMessage ||
        'Failed to save question. Please check all fields.';
      setError(serverMsg);
    } finally {
      setLoading(false);
      setSaveDraftLoading(false);
    }
  };

  return (
    <div className="w-full pb-16 animate-fadeIn select-none">
      {/* ────────────────────────────────────────────────────────────────────────────
          1. TOP HEADER & BREADCRUMB
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
        <div>
          {/* Eyebrow matching screenshot */}
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-xs" />
            <span className="text-[11px] font-extrabold tracking-wider text-[#777D78] uppercase">
              TESTFORGE / QUESTION AUTHORING WORKSPACE
            </span>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl font-black text-[#171819] tracking-tight flex items-center gap-3">
            {isEditing ? `Edit Question: ${title || initialQuestion.title}` : 'Create Question'}
          </h1>
          <p className="text-xs text-[#777D78] font-medium mt-0.5">
            Design, configure and publish programming challenges.
          </p>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3 py-1.5 rounded-full bg-white border border-[#DDE1DA] flex items-center gap-1.5 text-xs font-bold text-[#777D78]">
            <span className={`w-2 h-2 rounded-full ${isEditing ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            <span>{isEditing ? 'Editing' : 'Draft'}</span>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#777D78] hover:text-[#171819] border border-[#DDE1DA] transition-all cursor-pointer flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <button
            type="button"
            disabled={saveDraftLoading || loading}
            onClick={() => handleSaveQuestion('draft')}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5 text-[#777D78]" />
            <span>{saveDraftLoading ? 'Saving...' : 'Save Draft'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-[#777D78]" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleSaveQuestion('published')}
            className="px-5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-black text-[#191A1D] shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5 fill-current" />
            <span>{loading ? 'Publishing...' : isEditing ? 'Update & Publish' : 'Publish Question'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          2. HERO ROW: MODE SELECTORS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Mode Switcher Pills */}
        <div className="flex items-center gap-2 bg-white/70 p-1 rounded-full border border-[#DDE1DA]">
          <button
            type="button"
            onClick={() => setCreationMode('manual')}
            className={`px-5 py-2 rounded-full text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              creationMode === 'manual'
                ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Manual Creation</span>
          </button>

          <button
            type="button"
            onClick={() => setCreationMode('ai')}
            className={`px-5 py-2 rounded-full text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              creationMode === 'ai'
                ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Assisted Creation</span>
          </button>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          3. AI-ASSISTED CREATION CARD (SHOWN IN AI MODE OR TOGGLED)
          ──────────────────────────────────────────────────────────────────────────── */}
      {creationMode === 'ai' && (
        <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-5 mb-5 shadow-xs animate-fadeIn">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#DDE1DA]/60">
            {/* Header info */}
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-[#EDFF72] text-[#191A1D] flex items-center justify-center font-bold shadow-xs">
                <Sparkles className="w-5 h-5 fill-current" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-[#171819]">AI-Assisted Creation</h3>
                <p className="text-xs text-[#777D78]">
                  Generate a complete, editable question with AI based on your inputs.
                </p>
              </div>
            </div>

            {/* Quick selectors matching screenshot */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
              <div>
                <label className="text-[10px] font-bold text-[#777D78] block mb-1">Topic</label>
                <select
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none"
                >
                  <option value="Arrays">Arrays</option>
                  <option value="Strings">Strings</option>
                  <option value="Hash Tables">Hash Tables</option>
                  <option value="Dynamic Programming">Dynamic Programming</option>
                  <option value="Binary Search">Binary Search</option>
                  <option value="Trees">Trees</option>
                  <option value="Graphs">Graphs</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#777D78] block mb-1">Difficulty</label>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value)}
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#777D78] block mb-1">Language</label>
                <select
                  value={aiLanguage}
                  onChange={(e) => setAiLanguage(e.target.value)}
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none"
                >
                  <option value="java">Java</option>
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="cpp">C++</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#777D78] block mb-1">Concept</label>
                <input
                  type="text"
                  value={aiConcept}
                  onChange={(e) => setAiConcept(e.target.value)}
                  placeholder="e.g. Two Pointers"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Prompt row */}
          <div className="mt-3.5 flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe the question you want to create..."
                className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-full pl-4 pr-10 py-2.5 text-xs font-medium text-[#171819] focus:outline-none focus:border-[#191A1D] transition-colors"
              />
              <Sparkles className="w-4 h-4 text-[#777D78] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              disabled={isGeneratingAI}
              onClick={handleGenerateAI}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-black text-[#191A1D] flex items-center justify-center gap-1.5 shadow-xs transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>{isGeneratingAI ? 'Generating...' : 'Generate'}</span>
            </button>
          </div>

          {aiSuccessBanner && (
            <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Question generated! Review and fine-tune your parameters below.</span>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          4. MAIN TWO-COLUMN WORKSPACE
          Left: Authoring Area (72%)
          Right: Sticky Configuration & Completeness Panels (28%)
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── LEFT COLUMN (72% approx: 8 or 9 cols out of 12) ── */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* Main Card with Tabs */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-6 shadow-xs">
            {/* Top Tab Bar matching screenshot */}
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#DDE1DA]/60">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'details'
                    ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                    : 'bg-white hover:bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] border border-[#DDE1DA]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Question Details</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('starter')}
                className={`px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'starter'
                    ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                    : 'bg-white hover:bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] border border-[#DDE1DA]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Starter Code</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('reference')}
                className={`px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'reference'
                    ? 'bg-[#EDFF72] text-[#191A1D] shadow-xs'
                    : 'bg-white hover:bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] border border-[#DDE1DA]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Reference Solution</span>
              </button>
            </div>

            {/* TAB 1: QUESTION DETAILS */}
            {activeTab === 'details' && (
              <div className="space-y-5 animate-fadeIn">
                {/* A. QUESTION TITLE */}
                <div>
                  <label className="block text-xs font-black text-[#171819] mb-1.5">
                    Question Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a clear and concise question title..."
                    className="w-full bg-[#FFFFFF] border border-[#DDE1DA] rounded-xl px-4 py-3 text-sm font-semibold text-[#171819] placeholder:text-[#CBD0C8] focus:outline-none focus:border-[#191A1D] focus:ring-1 focus:ring-[#191A1D] transition-colors"
                  />
                </div>

                {/* B. PROBLEM STATEMENT WITH RICH-TEXT TOOLBAR */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-black text-[#171819]">
                      Problem Statement <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-[#777D78]">Markdown formatting supported</span>
                  </div>

                  <div className="border border-[#DDE1DA] rounded-2xl overflow-hidden focus-within:border-[#191A1D] transition-colors">
                    {/* Rich-Text Toolbar matching screenshot */}
                    <div className="bg-[#F2F3F0] border-b border-[#DDE1DA] px-3 py-2 flex items-center gap-1 flex-wrap select-none">
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('h1')}
                        title="Heading 1"
                        className="px-2 py-1 rounded-md text-xs font-bold text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        H1
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('h2')}
                        title="Heading 2"
                        className="px-2 py-1 rounded-md text-xs font-bold text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('h3')}
                        title="Heading 3"
                        className="px-2 py-1 rounded-md text-xs font-bold text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        H3
                      </button>

                      <div className="w-px h-4 bg-[#DDE1DA] mx-1" />

                      <button
                        type="button"
                        onClick={() => applyToolbarAction('bold')}
                        title="Bold"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('italic')}
                        title="Italic"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('code')}
                        title="Inline Code"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer font-mono text-xs"
                      >
                        <Code className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-[#DDE1DA] mx-1" />

                      <button
                        type="button"
                        onClick={() => applyToolbarAction('bullet')}
                        title="Bullet List"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('numbered')}
                        title="Numbered List"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('quote')}
                        title="Quote"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <Quote className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-[#DDE1DA] mx-1" />

                      <button
                        type="button"
                        onClick={() => applyToolbarAction('link')}
                        title="Insert Link"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToolbarAction('table')}
                        title="Insert Table"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer"
                      >
                        <TableIcon className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex-1" />

                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        title="Undo"
                        className={`p-1.5 rounded-md transition-colors ${
                          historyIndex === 0
                            ? 'text-slate-300'
                            : 'text-[#171819] hover:bg-white cursor-pointer'
                        }`}
                      >
                        <Undo className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRedo}
                        disabled={historyIndex >= history.length - 1}
                        title="Redo"
                        className={`p-1.5 rounded-md transition-colors ${
                          historyIndex >= history.length - 1
                            ? 'text-slate-300'
                            : 'text-[#171819] hover:bg-white cursor-pointer'
                        }`}
                      >
                        <Redo className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsFullscreenEditor(!isFullscreenEditor)}
                        title="Toggle Fullscreen"
                        className="p-1.5 rounded-md text-[#171819] hover:bg-white transition-colors cursor-pointer ml-1"
                      >
                        {isFullscreenEditor ? (
                          <Minimize2 className="w-3.5 h-3.5" />
                        ) : (
                          <Maximize2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <textarea
                      ref={statementRef}
                      rows={isFullscreenEditor ? 22 : 9}
                      value={statement}
                      onChange={(e) => handleStatementChange(e.target.value)}
                      placeholder="Write the complete problem statement here...&#10;You can use formatting, code blocks, lists, and more."
                      className="w-full bg-[#FFFFFF] p-4 text-xs font-normal text-[#171819] leading-relaxed placeholder:text-[#CBD0C8] focus:outline-none resize-y font-sans"
                    />
                  </div>
                </div>

                {/* C. INPUT FORMAT & OUTPUT FORMAT (SIDE BY SIDE) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-4 shadow-xs">
                    <label className="flex items-center gap-1.5 text-xs font-black text-[#171819] mb-2">
                      <ArrowRight className="w-3.5 h-3.5 text-[#777D78]" />
                      <span>Input Format</span>
                    </label>
                    <textarea
                      rows={3}
                      value={inputFormat}
                      onChange={(e) => setInputFormat(e.target.value)}
                      placeholder="Describe the input format..."
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] placeholder:text-[#CBD0C8] focus:outline-none focus:border-[#191A1D] transition-colors resize-none"
                    />
                  </div>

                  <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-4 shadow-xs">
                    <label className="flex items-center gap-1.5 text-xs font-black text-[#171819] mb-2">
                      <ArrowRight className="w-3.5 h-3.5 text-[#777D78]" />
                      <span>Output Format</span>
                    </label>
                    <textarea
                      rows={3}
                      value={outputFormat}
                      onChange={(e) => setOutputFormat(e.target.value)}
                      placeholder="Describe the output format..."
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] placeholder:text-[#CBD0C8] focus:outline-none focus:border-[#191A1D] transition-colors resize-none"
                    />
                  </div>
                </div>

                {/* D. CONSTRAINTS (FULL WIDTH) */}
                <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-1.5 text-xs font-black text-[#171819]">
                      <Layers className="w-3.5 h-3.5 text-[#777D78]" />
                      <span>Constraints</span>
                    </label>
                    <span className="text-[10px] text-[#777D78] font-semibold">e.g., 1 ≤ n ≤ 10⁵</span>
                  </div>
                  <textarea
                    rows={2}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="Add problem constraints (e.g., 1 ≤ n ≤ 10⁵)..."
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs font-mono text-[#171819] placeholder:text-[#CBD0C8] focus:outline-none focus:border-[#191A1D] transition-colors resize-none"
                  />
                </div>

                {/* E. EXAMPLES & EXPLANATION (SIDE BY SIDE) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Examples Card */}
                  <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="flex items-center gap-1.5 text-xs font-black text-[#171819]">
                        <Code2 className="w-3.5 h-3.5 text-[#777D78]" />
                        <span>Examples</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleAddExample}
                        className="text-[11px] font-bold text-[#171819] hover:text-black flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-[#777D78]" />
                        <span>Add Example</span>
                      </button>
                    </div>

                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {examples.map((ex, idx) => (
                        <div
                          key={idx}
                          className="bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 relative group"
                        >
                          {examples.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExample(idx)}
                              title="Delete Example"
                              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span className="text-[10px] font-bold text-[#777D78] uppercase block mb-1">
                            Example {idx + 1}
                          </span>

                          <div className="space-y-2">
                            <div>
                              <span className="text-[10px] font-semibold text-[#777D78] block">Sample Input</span>
                              <input
                                type="text"
                                value={ex.input}
                                onChange={(e) => handleUpdateExample(idx, 'input', e.target.value)}
                                placeholder="e.g. nums = [2, 7, 11, 15], target = 9"
                                className="w-full bg-white border border-[#DDE1DA] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#171819] focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-[#777D78] block">Sample Output</span>
                              <input
                                type="text"
                                value={ex.output}
                                onChange={(e) => handleUpdateExample(idx, 'output', e.target.value)}
                                placeholder="e.g. [0, 1]"
                                className="w-full bg-white border border-[#DDE1DA] rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-600 font-bold focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-[#777D78] block">Explanation (Optional)</span>
                              <input
                                type="text"
                                value={ex.explanation}
                                onChange={(e) => handleUpdateExample(idx, 'explanation', e.target.value)}
                                placeholder="Brief reason why this output is correct..."
                                className="w-full bg-white border border-[#DDE1DA] rounded-lg px-2.5 py-1.5 text-xs text-[#171819] focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Explanation Card */}
                  <div className="bg-[#FFFFFF] border border-[#DDE1DA] rounded-2xl p-4 shadow-xs">
                    <label className="flex items-center gap-1.5 text-xs font-black text-[#171819] mb-2">
                      <BookOpen className="w-3.5 h-3.5 text-[#777D78]" />
                      <span>Explanation</span>
                    </label>
                    <textarea
                      rows={8}
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="Provide a brief explanation for the example or approach..."
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] placeholder:text-[#CBD0C8] focus:outline-none focus:border-[#191A1D] transition-colors resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STARTER CODE */}
            {activeTab === 'starter' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#F2F3F0] p-3 rounded-2xl border border-[#DDE1DA]">
                  <div>
                    <span className="text-xs font-extrabold text-[#171819] block">Student Starter Code</span>
                    <span className="text-[11px] text-[#777D78]">
                      Initial scaffold loaded in the student editor during assessment.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetStarter}
                      className="px-3 py-1.5 rounded-full bg-white hover:bg-[#E9ECE7] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-[#777D78]" />
                      <span>Reset</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(starterCode);
                        setCopiedStarter(true);
                        setTimeout(() => setCopiedStarter(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-full bg-white hover:bg-[#E9ECE7] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center gap-1 cursor-pointer"
                    >
                      {copiedStarter ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#777D78]" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-[#191A1D]/20 bg-[#191A1D] shadow-inner">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#26282E] text-slate-400 text-xs font-mono border-b border-white/5">
                    <span className="text-white font-bold">{LANGUAGE_TEMPLATES[language]?.name || language}</span>
                    <span>Student Scaffold</span>
                  </div>
                  <textarea
                    rows={16}
                    value={starterCode}
                    onChange={(e) => setStarterCode(e.target.value)}
                    className="w-full bg-transparent p-4 font-mono text-xs text-emerald-300 leading-relaxed focus:outline-none resize-none"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: REFERENCE SOLUTION */}
            {activeTab === 'reference' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#F2F3F0] p-3 rounded-2xl border border-[#DDE1DA]">
                  <div>
                    <span className="text-xs font-extrabold text-[#171819] block">Faculty Reference Solution</span>
                    <span className="text-[11px] text-[#777D78]">
                      Private verified implementation used for reference and test validation.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetReference}
                      className="px-3 py-1.5 rounded-full bg-white hover:bg-[#E9ECE7] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-[#777D78]" />
                      <span>Reset</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(referenceSolution);
                        setCopiedRef(true);
                        setTimeout(() => setCopiedRef(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-full bg-white hover:bg-[#E9ECE7] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center gap-1 cursor-pointer"
                    >
                      {copiedRef ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#777D78]" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-[#191A1D]/20 bg-[#191A1D] shadow-inner">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#26282E] text-slate-400 text-xs font-mono border-b border-white/5">
                    <span className="text-[#EDFF72] font-bold">{LANGUAGE_TEMPLATES[language]?.name || language}</span>
                    <span className="text-amber-400 font-bold">Faculty Only</span>
                  </div>
                  <textarea
                    rows={16}
                    value={referenceSolution}
                    onChange={(e) => setReferenceSolution(e.target.value)}
                    className="w-full bg-transparent p-4 font-mono text-xs text-amber-200 leading-relaxed focus:outline-none resize-none"
                    spellCheck={false}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN (28% approx: 4 or 3 cols out of 12) ── */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4 sticky top-4">
          {/* CARD A: QUESTION COMPLETENESS */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <h3 className="text-xs font-black text-[#171819] flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-[#777D78]" />
              <span>Question Completeness</span>
            </h3>

            <div className="flex items-center gap-5">
              {/* Circular Gauge matching screenshot */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#E9ECE7]"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#EDFF72] transition-all duration-700 ease-out"
                    strokeDasharray={`${completenessDetails.percentage}, 100`}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-black text-[#171819] tracking-tight">
                    {completenessDetails.percentage}%
                  </span>
                </div>
              </div>

              {/* Checklist items */}
              <div className="space-y-1.5 flex-1 min-w-0">
                {completenessDetails.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-[11px]">
                    {item.isComplete ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-[#CBD0C8] shrink-0" />
                    )}
                    <span
                      className={`truncate ${
                        item.isComplete ? 'font-bold text-[#171819]' : 'text-[#777D78]'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD B: QUESTION CONFIGURATION */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <h3 className="text-xs font-black text-[#171819] flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-[#777D78]" />
              <span>Question Configuration</span>
            </h3>

            <div className="space-y-3.5">
              {/* Language Selector */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#777D78]">Language</span>
                <select
                  value={language}
                  onChange={(e) => handleLanguageSelect(e.target.value)}
                  className="bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                >
                  <option value="java">Java 17/21</option>
                  <option value="javascript">JavaScript ES6</option>
                  <option value="python">Python 3</option>
                  <option value="cpp">C++ 20</option>
                </select>
              </div>

              {/* Difficulty Selector */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#777D78]">Difficulty</span>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="bg-[#F2F3F0] hover:bg-[#E9ECE7] border border-[#DDE1DA] rounded-xl px-3 py-1.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              {/* Topics / Tags Chips */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#777D78]">Topics</span>
                  <button
                    type="button"
                    onClick={() => setIsAddingTopic(true)}
                    className="text-[11px] font-bold text-[#171819] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#777D78]" />
                    <span>Add Topic</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center">
                  {topics.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F2F3F0] text-[#171819] border border-[#DDE1DA]"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTopic(t)}
                        className="text-[#777D78] hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {isAddingTopic ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newTopicInput}
                        onChange={(e) => setNewTopicInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTopic();
                          else if (e.key === 'Escape') setIsAddingTopic(false);
                        }}
                        placeholder="Tag..."
                        className="w-20 bg-white border border-[#191A1D] rounded-full px-2 py-0.5 text-[11px] text-[#171819] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTopic}
                        className="text-[10px] font-bold bg-[#EDFF72] text-[#191A1D] px-2 py-0.5 rounded-full"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingTopic(true)}
                      className="text-[10px] font-bold text-[#777D78] hover:text-[#171819] px-2 py-1 rounded-full border border-dashed border-[#DDE1DA] cursor-pointer"
                    >
                      + Add Topic
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CARD C: QUICK ACTIONS */}
          <div className="bg-white border border-[#DDE1DA] rounded-[28px] p-5 shadow-xs">
            <h3 className="text-xs font-black text-[#171819] flex items-center gap-2 mb-3.5">
              <Sparkles className="w-4 h-4 text-[#777D78]" />
              <span>Quick Actions</span>
            </h3>

            <div className="space-y-2.5">
              {/* Preview Button (Large Lime matching screenshot) */}
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="w-full py-3 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-xs font-extrabold text-[#191A1D] flex items-center justify-center gap-2 shadow-xs transition-transform active:scale-98 cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>Preview Question</span>
              </button>

              {/* Bottom Row: Save Draft & Publish Question */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saveDraftLoading || loading}
                  onClick={() => handleSaveQuestion('draft')}
                  className="py-2.5 px-3 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-[#777D78]" />
                  <span>{saveDraftLoading ? 'Saving...' : 'Save Draft'}</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSaveQuestion('published')}
                  className="py-2.5 px-3 rounded-full bg-white hover:bg-[#F2F3F0] text-xs font-bold text-[#171819] border border-[#DDE1DA] flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-[#777D78]" />
                  <span>{loading ? 'Publishing...' : 'Publish Question'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          5. STUDENT PREVIEW MODAL
          ──────────────────────────────────────────────────────────────────────────── */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-[#DDE1DA] max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#DDE1DA] flex items-center justify-between bg-[#F2F3F0]">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-[#EDFF72] text-[#191A1D] flex items-center justify-center font-bold">
                  <Eye className="w-4 h-4" />
                </span>
                <div>
                  <span className="text-[10px] font-bold text-[#777D78] uppercase">Student Perspective</span>
                  <h3 className="text-base font-extrabold text-[#171819] leading-tight">
                    {title || 'Untitled Assessment Challenge'}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-[#DDE1DA] text-[#777D78] hover:text-[#171819] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#171819]">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-[#EDFF72] text-[#191A1D] font-black text-xs">
                  {difficulty}
                </span>
                <span className="px-3 py-1 rounded-full bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] font-bold text-xs">
                  {LANGUAGE_TEMPLATES[language]?.name || language}
                </span>
                {topics.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-full bg-white border border-[#DDE1DA] text-[#777D78] font-semibold text-[11px]"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {/* Problem Statement */}
              <div className="bg-[#F2F3F0] rounded-2xl p-5 border border-[#DDE1DA] leading-relaxed whitespace-pre-wrap font-sans">
                {statement || 'No problem statement provided yet.'}
              </div>

              {/* Input / Output Format */}
              {(inputFormat || outputFormat) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {inputFormat && (
                    <div className="p-4 rounded-xl bg-white border border-[#DDE1DA]">
                      <span className="text-[10px] font-bold text-[#777D78] uppercase block mb-1">
                        Input Format
                      </span>
                      <p className="text-xs text-[#171819] font-medium">{inputFormat}</p>
                    </div>
                  )}
                  {outputFormat && (
                    <div className="p-4 rounded-xl bg-white border border-[#DDE1DA]">
                      <span className="text-[10px] font-bold text-[#777D78] uppercase block mb-1">
                        Output Format
                      </span>
                      <p className="text-xs text-[#171819] font-medium">{outputFormat}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Constraints */}
              {constraints && (
                <div className="p-4 rounded-xl bg-white border border-[#DDE1DA]">
                  <span className="text-[10px] font-bold text-[#777D78] uppercase block mb-1">
                    Constraints
                  </span>
                  <pre className="text-xs font-mono text-[#171819] whitespace-pre-wrap">{constraints}</pre>
                </div>
              )}

              {/* Examples */}
              <div className="space-y-3">
                <span className="text-xs font-black text-[#171819] block">Examples</span>
                {examples.map((ex, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-white border border-[#DDE1DA] space-y-2">
                    <span className="text-[10px] font-bold text-[#777D78] uppercase block">
                      Example {idx + 1}
                    </span>
                    <div className="font-mono text-xs">
                      <div>
                        <span className="text-[#777D78]">Input: </span>
                        <span className="font-bold text-[#171819]">{ex.input}</span>
                      </div>
                      <div>
                        <span className="text-[#777D78]">Output: </span>
                        <span className="font-bold text-emerald-600">{ex.output}</span>
                      </div>
                    </div>
                    {ex.explanation && (
                      <p className="text-xs text-[#777D78] italic pt-1 border-t border-[#DDE1DA]/60">
                        Explanation: {ex.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Starter Code Preview */}
              <div>
                <span className="text-xs font-black text-[#171819] block mb-2">Student Starter Code</span>
                <div className="rounded-2xl bg-[#191A1D] p-4 font-mono text-xs text-emerald-300 overflow-x-auto">
                  <pre>{starterCode}</pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#DDE1DA] flex justify-end gap-2 bg-[#F2F3F0]">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-5 py-2 rounded-full bg-white hover:bg-[#E4E8E2] text-xs font-bold text-[#171819] border border-[#DDE1DA] cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionCreatorView;
