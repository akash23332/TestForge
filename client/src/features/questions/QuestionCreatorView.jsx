import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Check,
  CheckCircle2,
  Circle,
  AlertCircle,
  Trash2,
  Plus,
  Copy,
  RotateCcw,
  Eye,
  Save,
  Send,
  ArrowLeft,
  Code2,
  Layers,
  Cpu,
  Heading1,
  Heading2,
  Bold,
  Italic,
  Code,
  List,
  Quote,
  X
} from 'lucide-react';
import { api } from '../../lib/api';
import CodeEditor from '../../components/editor/CodeEditor';

// Helper to smoothly count up numbers like Question Bank
const AnimatedCount = ({ value, duration = 900 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const numVal = Number(value) || 0;
    const step = (now) => {
      const elapsed = now - start;
      const k = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(numVal * eased));
      if (k < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{display}</>;
};

// Standardized code templates per execution mode and language
export const STANDARDIZED_TEMPLATES = {
  FUNCTION: {
    javascript: {
      name: 'JavaScript',
      starterCode: `function solution(a, b) {
  // Write your code here
}
`,
      referenceSolution: `function solution(a, b) {
  return a + b;
}
`
    },
    python: {
      name: 'Python',
      starterCode: `def solution(a, b):
    # Write your code here
    pass
`,
      referenceSolution: `def solution(a, b):
    return a + b
`
    },
    java: {
      name: 'Java',
      starterCode: `class Solution {
    public int solution(int a, int b) {
        // Write your code here
        return 0;
    }
}
`,
      referenceSolution: `class Solution {
    public int solution(int a, int b) {
        return a + b;
    }
}
`
    },
    cpp: {
      name: 'C++',
      starterCode: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int solution(int a, int b) {
        // Write your code here
        return 0;
    }
};
`,
      referenceSolution: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int solution(int a, int b) {
        return a + b;
    }
};
`
    }
  },
  STDIN: {
    javascript: {
      name: 'JavaScript',
      starterCode: `const fs = require('fs');

function main() {
  const input = fs.readFileSync('/dev/stdin', 'utf-8');
  // Write your code here
}

main();
`,
      referenceSolution: `const fs = require('fs');

function main() {
  const input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
  if (!input) return;
  const [a, b] = input.split(/\\s+/).map(Number);
  console.log(a + b);
}

main();
`
    },
    python: {
      name: 'Python',
      starterCode: `import sys

def main():
    lines = sys.stdin.read().split()
    if not lines:
        return
    # Write your code here

if __name__ == '__main__':
    main()
`,
      referenceSolution: `import sys

def main():
    lines = sys.stdin.read().split()
    if not lines:
        return
    a, b = map(int, lines[:2])
    print(a + b)

if __name__ == '__main__':
    main()
`
    },
    java: {
      name: 'Java',
      starterCode: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your code here
    }
}
`,
      referenceSolution: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}
`
    },
    cpp: {
      name: 'C++',
      starterCode: `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    return 0;
}
`,
      referenceSolution: `#include <iostream>
using namespace std;

int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << (a + b) << endl;
    }
    return 0;
}
`
    }
  },
  LINKED_LIST: {
    javascript: {
      name: 'JavaScript',
      starterCode: `/**
 * Definition for singly-linked list.
 * function ListNode(val, next) {
 *     this.val = (val===undefined ? 0 : val)
 *     this.next = (next===undefined ? null : next)
 * }
 */
function reverseList(head) {
  // Write your code here
}
`,
      referenceSolution: `function reverseList(head) {
  let prev = null;
  while (head) {
    let nxt = head.next;
    head.next = prev;
    prev = head;
    head = nxt;
  }
  return prev;
}
`
    },
    python: {
      name: 'Python',
      starterCode: `class Solution:
    def reverseList(self, head):
        # Write your code here
        pass
`,
      referenceSolution: `class Solution:
    def reverseList(self, head):
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev
`
    },
    java: {
      name: 'Java',
      starterCode: `class Solution {
    public ListNode reverseList(ListNode head) {
        // Write your code here
        return null;
    }
}
`,
      referenceSolution: `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        while (head != null) {
            ListNode nxt = head.next;
            head.next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
}
`
    },
    cpp: {
      name: 'C++',
      starterCode: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        // Write your code here
        return nullptr;
    }
};
`,
      referenceSolution: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* nxt = head->next;
            head->next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
};
`
    }
  },
  BINARY_TREE: {
    javascript: {
      name: 'JavaScript',
      starterCode: `/**
 * Definition for a binary tree node.
 * function TreeNode(val, left, right) {
 *     this.val = (val===undefined ? 0 : val)
 *     this.left = (left===undefined ? null : left)
 *     this.right = (right===undefined ? null : right)
 * }
 */
function invertTree(root) {
  // Write your code here
}
`,
      referenceSolution: `function invertTree(root) {
  if (!root) return null;
  const temp = root.left;
  root.left = invertTree(root.right);
  root.right = invertTree(temp);
  return root;
}
`
    },
    python: {
      name: 'Python',
      starterCode: `class Solution:
    def invertTree(self, root):
        # Write your code here
        pass
`,
      referenceSolution: `class Solution:
    def invertTree(self, root):
        if not root:
            return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root
`
    },
    java: {
      name: 'Java',
      starterCode: `class Solution {
    public TreeNode invertTree(TreeNode root) {
        // Write your code here
        return null;
    }
}
`,
      referenceSolution: `class Solution {
    public TreeNode invertTree(TreeNode root) {
        if (root == null) return null;
        TreeNode temp = root.left;
        root.left = invertTree(root.right);
        root.right = invertTree(temp);
        return root;
    }
}
`
    },
    cpp: {
      name: 'C++',
      starterCode: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        // Write your code here
        return nullptr;
    }
};
`,
      referenceSolution: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        TreeNode* temp = root->left;
        root->left = invertTree(root->right);
        root->right = invertTree(temp);
        return root;
    }
};
`
    }
  }
};

export const DATA_STRUCTURE_OPTIONS = [
  { id: 'ARRAY', label: 'Array / Primitives', defaultFn: 'solution' },
  { id: 'STRING', label: 'String', defaultFn: 'solution' },
  { id: 'LINKED_LIST', label: 'Linked List (ListNode)', defaultFn: 'reverseList' },
  { id: 'BINARY_TREE', label: 'Binary Tree (TreeNode)', defaultFn: 'invertTree' }
];

export const getStandardTemplate = (mode, lang, dataStructure = 'ARRAY') => {
  const m = mode === 'STDIN' ? 'STDIN' : 'FUNCTION';
  if (m === 'FUNCTION' && (dataStructure === 'LINKED_LIST' || dataStructure === 'BINARY_TREE')) {
    return STANDARDIZED_TEMPLATES[dataStructure]?.[lang] || STANDARDIZED_TEMPLATES.FUNCTION[lang];
  }
  return STANDARDIZED_TEMPLATES[m]?.[lang] || STANDARDIZED_TEMPLATES.FUNCTION[lang];
};

export const LANGUAGE_TEMPLATES = STANDARDIZED_TEMPLATES.FUNCTION;

const SUPPORTED_LANGS = [
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'cpp', label: 'C++' }
];

export const QuestionCreatorView = ({
  initialQuestion,
  onSuccess,
  onCancel,
  currentUser
}) => {
  const isEditing = Boolean(initialQuestion && initialQuestion._id);

  // Helper to cleanly extract and decouple statement, inputFormat and outputFormat
  const parseStatementAndFormats = (rawStmt = '', rawIn = '', rawOut = '') => {
    let stmt = String(rawStmt || '');
    let inFmt = String(rawIn || '').trim();
    let outFmt = String(rawOut || '').trim();

    const inRegex = /###\s*Input Format\s*\n([\s\S]*?)(?=(?:###\s*Output Format|$))/i;
    const outRegex = /###\s*Output Format\s*\n([\s\S]*?)(?=(?:###|$))/i;

    if (!inFmt) {
      const match = stmt.match(inRegex);
      if (match && match[1]) {
        inFmt = match[1].trim();
      }
    }
    if (!outFmt) {
      const match = stmt.match(outRegex);
      if (match && match[1]) {
        outFmt = match[1].trim();
      }
    }

    const inBoldRegex = /\*\*Input Format:\*\*\s*([\s\S]*?)(?=(?:\*\*Output Format:\*\*|$))/i;
    const outBoldRegex = /\*\*Output Format:\*\*\s*([\s\S]*?)(?=(?:\*\*|$))/i;

    if (!inFmt) {
      const match = stmt.match(inBoldRegex);
      if (match && match[1]) {
        inFmt = match[1].trim();
      }
    }
    if (!outFmt) {
      const match = stmt.match(outBoldRegex);
      if (match && match[1]) {
        outFmt = match[1].trim();
      }
    }

    const cleanedStmt = stmt
      .replace(inRegex, '')
      .replace(outRegex, '')
      .replace(inBoldRegex, '')
      .replace(outBoldRegex, '')
      .trim();

    return { stmt: cleanedStmt, inFmt, outFmt };
  };

  const initialParsed = useMemo(() => {
    return parseStatementAndFormats(
      initialQuestion?.statement,
      initialQuestion?.inputFormat,
      initialQuestion?.outputFormat
    );
  }, [initialQuestion]);

  // 1. Tab states
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'starter' | 'reference'
  const [previewTab, setPreviewTab] = useState('problem'); // 'problem' | 'example' | 'starter'

  // 2. Core Question Fields
  const [title, setTitle] = useState(initialQuestion?.title || '');
  const [statement, setStatement] = useState(initialParsed.stmt);
  const [inputFormat, setInputFormat] = useState(initialParsed.inFmt);
  const [outputFormat, setOutputFormat] = useState(initialParsed.outFmt);
  const [constraints, setConstraints] = useState(
    initialQuestion?.constraints || '1 ≤ |s| ≤ 10^5\nTime limit: 1.0s\nMemory limit: 256MB'
  );
  const [explanation, setExplanation] = useState(initialQuestion?.explanation || '');

  // 3. Examples List
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
        input: 'swiss',
        output: 'w',
        explanation: 'w is the first character that appears once.'
      }
    ];
  });

  // 4. Configuration Fields
  const [language, setLanguage] = useState(initialQuestion?.language || 'javascript');
  const [executionMode, setExecutionMode] = useState(initialQuestion?.executionMode || 'FUNCTION');
  const [dataStructure, setDataStructure] = useState(initialQuestion?.dataStructure || 'ARRAY');
  const [functionName, setFunctionName] = useState(initialQuestion?.functionName || 'solution');
  const [returnType, setReturnType] = useState(initialQuestion?.returnType || initialQuestion?.functionSignature?.returnType || 'void');
  const [difficulty, setDifficulty] = useState(initialQuestion?.difficulty || 'Medium');
  const [topics, setTopics] = useState(() => {
    if (Array.isArray(initialQuestion?.tags) && initialQuestion.tags.length > 0) {
      return initialQuestion.tags;
    }
    return ['Algorithms', 'Array'];
  });
  const [newTopicInput, setNewTopicInput] = useState('');

  // 5. Code Editors
  const [starterCode, setStarterCode] = useState(
    initialQuestion?.starterCode || getStandardTemplate(initialQuestion?.executionMode || 'FUNCTION', initialQuestion?.language || 'javascript')?.starterCode || ''
  );
  const [referenceSolution, setReferenceSolution] = useState(
    initialQuestion?.referenceSolution || getStandardTemplate(initialQuestion?.executionMode || 'FUNCTION', initialQuestion?.language || 'javascript')?.referenceSolution || ''
  );

  // Multi-language code caches
  const [langStarterCodes, setLangStarterCodes] = useState(() => {
    const map = {};
    if (initialQuestion?.starterCodes) {
      Object.assign(map, initialQuestion.starterCodes instanceof Map ? Object.fromEntries(initialQuestion.starterCodes) : initialQuestion.starterCodes);
    }
    if (initialQuestion?.starterCode && initialQuestion?.language) {
      map[initialQuestion.language.toLowerCase()] = initialQuestion.starterCode;
    }
    return map;
  });

  const [langRefSolutions, setLangRefSolutions] = useState(() => {
    const map = {};
    if (initialQuestion?.referenceSolutions) {
      Object.assign(map, initialQuestion.referenceSolutions instanceof Map ? Object.fromEntries(initialQuestion.referenceSolutions) : initialQuestion.referenceSolutions);
    }
    if (initialQuestion?.referenceSolution && initialQuestion?.language) {
      map[initialQuestion.language.toLowerCase()] = initialQuestion.referenceSolution;
    }
    return map;
  });

  // 6. UI Status States
  const [loading, setLoading] = useState(false);
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [saveStatus, setSaveStatus] = useState('Draft, not saved yet');
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [activeOutlineIndex, setActiveOutlineIndex] = useState(0);
  const [isScrolledPastHero, setIsScrolledPastHero] = useState(false);

  // Refs for 3D Interactive Tilt & Confetti
  const heroRef = useRef(null);
  const tiltRef = useRef(null);
  const publishBtnRef = useRef(null);
  const statementRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  // Scroll detection: fixed action bar appears when scrolled down past hero, disappears at hero section
  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setIsScrolledPastHero(rect.bottom < 70);
      } else {
        setIsScrolledPastHero(window.scrollY > 280);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Show Toast
  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2400);
  };

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDeleteQuestion = async () => {
    if (!initialQuestion?._id) return;
    setIsDeleting(true);
    try {
      await api.delete(`/questions/${initialQuestion._id}`);
      showToast('Question deleted successfully.');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 700);
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to delete question.';
      setError(msg);
      showToast(msg);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  // Sync initial question if editing
  useEffect(() => {
    if (initialQuestion) {
      const parsed = parseStatementAndFormats(
        initialQuestion.statement,
        initialQuestion.inputFormat,
        initialQuestion.outputFormat
      );
      setTitle(initialQuestion.title || '');
      setStatement(parsed.stmt);
      setInputFormat(parsed.inFmt);
      setOutputFormat(parsed.outFmt);
      setConstraints(initialQuestion.constraints || '');
      setExplanation(initialQuestion.explanation || '');
      setLanguage(initialQuestion.language || 'javascript');
      if (initialQuestion.executionMode) setExecutionMode(initialQuestion.executionMode);
      if (initialQuestion.dataStructure) setDataStructure(initialQuestion.dataStructure);
      if (initialQuestion.functionName) setFunctionName(initialQuestion.functionName);
      if (initialQuestion.returnType || initialQuestion.functionSignature?.returnType) {
        setReturnType(initialQuestion.returnType || initialQuestion.functionSignature?.returnType);
      }
      setDifficulty(initialQuestion.difficulty || 'Medium');
      if (Array.isArray(initialQuestion.tags)) setTopics(initialQuestion.tags);
      if (initialQuestion.starterCode) setStarterCode(initialQuestion.starterCode);
      if (initialQuestion.referenceSolution) setReferenceSolution(initialQuestion.referenceSolution);
      if (initialQuestion.examples && initialQuestion.examples.length > 0) {
        setExamples(initialQuestion.examples);
      }
    }
  }, [initialQuestion?._id]);

  // Check if code matches standard templates
  const isDefaultCode = (code) => {
    if (!code || !code.trim()) return true;
    const trimmed = code.trim();
    for (const m of Object.values(STANDARDIZED_TEMPLATES)) {
      for (const t of Object.values(m)) {
        if (t.starterCode?.trim() === trimmed || t.referenceSolution?.trim() === trimmed) {
          return true;
        }
      }
    }
    return false;
  };

  // Language Change Sync: Dynamically updates boilerplate to match selected language & mode
  const handleLanguageChange = (newLangId) => {
    const prevLang = (language || 'javascript').toLowerCase();
    const nextLang = (newLangId || 'javascript').toLowerCase();

    // Cache current edits for previous language & mode
    const prevKey = `${executionMode}_${prevLang}`;
    setLangStarterCodes((prev) => ({
      ...prev,
      [prevKey]: starterCode,
      [prevLang]: starterCode
    }));
    setLangRefSolutions((prev) => ({
      ...prev,
      [prevKey]: referenceSolution,
      [prevLang]: referenceSolution
    }));

    setLanguage(nextLang);

    // Retrieve cached code for target language & mode, or load matching standard template
    const nextKey = `${executionMode}_${dataStructure}_${nextLang}`;
    const tpl = getStandardTemplate(executionMode, nextLang, dataStructure);
    const existingStarter = langStarterCodes[nextKey] || langStarterCodes[`${executionMode}_${nextLang}`] || langStarterCodes[nextLang];
    const existingRef = langRefSolutions[nextKey] || langRefSolutions[`${executionMode}_${nextLang}`] || langRefSolutions[nextLang];

    setStarterCode(existingStarter !== undefined ? existingStarter : (tpl?.starterCode || ''));
    setReferenceSolution(existingRef !== undefined ? existingRef : (tpl?.referenceSolution || ''));
  };

  // Mode Change Sync: Dynamically updates boilerplate to match FUNCTION vs STDIN
  const handleModeChange = (newMode) => {
    const prevMode = executionMode;
    const nextMode = newMode;
    const currentLang = (language || 'javascript').toLowerCase();

    // Cache current edits for previous mode & language key
    const prevKey = `${prevMode}_${dataStructure}_${currentLang}`;
    setLangStarterCodes((prev) => ({
      ...prev,
      [prevKey]: starterCode
    }));
    setLangRefSolutions((prev) => ({
      ...prev,
      [prevKey]: referenceSolution
    }));

    setExecutionMode(nextMode);

    // Retrieve cached code for new mode or load matching standard template
    const nextKey = `${nextMode}_${dataStructure}_${currentLang}`;
    const tpl = getStandardTemplate(nextMode, currentLang, dataStructure);
    const existingStarter = langStarterCodes[nextKey] || langStarterCodes[`${nextMode}_${currentLang}`];
    const existingRef = langRefSolutions[nextKey] || langRefSolutions[`${nextMode}_${currentLang}`];

    setStarterCode(existingStarter !== undefined ? existingStarter : (tpl?.starterCode || ''));
    setReferenceSolution(existingRef !== undefined ? existingRef : (tpl?.referenceSolution || ''));
  };

  // Data Structure Change Sync: Updates boilerplate and function names for Lists, Trees, Strings, Arrays
  const handleDataStructureChange = (newDs) => {
    const prevDs = dataStructure;
    const currentLang = (language || 'javascript').toLowerCase();

    // Cache current edits
    const prevKey = `${executionMode}_${prevDs}_${currentLang}`;
    setLangStarterCodes((prev) => ({
      ...prev,
      [prevKey]: starterCode
    }));
    setLangRefSolutions((prev) => ({
      ...prev,
      [prevKey]: referenceSolution
    }));

    setDataStructure(newDs);

    // Auto-update function name if it matches default
    const currentOpt = DATA_STRUCTURE_OPTIONS.find((o) => o.id === prevDs);
    const nextOpt = DATA_STRUCTURE_OPTIONS.find((o) => o.id === newDs);
    if (nextOpt && (!functionName || functionName === 'solution' || (currentOpt && functionName === currentOpt.defaultFn))) {
      setFunctionName(nextOpt.defaultFn);
    }

    if (newDs === 'LINKED_LIST') {
      setReturnType('ListNode');
    } else if (newDs === 'BINARY_TREE') {
      setReturnType('TreeNode');
    } else {
      setReturnType('void');
    }

    // Retrieve cached code or standard template for this data structure
    const nextKey = `${executionMode}_${newDs}_${currentLang}`;
    const tpl = getStandardTemplate(executionMode, currentLang, newDs);
    const existingStarter = langStarterCodes[nextKey];
    const existingRef = langRefSolutions[nextKey];

    if (isDefaultCode(starterCode) || existingStarter !== undefined) {
      setStarterCode(existingStarter !== undefined ? existingStarter : (tpl?.starterCode || ''));
    }
    if (isDefaultCode(referenceSolution) || existingRef !== undefined) {
      setReferenceSolution(existingRef !== undefined ? existingRef : (tpl?.referenceSolution || ''));
    }
  };

  // 7 Checklist Items for Outline & Completeness
  const outlineItems = useMemo(() => {
    return [
      {
        id: 'f-title',
        name: 'Title',
        tab: 'details',
        isComplete: title.trim().length > 3
      },
      {
        id: 'f-stmt',
        name: 'Problem statement',
        tab: 'details',
        isComplete: statement.trim().length > 15
      },
      {
        id: 'f-io',
        name: 'Input and output',
        tab: 'details',
        isComplete: inputFormat.trim().length > 0 && outputFormat.trim().length > 0
      },
      {
        id: 'f-cons',
        name: 'Constraints',
        tab: 'details',
        isComplete: constraints.trim().length > 0
      },
      {
        id: 'f-ex',
        name: 'Examples',
        tab: 'details',
        isComplete: examples.some((ex) => ex.input.trim().length > 0 && ex.output.trim().length > 0)
      },
      {
        id: 'f-starter',
        name: 'Starter code',
        tab: 'starter',
        isComplete: starterCode.trim().length > 10
      },
      {
        id: 'f-ref',
        name: 'Reference solution',
        tab: 'reference',
        isComplete: referenceSolution.trim().length > 10
      }
    ];
  }, [title, statement, inputFormat, outputFormat, constraints, examples, starterCode, referenceSolution]);

  // Derived Completeness: Question CANNOT be published until 100% completeness
  const completedCount = useMemo(() => outlineItems.filter((i) => i.isComplete).length, [outlineItems]);
  const completenessPercent = Math.round((completedCount / outlineItems.length) * 100);
  const isReadyToPublish = completenessPercent === 100;

  // Auto-Save to LocalStorage
  const triggerAutoSave = () => {
    setIsSavingLocal(true);
    setSaveStatus('Saving…');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          'tf-cq2-draft',
          JSON.stringify({
            title,
            statement,
            inputFormat,
            outputFormat,
            constraints,
            examples,
            language,
            difficulty,
            topics,
            starterCode,
            referenceSolution
          })
        );
      } catch {}
      setIsSavingLocal(false);
      setSaveStatus('Saved just now');
    }, 700);
  };

  // Particle Burst Confetti on 100% or Publish
  const triggerConfettiBurst = () => {
    const btn = publishBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const colors = ['#EDFF72', '#1f9d5a', '#191A1D', '#fff'];

    for (let i = 0; i < 26; i++) {
      const dot = document.createElement('i');
      dot.className = 'tf-burst';
      dot.style.position = 'fixed';
      dot.style.left = `${rect.left + rect.width / 2}px`;
      dot.style.top = `${rect.top + rect.height / 2}px`;
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.borderRadius = '2px';
      dot.style.zIndex = '9999';
      dot.style.pointerEvents = 'none';
      dot.style.background = colors[i % colors.length];
      document.body.appendChild(dot);

      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      dot.animate(
        [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * speed}px, ${Math.sin(angle) * speed + 60}px) rotate(${Math.random() * 540}deg)`,
            opacity: 0
          }
        ],
        { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' }
      ).onfinish = () => dot.remove();
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        triggerAutoSave();
        showToast('Draft saved to local workspace');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, statement, inputFormat, outputFormat, constraints, examples, language, difficulty, topics, starterCode, referenceSolution]);

  // 3D Dice Gyro Tilt Handlers
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    tiltRef.current.style.transform = `rotateY(${x * 35}deg) rotateX(${-y * 30}deg)`;
    heroRef.current.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    heroRef.current.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  const handleHeroMouseLeave = () => {
    if (tiltRef.current) {
      tiltRef.current.style.transform = 'rotateY(0deg) rotateX(0deg)';
    }
  };

  // Outline Item Click -> Navigate & Focus
  const handleOutlineClick = (item, index) => {
    setActiveOutlineIndex(index);
    if (item.tab !== activeTab) {
      setActiveTab(item.tab);
    }
    setTimeout(() => {
      const el = document.getElementById(item.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const focusable = el.querySelector('input, textarea');
        if (focusable) focusable.focus({ preventScroll: true });
      }
    }, 150);
  };

  // Add / Remove Topic Tags
  const handleAddTopic = () => {
    const trimmed = newTopicInput.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics([...topics, trimmed]);
      triggerAutoSave();
    }
    setNewTopicInput('');
  };

  const handleRemoveTopic = (indexToRemove) => {
    setTopics(topics.filter((_, idx) => idx !== indexToRemove));
    triggerAutoSave();
  };

  // Examples Management
  const handleAddExample = () => {
    setExamples([...examples, { input: '', output: '', explanation: '' }]);
    triggerAutoSave();
  };

  const handleUpdateExample = (idx, field, val) => {
    const updated = [...examples];
    updated[idx][field] = val;
    setExamples(updated);
    triggerAutoSave();
  };

  const handleRemoveExample = (idx) => {
    if (examples.length <= 1) return;
    setExamples(examples.filter((_, i) => i !== idx));
    triggerAutoSave();
  };

  // Markdown Toolbar helper
  const handleApplyMarkdown = (wrapper, isSurround = false) => {
    const ta = statementRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;

    let nextVal = '';
    if (isSurround) {
      nextVal = val.slice(0, start) + wrapper + val.slice(start, end) + wrapper + val.slice(end);
    } else {
      nextVal = val.slice(0, start) + wrapper + val.slice(start);
    }

    setStatement(nextVal);
    triggerAutoSave();
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + wrapper.length, start + wrapper.length);
    }, 10);
  };

  // Save to Backend (Published or Draft)
  const handleSaveQuestion = async (targetStatus = 'published') => {
    if (!title.trim()) {
      showToast('Add title before saving');
      setActiveTab('details');
      document.getElementById('f-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!statement.trim()) {
      showToast('Add problem statement before saving');
      setActiveTab('details');
      document.getElementById('f-stmt')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Only block if creating a NEW question with publish status and completeness is less than 100%
    if (!isEditing && targetStatus === 'published' && completenessPercent < 100) {
      const incomplete = outlineItems.filter((i) => !i.isComplete).map((i) => i.name).join(', ');
      const msg = `Question cannot be published until 100% completeness (${completenessPercent}% complete). Missing: ${incomplete}. Please complete all fields.`;
      setError(msg);
      showToast(msg);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const effectiveLang = (language || 'javascript').toLowerCase();
      const currentStarter = starterCode || getStandardTemplate(executionMode, language)?.starterCode || '';
      const currentRef = referenceSolution || getStandardTemplate(executionMode, language)?.referenceSolution || '';

      const updatedStarterCodes = {
        ...langStarterCodes,
        [`${executionMode}_${effectiveLang}`]: currentStarter,
        [effectiveLang]: currentStarter
      };

      const updatedRefSolutions = {
        ...langRefSolutions,
        [`${executionMode}_${effectiveLang}`]: currentRef,
        [effectiveLang]: currentRef
      };

      // Ensure all 4 supported languages have fallback templates seeded
      for (const l of ['javascript', 'python', 'java', 'cpp']) {
        if (!updatedStarterCodes[l]) {
          updatedStarterCodes[l] = getStandardTemplate(executionMode, l)?.starterCode || '';
        }
        if (!updatedRefSolutions[l]) {
          updatedRefSolutions[l] = getStandardTemplate(executionMode, l)?.referenceSolution || '';
        }
      }

      const payload = {
        title: title.trim(),
        statement: statement.trim(),
        inputFormat: inputFormat.trim(),
        outputFormat: outputFormat.trim(),
        constraints: constraints.trim(),
        language: effectiveLang,
        executionMode,
        ...(executionMode === 'FUNCTION' && {
          functionName: (functionName || 'solution').trim(),
          dataStructure: dataStructure || 'ARRAY',
          returnType: returnType || 'void'
        }),
        difficulty,
        tags: topics,
        examples: examples.map((ex) => ({
          input: ex.input || 'Sample Input',
          output: ex.output || 'Sample Output',
          explanation: ex.explanation || ''
        })),
        starterCode: currentStarter,
        referenceSolution: currentRef,
        starterCodes: updatedStarterCodes,
        referenceSolutions: updatedRefSolutions,
        status: targetStatus,
        ...(currentUser && { ownerId: currentUser.id || currentUser._id })
      };

      let res;
      if (isEditing) {
        res = await api.patch(`/questions/${initialQuestion._id}`, payload);
      } else {
        res = await api.post('/questions', payload);
      }

      const returnedQ = res?.data?.data || res?.data;
      const isActuallyPublished = returnedQ?.status === 'published';

      triggerConfettiBurst();
      showToast(isEditing ? 'Question changes saved successfully!' : 'Question saved and published to Question Bank!');

      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 850);
    } catch (err) {
      const serverMsg =
        err.response?.data?.error?.message ||
        err?.customMessage ||
        'Failed to save question. Please verify fields.';
      setError(serverMsg);
      showToast(serverMsg);
    } finally {
      setLoading(false);
      setSaveDraftLoading(false);
    }
  };

  // Staggered characters for Title Animation like Question Bank
  const titleText = isEditing ? 'Edit Question' : 'Create Question';
  const titleCharacters = titleText.split('');

  return (
    <div className="tf-cq-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D ISOMETRIC DICE, QUESTION BANK TEXT & NUMBER ANIMATION
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-cq-root {
          --out: #a9b0a4;
          --bg: #F2F3F0;
          --card: #ffffff;
          --surf: #E9ECE7;
          --ink: #171819;
          --mute: #777D78;
          --line: #DDE1DA;
          --acc: #EDFF72;
          --side: #191A1D;
          --ok: #1f9d5a;
          --hard: #e5484d;
          --in: #f4f5f2;
          --mono: "JetBrains Mono", monospace;
          color: var(--ink);
        }
        .tf-cq-root * {
          box-sizing: border-box;
        }

        /* Staggered Rise Entrance Animation */
        .tf-cq-root .rise {
          opacity: 0;
          transform: translateY(18px);
          filter: blur(4px);
          animation: tfRise .7s cubic-bezier(.2,.8,.2,1) forwards;
          animation-delay: calc(var(--k, 0) * 80ms + .1s);
        }
        @keyframes tfRise {
          to {
            opacity: 1;
            transform: none;
            filter: none;
          }
        }

        /* Top Grid */
        .tf-cq-root .tf-top {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
          gap: 14px;
          margin-bottom: 14px;
        }
        .tf-cq-root .tf-hero {
          position: relative;
          background: #101112;
          color: #fff;
          border-radius: 28px;
          padding: 30px 34px;
          overflow: hidden;
          min-height: 270px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 20px 40px -20px rgba(0,0,0,0.5);
          isolation: isolate;
        }
        .tf-cq-root .tf-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(460px circle at var(--mx, 80%) var(--my, 50%), rgba(237,255,114,.18), transparent 70%);
          transition: background .15s ease-out;
        }
        .tf-cq-root .tf-eyebrow {
          font: 600 11px/1 var(--mono);
          letter-spacing: .14em;
          text-transform: uppercase;
          display: flex;
          gap: 8px;
          align-items: center;
          color: #e3e8e2;
        }
        .tf-cq-root .tf-eyebrow i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--acc);
          box-shadow: 0 0 0 3px rgba(237,255,114,.25);
        }

        /* Hero Title Staggered Letter Animation like Question Bank */
        .tf-cq-root h1.hero-title {
          font-size: clamp(32px, 4.5vw, 48px);
          margin: 14px 0 8px;
          letter-spacing: -.035em;
          line-height: 1.05;
          font-weight: 700;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-cq-root h1.hero-title span {
          display: inline-block;
          transform: translateY(110%) rotate(6deg);
          opacity: 0;
          animation: tfTitleChar .7s cubic-bezier(.2,.9,.2,1) forwards;
          animation-delay: calc(var(--c) * 35ms + .15s);
        }
        @keyframes tfTitleChar {
          to {
            transform: none;
            opacity: 1;
          }
        }
        .tf-cq-root h1.hero-title .sp2 {
          width: .28em;
        }

        .tf-cq-root .tf-hero p {
          margin: 0 0 20px;
          color: #b7bdb6;
          max-width: 42ch;
          font-size: 14.5px;
          line-height: 1.5;
        }
        .tf-cq-root .tf-btns {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .tf-cq-root .tf-btn {
          border: 0;
          cursor: pointer;
          border-radius: 99px;
          padding: 11px 22px;
          font-weight: 600;
          font-size: 13.5px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          transition: transform .2s, box-shadow .25s;
        }
        .tf-cq-root .tf-btn:hover {
          transform: translateY(-2px);
        }
        .tf-cq-root .tf-btn:active {
          transform: scale(.97);
        }
        .tf-cq-root .tf-btn.pri {
          background: var(--acc);
          color: #111;
          font-weight: 700;
        }
        .tf-cq-root .tf-btn.pri.ready {
          animation: tfPulse 2s infinite;
        }
        @keyframes tfPulse {
          50% { box-shadow: 0 0 0 9px rgba(237,255,114,.35); }
        }
        .tf-cq-root .tf-btn.gh {
          background: #26282b;
          color: #fff;
          border: 1px solid #3a3d41;
        }
        .tf-cq-root .tf-btn.lt {
          background: var(--card);
          border: 1px solid var(--line);
          color: var(--ink);
        }
        .tf-cq-root .tf-facts {
          display: flex;
          gap: 22px;
          border-top: 1px solid #2b2d30;
          padding-top: 14px;
          margin-top: 20px;
          font-size: 13px;
          color: #c8cdc7;
        }
        .tf-cq-root .tf-facts b {
          color: #fff;
          font-size: 15px;
          margin-right: 4px;
        }

        /* 3D Dice (Cube) Stage - Sized & Aligned like the 3D Ball */
        .tf-cq-root .stage {
          position: absolute;
          right: 12px;
          top: 0;
          bottom: 0;
          width: 46%;
          perspective: 850px;
          display: grid;
          place-items: center;
          pointer-events: none;
          z-index: 1;
        }
        .tf-cq-root .tilt {
          transform-style: preserve-3d;
          transition: transform .12s ease-out;
          display: grid;
          place-items: center;
        }
        .tf-cq-root .orbit-ring {
          position: absolute;
          width: 260px;
          height: 100px;
          border-radius: 50%;
          border: 1.5px solid rgba(237, 255, 114, 0.35);
          transform: rotateX(72deg) rotateY(-18deg);
          pointer-events: none;
          transform-style: preserve-3d;
        }
        .tf-cq-root .orbit-node {
          position: absolute;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 0 14px 4px rgba(237, 255, 114, 0.95);
          top: -4px;
          left: 50%;
          transform: translateX(-50%);
        }
        .tf-cq-root .cube {
          width: 156px;
          height: 156px;
          transform-style: preserve-3d;
          animation: tfSpin 14s linear infinite;
          transform: rotateX(-18deg) rotateY(0);
        }
        .tf-cq-root .cube i {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font: 800 48px var(--mono);
          font-style: normal;
          border-radius: 26px;
          border: 2.8px solid #191A1D;
          backface-visibility: visible;
          user-select: none;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.14);
        }
        .tf-cq-root .f1 {
          background: var(--acc);
          color: #191A1D;
          transform: translateZ(78px);
        }
        .tf-cq-root .f2 {
          background: #2c2f34;
          color: var(--acc);
          transform: rotateY(180deg) translateZ(78px);
        }
        .tf-cq-root .f3 {
          background: #e3f55f;
          color: #191A1D;
          transform: rotateY(90deg) translateZ(78px);
        }
        .tf-cq-root .f4 {
          background: #33363b;
          color: var(--acc);
          transform: rotateY(-90deg) translateZ(78px);
        }
        .tf-cq-root .f5 {
          background: #f7ffa8;
          color: #191A1D;
          transform: rotateX(90deg) translateZ(78px);
        }
        .tf-cq-root .f6 {
          background: #23252a;
          color: var(--acc);
          transform: rotateX(-90deg) translateZ(78px);
        }
        @keyframes tfSpin {
          0% { transform: rotateX(-18deg) rotateY(0deg); }
          100% { transform: rotateX(-18deg) rotateY(360deg); }
        }
        .tf-cq-root .stage .float {
          animation: tfFloat 3.2s ease-in-out infinite;
          transform-style: preserve-3d;
          display: grid;
          place-items: center;
        }
        @keyframes tfFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-16px); }
        }
        .tf-cq-root .stage .shadow {
          position: absolute;
          bottom: 22px;
          width: 160px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(12px);
          animation: tfShadow 3.2s ease-in-out infinite;
        }
        @keyframes tfShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }

        /* Fixed Sticky Action Bar - slides in when scrolled down, disappears at hero */
        .tf-cq-root .tf-fixed-bar {
          position: fixed;
          top: 14px;
          left: 92px;
          right: 20px;
          z-index: 60;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--line);
          border-radius: 20px;
          box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0,0,0,0.04);
          padding: 8px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          transform: translateY(-140%);
          opacity: 0;
          pointer-events: none;
          transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
        }
        .tf-cq-root .tf-fixed-bar.visible {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        .tf-cq-root .tf-fixed-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .tf-cq-root .tf-fixed-icon {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: var(--surf);
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--ink);
          transition: 0.2s;
          flex-shrink: 0;
        }
        .tf-cq-root .tf-fixed-icon:hover {
          background: var(--card);
          border-color: #171819;
        }
        .tf-cq-root .tf-fixed-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .tf-cq-root .tf-fixed-title {
          font-weight: 700;
          font-size: 14px;
          color: #171819;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 440px;
        }
        .tf-cq-root .tf-fixed-sub {
          font-size: 11.5px;
          color: var(--mute);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tf-cq-root .tf-fixed-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .tf-cq-root .tf-btn-sm {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 12px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid var(--line);
          background: var(--card);
          color: var(--ink);
          transition: transform 0.15s, background 0.15s, box-shadow 0.15s;
        }
        .tf-cq-root .tf-btn-sm:hover {
          transform: translateY(-1px);
        }
        .tf-cq-root .tf-btn-sm.pri {
          background: var(--acc);
          border-color: #d8ea4f;
          color: #171819;
        }
        .tf-cq-root .tf-btn-sm.pri.ready {
          box-shadow: 0 0 0 3px rgba(237, 255, 114, 0.45);
        }
        .tf-cq-root .tf-btn-sm.gh {
          background: var(--surf);
          border-color: var(--line);
        }
        .tf-cq-root .tf-btn-sm.gh:hover {
          background: #dde1da;
        }

        /* 4 Quick Stats Cards */
        .tf-cq-root .tf-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-cq-root .tf-card {
          background: var(--card);
          border-radius: 28px;
          padding: 18px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
          border: 1px solid var(--line);
        }
        .tf-cq-root .tf-mini {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 128px;
          position: relative;
          transition: transform .25s ease;
        }
        .tf-cq-root .tf-mini:hover {
          transform: translateY(-2.5px);
        }
        .tf-cq-root .tf-tile {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--surf);
          display: grid;
          place-items: center;
          font: 600 13px var(--mono);
          color: #171819;
        }
        .tf-cq-root .tf-tile.a {
          background: var(--acc);
          color: #111;
        }
        .tf-cq-root .tf-cap {
          font: 600 11px/1 var(--mono);
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--mute);
          margin-top: auto;
        }
        .tf-cq-root .tf-big {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -.03em;
          line-height: 1;
        }
        .tf-cq-root .tf-sub {
          font-size: 12px;
          color: var(--mute);
        }
        .tf-cq-root .tf-sub.g {
          color: var(--ok);
          font-weight: 600;
        }
        .tf-cq-root .tf-ringm {
          position: absolute;
          right: 16px;
          top: 14px;
          width: 42px;
          height: 42px;
        }
        .tf-cq-root .tf-ringm circle {
          fill: none;
          stroke-width: 6;
          stroke-linecap: round;
        }
        .tf-cq-root .tf-ringm .b {
          stroke: var(--surf);
        }
        .tf-cq-root .tf-ringm .f {
          stroke: #a9c400;
          transition: stroke-dashoffset .8s cubic-bezier(.3,1.3,.5,1);
        }
        .tf-cq-root .tf-ringm svg {
          transform: rotate(-90deg);
        }

        /* Language chips */
        .tf-cq-root .tf-chips {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .tf-cq-root .tf-chp {
          border: 0;
          background: var(--surf);
          border-radius: 8px;
          padding: 5px 10px;
          font: 600 11px var(--mono);
          cursor: pointer;
          transition: .2s;
          color: #171819;
        }
        .tf-cq-root .tf-chp[aria-pressed=true] {
          background: #111;
          color: var(--acc);
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }

        /* Difficulty Selector */
        .tf-cq-root .tf-dbar {
          display: flex;
          gap: 3px;
          height: 8px;
          margin: 6px 0;
        }
        .tf-cq-root .tf-dbar i {
          flex: 1;
          border-radius: 9px;
          background: var(--surf);
          transition: .3s;
        }
        .tf-cq-root .tf-dbar i.on.e { background: #26b870; }
        .tf-cq-root .tf-dbar i.on.m { background: #d8ee3b; }
        .tf-cq-root .tf-dbar i.on.h { background: var(--hard); }
        .tf-cq-root .tf-leg {
          display: flex;
          gap: 6px;
          font-size: 12px;
        }
        .tf-cq-root .tf-leg button {
          border: 0;
          background: none;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 99px;
          display: flex;
          gap: 5px;
          align-items: center;
          color: var(--mute);
          font-weight: 500;
          transition: .2s;
        }
        .tf-cq-root .tf-leg button i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .tf-cq-root .tf-leg button[aria-pressed=true] {
          background: var(--surf);
          color: var(--ink);
          font-weight: 700;
        }

        /* 3-Column Main Body Grid */
        .tf-cq-root .tf-body {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr) 350px;
          gap: 14px;
          align-items: start;
        }
        .tf-cq-root .tf-col {
          position: sticky;
          top: 76px;
          transition: top 0.25s ease;
        }
        .tf-cq-root h3 {
          font-size: 15px;
          margin: 2px 0 12px;
          font-weight: 700;
          color: #171819;
        }

        /* Outline Checklist */
        .tf-cq-root .tf-secs {
          display: grid;
          gap: 4px;
        }
        .tf-cq-root .tf-sec {
          display: flex;
          align-items: center;
          gap: 9px;
          border: 0;
          background: none;
          text-align: left;
          padding: 9px 12px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 500;
          font-size: 13.5px;
          transition: .2s;
          color: #171819;
        }
        .tf-cq-root .tf-sec:hover {
          background: var(--surf);
        }
        .tf-cq-root .tf-sec.on {
          background: var(--acc);
          color: #111;
          font-weight: 700;
        }
        .tf-cq-root .tf-sec i {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1.5px solid var(--line);
          display: grid;
          place-items: center;
          font-style: normal;
          font-size: 9px;
          color: transparent;
          flex: none;
          transition: .3s;
        }
        .tf-cq-root .tf-sec.done i {
          background: var(--ok);
          border-color: var(--ok);
          color: #fff;
        }
        .tf-cq-root .tf-sec.on.done i {
          border-color: #111;
        }

        /* Topic Tags */
        .tf-cq-root .tf-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .tf-cq-root .tf-tag {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          background: var(--surf);
          border-radius: 8px;
          padding: 4px 6px 4px 10px;
          font: 600 12px var(--mono);
          color: #171819;
        }
        .tf-cq-root .tf-tag button {
          border: 0;
          background: var(--card);
          border-radius: 50%;
          width: 16px;
          height: 16px;
          cursor: pointer;
          line-height: 1;
          color: var(--mute);
          display: grid;
          place-items: center;
          padding: 0;
          font-size: 11px;
        }
        .tf-cq-root .tf-tag button:hover {
          color: #111;
          background: #e1e4de;
        }
        .tf-cq-root .tf-tin {
          display: flex;
          gap: 6px;
          margin-top: 10px;
        }

        /* Sliding Pill Tabs */
        .tf-cq-root .tf-ptabs {
          display: inline-flex;
          background: var(--surf);
          border-radius: 99px;
          padding: 4px;
          gap: 2px;
          margin-bottom: 16px;
          position: relative;
        }
        .tf-cq-root .tf-ptabs button {
          position: relative;
          z-index: 1;
          border: 0;
          background: none;
          padding: 8px 16px;
          border-radius: 99px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          color: var(--mute);
          transition: color .2s;
        }
        .tf-cq-root .tf-ptabs button.active {
          color: #fff;
          background: #111;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }

        /* Form Inputs & Code Blocks */
        .tf-cq-root input[type=text],
        .tf-cq-root textarea,
        .tf-cq-root select {
          width: 100%;
          border: 1px solid var(--line);
          background: var(--in);
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 14px;
          transition: .2s;
          color: var(--ink);
          font-family: inherit;
        }
        .tf-cq-root input:focus,
        .tf-cq-root textarea:focus,
        .tf-cq-root select:focus {
          outline: 0;
          border-color: #c3d63a;
          background: var(--card);
          box-shadow: 0 0 0 4px rgba(237,255,114,.55);
        }
        .tf-cq-root textarea {
          resize: vertical;
          min-height: 120px;
          line-height: 1.55;
        }
        .tf-cq-root .mono {
          font-family: var(--mono);
          font-size: 13px;
        }
        .tf-cq-root .code {
          background: #15161a !important;
          color: #d6ef6b !important;
          border-color: #2b2e35 !important;
        }
        .tf-cq-root label,
        .tf-cq-root .lab {
          display: block;
          font-size: 13px;
          font-weight: 700;
          margin: 0 0 6px;
          color: #171819;
        }
        .tf-cq-root .req {
          color: var(--hard);
        }
        .tf-cq-root .fld {
          margin-bottom: 18px;
          scroll-margin-top: 16px;
        }
        .tf-cq-root .two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-cq-root .tb {
          display: flex;
          gap: 2px;
          flex-wrap: wrap;
          padding: 5px;
          background: var(--surf);
          border-radius: 14px 14px 0 0;
          border: 1px solid var(--line);
          border-bottom: 0;
        }
        .tf-cq-root .tb button {
          border: 0;
          background: none;
          border-radius: 8px;
          padding: 5px 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 12.5px;
          color: var(--mute);
          transition: .15s;
        }
        .tf-cq-root .tb button:hover {
          background: var(--card);
          color: var(--ink);
        }
        .tf-cq-root .tb + textarea {
          border-radius: 0 0 14px 14px;
          min-height: 160px;
        }
        .tf-cq-root .empty-tip {
          text-align: center;
          color: var(--mute);
          padding: 20px;
          border: 1.5px dashed var(--line);
          border-radius: 18px;
          margin-top: 10px;
          background: #fafbfa;
        }
        .tf-cq-root .empty-tip b {
          display: block;
          width: 34px;
          height: 34px;
          margin: 0 auto 8px;
          border-radius: 10px;
          background: var(--acc);
          color: #111;
          line-height: 34px;
          font-weight: 800;
          box-shadow: 0 6px 0 -1px #c8dc43;
        }
        .tf-cq-root .ex {
          background: var(--in);
          border-radius: 18px;
          padding: 14px;
          margin-bottom: 10px;
          border: 1px solid var(--line);
          transition: transform .25s ease;
        }
        .tf-cq-root .ex:hover {
          transform: translateY(-2px);
        }
        .tf-cq-root .ex input {
          background: var(--card);
        }
        .tf-cq-root .hd {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .tf-cq-root .link {
          background: none;
          border: 0;
          cursor: pointer;
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 3px;
          color: #171819;
          font-size: 13px;
        }
        .tf-cq-root .note {
          background: var(--acc);
          color: #111;
          border-radius: 12px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 14px;
          border: 1px solid #d8ec48;
        }

        /* Live Student Preview */
        .tf-cq-root .pill {
          display: inline-block;
          border-radius: 99px;
          padding: 3px 10px;
          font-size: 12px;
          font-weight: 700;
        }
        .tf-cq-root .pill.Easy { background: #c8f0d8; color: #15663c; }
        .tf-cq-root .pill.Medium { background: #f1fbb0; color: #5b6a00; }
        .tf-cq-root .pill.Hard { background: #ffd2d3; color: #99262b; }
        .tf-cq-root .pill.v { background: var(--surf); color: #171819; }
        .tf-cq-root .pill.ok { background: #d7f3e3; color: #15663c; }
        .tf-cq-root .pv h2 {
          font-size: 19px;
          letter-spacing: -.02em;
          margin: 10px 0 8px;
          line-height: 1.25;
          font-weight: 700;
        }
        .tf-cq-root .pv pre {
          margin: 0 0 12px;
          background: var(--in);
          padding: 12px;
          border-radius: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          font: inherit;
          border: 1px solid var(--line);
          font-size: 13px;
        }
        .tf-cq-root .pv pre.mono {
          font-family: var(--mono);
          font-size: 12px;
        }
        .tf-cq-root .pv .cap {
          margin: 12px 0 5px;
          display: block;
          font: 600 11px/1 var(--mono);
          text-transform: uppercase;
          letter-spacing: .08em;
          color: var(--mute);
        }

        /* Toast */
        .tf-cq-root .tf-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translate(-50%, 120px);
          background: #111;
          color: #fff;
          padding: 12px 22px;
          border-radius: 99px;
          z-index: 999;
          font-size: 13.5px;
          font-weight: 600;
          box-shadow: 0 12px 32px rgba(0,0,0,0.3);
          transition: transform .4s cubic-bezier(.3,1.4,.5,1);
          pointer-events: none;
        }
        .tf-cq-root .tf-toast.on {
          transform: translate(-50%, 0);
        }

        /* Responsive Breakpoints */
        @media (max-width: 1180px) {
          .tf-cq-root .tf-body {
            grid-template-columns: 220px minmax(0, 1fr);
          }
          .tf-cq-root .tf-body .right-col {
            grid-column: 1 / -1;
            position: static;
          }
        }
        @media (max-width: 900px) {
          .tf-cq-root .tf-top {
            grid-template-columns: 1fr;
          }
          .tf-cq-root .tf-hero {
            flex-direction: column;
            gap: 20px;
          }
        }
        @media (max-width: 720px) {
          .tf-cq-root .tf-body {
            grid-template-columns: 1fr;
          }
          .tf-cq-root .two {
            grid-template-columns: 1fr;
          }
          .tf-cq-root .tf-cards {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          FIXED STICKY ACTION BAR
          Stays fixed when scrolled down past hero; disappears at hero section
          ──────────────────────────────────────────────────────────────────────────── */}
      <div
        className={`tf-fixed-bar ${isScrolledPastHero ? 'visible' : ''}`}
        aria-hidden={!isScrolledPastHero}
      >
        <div className="tf-fixed-left">
          <button
            type="button"
            onClick={() => (onCancel ? onCancel() : window.history.back())}
            className="tf-fixed-icon"
            title="Back to Question Bank"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="tf-fixed-meta">
            <span className="tf-fixed-title">{title.trim() || 'Create Question'}</span>
            <span className="tf-fixed-sub">
              <span className="dot ok" /> {completedCount} of {outlineItems.length} checks • {completenessPercent}% complete • {language}
            </span>
          </div>
        </div>

        <div className="tf-fixed-actions">
          {isEditing && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="tf-btn-sm gh"
              style={{ color: '#e5484d', borderColor: '#fca5a5' }}
              title="Delete Question"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => document.getElementById('pv-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="tf-btn-sm gh"
            title="Jump to Student Preview"
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>
          {isEditing ? (
            <button
              type="button"
              onClick={() => handleSaveQuestion(initialQuestion?.status || 'published')}
              disabled={loading || !title.trim() || !statement.trim()}
              title="Save changes to this question"
              className="tf-btn-sm pri ready cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> {loading ? 'Saving…' : 'Save Changes'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSaveQuestion('published')}
              disabled={!isReadyToPublish || loading}
              title={isReadyToPublish ? '100% complete! Ready to publish' : `Requires 100% completeness to publish (${completenessPercent}% complete). Complete all checklist items.`}
              className={`tf-btn-sm pri ${isReadyToPublish ? 'ready cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
            >
              <Send className="w-3.5 h-3.5" /> {loading ? 'Publishing…' : isReadyToPublish ? 'Publish question' : `Publish (${completenessPercent}%)`}
            </button>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP BANNER GRID: HERO CARD (3D ISOMETRIC DICE) + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Dice and Staggered Character Title */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div style={{ position: 'relative', zIndex: 2, maxWidth: '58%' }}>
            <div className="tf-eyebrow">
              <i />
              Question authoring workspace
            </div>

            {/* Staggered Animated Title like Question Bank */}
            <h1 className="hero-title">
              {titleCharacters.map((ch, idx) => (
                <span
                  key={idx}
                  style={{ '--c': idx }}
                  className={ch === ' ' ? 'sp2' : ''}
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p>Write the problem, set the rules, and check what students will see before you publish.</p>

            <div className="tf-btns">
              {isEditing ? (
                <button
                  ref={publishBtnRef}
                  type="button"
                  onClick={() => handleSaveQuestion(initialQuestion?.status || 'published')}
                  disabled={loading || !title.trim() || !statement.trim()}
                  title="Save changes to this question"
                  className="tf-btn pri ready cursor-pointer flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> {loading ? 'Saving…' : 'Save Changes'}
                </button>
              ) : (
                <button
                  ref={publishBtnRef}
                  type="button"
                  onClick={() => handleSaveQuestion('published')}
                  disabled={!isReadyToPublish || loading}
                  title={isReadyToPublish ? '100% complete! Ready to publish' : `Requires 100% completeness to publish (${completenessPercent}% complete). Complete all checklist items.`}
                  className={`tf-btn pri ${isReadyToPublish ? 'ready cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                >
                  {loading ? 'Publishing…' : isReadyToPublish ? '+ Publish question' : `+ Publish (${completenessPercent}%)`}
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="tf-btn gh"
                  style={{ color: '#e5484d', borderColor: '#fca5a5' }}
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
            </div>

            {/* Live Count Up Facts Bar */}
            <div className="tf-facts">
              <span>
                <b><AnimatedCount value={completedCount} /></b>checks passed
              </span>
              <span>
                <b><AnimatedCount value={1} /></b>language
              </span>
              <span>
                <b><AnimatedCount value={topics.length} /></b>topics
              </span>
            </div>
          </div>

          {/* 3D Dice Stage with Interactive Cursor Gyro Tilt */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="orbit-ring">
                  <div className="orbit-node" />
                </div>
                <div className="cube">
                  <i className="f1">0(n)</i>
                  <i className="f2">&#123;&#125;</i>
                  <i className="f3">?</i>
                  <i className="f4">&lt;/&gt;</i>
                  <i className="f5">"</i>
                  <i className="f6">[ ]</i>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Quick Stats Cards with Smooth Animated Numbers */}
        <div className="tf-cards">
          {/* Card 1: Completeness with Animated Counting Percentage */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile a">%</div>
            <div className="tf-ringm">
              <svg viewBox="0 0 42 42" width="42" height="42">
                <circle className="b" cx="21" cy="21" r="17" />
                <circle
                  className="f"
                  cx="21"
                  cy="21"
                  r="17"
                  strokeDasharray="107"
                  strokeDashoffset={107 * (1 - completenessPercent / 100)}
                />
              </svg>
            </div>
            <div className="tf-cap">Completeness</div>
            <div className="tf-big">
              <AnimatedCount value={completenessPercent} />%
            </div>
            <div className="tf-sub">
              {completenessPercent === 100
                ? 'Everything is filled in'
                : `${outlineItems.length - completedCount} left to add`}
            </div>
          </div>

          {/* Card 2: Status */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">✓</div>
            <div className="tf-cap">Status</div>
            <div className="tf-big" style={{ fontSize: '28px' }}>
              {isReadyToPublish ? 'Ready' : 'In Progress'}
            </div>
            <div className={`tf-sub ${isReadyToPublish ? 'g' : ''}`}>
              {isReadyToPublish ? 'Ready to publish' : 'Complete required fields'}
            </div>
          </div>

          {/* Card 3: Language Selector Chips */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="tf-tile">&lt;/&gt;</div>
            <div className="tf-cap">Language</div>
            <div className="tf-chips">
              {SUPPORTED_LANGS.map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  aria-pressed={language === lang.id}
                  onClick={() => handleLanguageChange(lang.id)}
                  className="tf-chp"
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* Card 3.5: Execution Mode Toggle */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4.5 }}>
            <div className="tf-tile">⚙</div>
            <div className="tf-cap">Execution Mode</div>
            <div className="tf-chips">
              <button
                type="button"
                aria-pressed={executionMode === 'FUNCTION'}
                onClick={() => handleModeChange('FUNCTION')}
                className="tf-chp"
                title="Function mode: Student implements a named function"
              >
                Function
              </button>
              <button
                type="button"
                aria-pressed={executionMode === 'STDIN'}
                onClick={() => handleModeChange('STDIN')}
                className="tf-chp"
                title="STDIN mode: Student writes a program reading stdin"
              >
                STDIN
              </button>
            </div>
            {executionMode === 'FUNCTION' && (
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="tf-cap" style={{ marginBottom: '6px', fontSize: '10px' }}>Data Structure</div>
                <div className="tf-chips" style={{ flexWrap: 'wrap', gap: '4px' }}>
                  {DATA_STRUCTURE_OPTIONS.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      aria-pressed={dataStructure === ds.id}
                      onClick={() => handleDataStructureChange(ds.id)}
                      className="tf-chp"
                      style={{ fontSize: '10px', padding: '3px 8px' }}
                    >
                      {ds.label}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '8px' }}>
                  <input
                    type="text"
                    value={functionName}
                    onChange={(e) => {
                      setFunctionName(e.target.value);
                      triggerAutoSave();
                    }}
                    placeholder="Function name (e.g. solution, reverseList, invertTree)"
                    className="tf-chp"
                    style={{ width: '100%', textAlign: 'left', padding: '4px 8px', fontSize: '11px' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 4: Difficulty Selector */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="tf-tile">≡</div>
            <div className="tf-cap">Difficulty</div>
            <div className="tf-dbar">
              <i className={`e ${['Easy', 'Medium', 'Hard'].includes(difficulty) ? 'on' : ''}`} />
              <i className={`m ${['Medium', 'Hard'].includes(difficulty) ? 'on' : ''}`} />
              <i className={`h ${difficulty === 'Hard' ? 'on' : ''}`} />
            </div>
            <div className="tf-leg">
              <button
                type="button"
                data-d="Easy"
                aria-pressed={difficulty === 'Easy'}
                onClick={() => setDifficulty('Easy')}
              >
                <i style={{ background: '#26b870' }} />
                Easy
              </button>
              <button
                type="button"
                data-d="Medium"
                aria-pressed={difficulty === 'Medium'}
                onClick={() => setDifficulty('Medium')}
              >
                <i style={{ background: '#d8ee3b' }} />
                Medium
              </button>
              <button
                type="button"
                data-d="Hard"
                aria-pressed={difficulty === 'Hard'}
                onClick={() => setDifficulty('Hard')}
              >
                <i style={{ background: 'var(--hard)' }} />
                Hard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MAIN BODY: 3-COLUMN WORKSPACE
          Left (240px) Outline & Topics | Center (1fr) Tabs & Editors | Right (350px) Live Preview
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-body">
        {/* LEFT COLUMN: Outline Checklist & Topic Tags */}
        <section className="tf-card tf-col rise" style={{ '--k': 6 }} aria-label="Outline">
          <h3>Outline</h3>
          <div className="tf-secs">
            {outlineItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOutlineClick(item, idx)}
                className={`tf-sec ${activeOutlineIndex === idx ? 'on' : ''} ${item.isComplete ? 'done' : ''}`}
              >
                <i>✓</i>
                {item.name}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: '22px' }}>Topics</h3>
          <div className="tf-tags">
            {topics.map((t, idx) => (
              <span key={idx} className="tf-tag">
                #{t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => handleRemoveTopic(idx)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="tf-tin">
            <input
              type="text"
              placeholder="Add a topic"
              value={newTopicInput}
              onChange={(e) => setNewTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTopic();
                }
              }}
            />
            <button
              type="button"
              onClick={handleAddTopic}
              className="tf-btn lt"
              style={{ padding: '8px 14px', borderRadius: '12px' }}
            >
              Add
            </button>
          </div>
        </section>

        {/* CENTER COLUMN: Tabs + Details, Starter Code & Reference Solution */}
        <section className="tf-card rise" style={{ '--k': 7 }} aria-label="Question editor">
          {/* Sliding Pill Tabs */}
          <div className="tf-ptabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'details'}
              className={activeTab === 'details' ? 'active' : ''}
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'starter'}
              className={activeTab === 'starter' ? 'active' : ''}
              onClick={() => setActiveTab('starter')}
            >
              Starter code
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reference'}
              className={activeTab === 'reference' ? 'active' : ''}
              onClick={() => setActiveTab('reference')}
            >
              Reference solution
            </button>
          </div>

          {/* PANEL 1: Details */}
          {activeTab === 'details' && (
            <div id="details-panel" className="space-y-4">
              {/* Question title */}
              <div className="fld" id="f-title">
                <label htmlFor="title">
                  Question title <span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  placeholder="e.g. Find the first non-repeating character"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    triggerAutoSave();
                  }}
                />
              </div>

              {/* Problem statement */}
              <div className="fld" id="f-stmt">
                <span className="lab">
                  Problem statement <span className="req">*</span>
                </span>
                <div className="tb" role="toolbar" aria-label="Formatting">
                  <button type="button" onClick={() => handleApplyMarkdown('\n# ')}>H1</button>
                  <button type="button" onClick={() => handleApplyMarkdown('\n## ')}>H2</button>
                  <button type="button" onClick={() => handleApplyMarkdown('**', true)}>B</button>
                  <button type="button" onClick={() => handleApplyMarkdown('*', true)}>
                    <i>I</i>
                  </button>
                  <button type="button" onClick={() => handleApplyMarkdown('`', true)} className="mono">
                    &lt;/&gt;
                  </button>
                  <button type="button" onClick={() => handleApplyMarkdown('\n- ')}>List</button>
                  <button type="button" onClick={() => handleApplyMarkdown('\n> ')}>Quote</button>
                </div>
                <textarea
                  ref={statementRef}
                  id="stmt"
                  placeholder="Describe the task. Markdown works here."
                  value={statement}
                  onChange={(e) => {
                    setStatement(e.target.value);
                    triggerAutoSave();
                  }}
                />
                {!statement.trim() && (
                  <div className="empty-tip">
                    <b>?</b>
                    Start with one sentence: what should the program do?
                  </div>
                )}
              </div>

              {/* Input & Output format 2-column */}
              <div className="fld two" id="f-io">
                <div>
                  <label htmlFor="inf">Input format</label>
                  <textarea
                    id="inf"
                    style={{ minHeight: '90px' }}
                    placeholder="First line: a string s."
                    value={inputFormat}
                    onChange={(e) => {
                      setInputFormat(e.target.value);
                      triggerAutoSave();
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="outf">Output format</label>
                  <textarea
                    id="outf"
                    style={{ minHeight: '90px' }}
                    placeholder="Print the first unique character, or #."
                    value={outputFormat}
                    onChange={(e) => {
                      setOutputFormat(e.target.value);
                      triggerAutoSave();
                    }}
                  />
                </div>
              </div>

              {/* Constraints */}
              <div className="fld" id="f-cons">
                <label htmlFor="cons">Constraints</label>
                <textarea
                  id="cons"
                  className="code mono"
                  style={{ minHeight: '90px' }}
                  value={constraints}
                  onChange={(e) => {
                    setConstraints(e.target.value);
                    triggerAutoSave();
                  }}
                />
              </div>

              {/* Examples */}
              <div className="fld" id="f-ex">
                <div className="hd">
                  <span className="lab" style={{ margin: 0 }}>
                    Examples
                  </span>
                  <button type="button" className="link" onClick={handleAddExample}>
                    + Add example
                  </button>
                </div>
                {examples.map((ex, i) => (
                  <div key={i} className="ex">
                    <div className="hd">
                      <b>Example {i + 1}</b>
                      {examples.length > 1 && (
                        <button
                          type="button"
                          className="link text-rose-600 hover:text-rose-700"
                          onClick={() => handleRemoveExample(i)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="two">
                      <div>
                        <label>Sample input</label>
                        <input
                          type="text"
                          className="mono"
                          placeholder="e.g. swiss"
                          value={ex.input}
                          onChange={(e) => handleUpdateExample(i, 'input', e.target.value)}
                        />
                      </div>
                      <div>
                        <label>Sample output</label>
                        <input
                          type="text"
                          className="mono"
                          placeholder="e.g. w"
                          value={ex.output}
                          onChange={(e) => handleUpdateExample(i, 'output', e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label>Explanation (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. w is the first character that appears once."
                        value={ex.explanation}
                        onChange={(e) => handleUpdateExample(i, 'explanation', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PANEL 2: Starter Code */}
          {activeTab === 'starter' && (
            <div id="f-starter" className="space-y-3">
              <div className="hd">
                <label htmlFor="starter" style={{ margin: 0 }}>
                  Starter code (students see this)
                </label>
                <button
                  type="button"
                  className="link text-xs"
                  onClick={() => {
                    const tpl = getStandardTemplate(executionMode, language);
                    if (tpl) setStarterCode(tpl.starterCode);
                    triggerAutoSave();
                    showToast('Reset to default language template');
                  }}
                >
                  Reset template
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden border border-[#DDE1DA] shadow-inner bg-[#131416]">
                <CodeEditor
                  height="340px"
                  value={starterCode}
                  onChange={(val) => {
                    setStarterCode(val || '');
                    triggerAutoSave();
                  }}
                  language={language}
                  theme="vs-dark"
                />
              </div>
            </div>
          )}

          {/* PANEL 3: Reference Solution */}
          {activeTab === 'reference' && (
            <div id="f-ref" className="space-y-3">
              <div className="note">Teacher only. Never shown in the student preview.</div>
              <div className="hd">
                <label htmlFor="ref" style={{ margin: 0 }}>
                  Reference solution
                </label>
                <button
                  type="button"
                  className="link text-xs"
                  onClick={() => {
                    const tpl = getStandardTemplate(executionMode, language);
                    if (tpl) setReferenceSolution(tpl.referenceSolution);
                    triggerAutoSave();
                    showToast('Reset to default reference solution');
                  }}
                >
                  Reset template
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden border border-[#DDE1DA] shadow-inner bg-[#131416]">
                <CodeEditor
                  height="340px"
                  value={referenceSolution}
                  onChange={(val) => {
                    setReferenceSolution(val || '');
                    triggerAutoSave();
                  }}
                  language={language}
                  theme="vs-dark"
                />
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Student Live Preview */}
        <section id="pv-section" className="tf-card tf-col right-col rise" style={{ '--k': 8 }} aria-label="Student preview">
          <div className="hd">
            <h3 style={{ margin: 0 }}>Student preview</h3>
            <span className="pill v">Live</span>
          </div>

          <div className="tf-ptabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === 'problem'}
              className={previewTab === 'problem' ? 'active' : ''}
              onClick={() => setPreviewTab('problem')}
            >
              Problem
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === 'example'}
              className={previewTab === 'example' ? 'active' : ''}
              onClick={() => setPreviewTab('example')}
            >
              Example
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewTab === 'starter'}
              className={previewTab === 'starter' ? 'active' : ''}
              onClick={() => setPreviewTab('starter')}
            >
              Starter
            </button>
          </div>

          <div className="pv">
            {previewTab === 'problem' && (
              <div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  <span className={`pill ${difficulty}`}>{difficulty}</span>
                  <span className="pill v">
                    {SUPPORTED_LANGS.find((l) => l.id === language)?.label || language}
                  </span>
                </div>
                <h2>{title.trim() || 'Untitled question'}</h2>

                <span className="cap">Problem statement</span>
                <pre>{statement.trim() || 'No problem statement yet.'}</pre>

                <span className="cap">Input</span>
                <pre>{inputFormat.trim() || '—'}</pre>

                <span className="cap">Output</span>
                <pre>{outputFormat.trim() || '—'}</pre>

                <span className="cap">Constraints</span>
                <pre className="mono">{constraints.trim() || '—'}</pre>
              </div>
            )}

            {previewTab === 'example' && (
              <div>
                <span className="cap">Sample input</span>
                <pre className="mono">{examples[0]?.input || '—'}</pre>

                <span className="cap">Sample output</span>
                <pre className="mono">{examples[0]?.output || '—'}</pre>

                <span className="cap">Explanation</span>
                <pre>{examples[0]?.explanation || '—'}</pre>
              </div>
            )}

            {previewTab === 'starter' && (
              <div>
                <span className="cap">Starter code</span>
                <pre className="mono">{starterCode.trim() || '// No starter code specified'}</pre>
              </div>
            )}
          </div>

          <p className="tf-sub" style={{ margin: '14px 0 0' }}>
            Reference solution and hidden tests never appear here.
          </p>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[24px] border border-[rgba(0,0,0,.08)] p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-extrabold text-[#121212]">Delete this Question?</h4>
            <p className="text-xs text-[#73736c] mt-1 leading-relaxed">
              This action cannot be undone. Associated test cases will also be permanently deleted.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-full bg-[#f1f1ee] hover:bg-[#e4e4e0] text-xs font-bold text-[#121212] border-0 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteQuestion}
                className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white border-0 shadow-sm cursor-pointer"
              >
                {isDeleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Toast */}
      <div className={`tf-toast ${toastMsg ? 'on' : ''}`} role="status">
        {toastMsg}
      </div>
    </div>
  );
};
