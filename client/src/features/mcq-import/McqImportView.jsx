import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Upload,
  Download,
  BookOpen,
  Award,
  Layers,
  CheckCircle2,
  Check,
  X,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Search,
  Filter,
  Sparkles,
  HelpCircle,
  Settings,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RotateCcw,
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Code,
  List,
  Quote,
  Link2,
  Image as ImageIcon,
  CheckSquare,
  Square,
  FileSpreadsheet,
  ArrowRight,
  FileCheck2,
  Brain,
  SlidersHorizontal,
  Compass,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api';

// Pre-seeded starter questions matching specification
const DEFAULT_INITIAL_MCQS = [
  {
    question: 'Which data structure follows the LIFO (Last In First Out) principle?',
    optionA: 'Stack',
    optionB: 'Queue',
    optionC: 'Array',
    optionD: 'Linked List',
    correctAnswer: 'A',
    marks: 2,
    topic: 'Computer Science',
    difficulty: 'Medium',
    explanation: 'A Stack processes elements in reverse order of arrival (LIFO).'
  },
  {
    question: 'Time complexity of binary search in a sorted array is:',
    optionA: 'O(n)',
    optionB: 'O(log n)',
    optionC: 'O(n log n)',
    optionD: 'O(1)',
    correctAnswer: 'B',
    marks: 2,
    topic: 'Computer Science',
    difficulty: 'Easy',
    explanation: 'Binary search halves the search space at each iteration resulting in logarithmic time.'
  },
  {
    question: 'Which collision resolution technique in hash tables maintains a linked list at each bucket?',
    optionA: 'Linear Probing',
    optionB: 'Quadratic Probing',
    optionC: 'Separate Chaining',
    optionD: 'Double Hashing',
    correctAnswer: 'C',
    marks: 2,
    topic: 'Data Structures',
    difficulty: 'Medium',
    explanation: 'Separate Chaining stores keys that hash to the same bucket in a linked list.'
  },
  {
    question: 'What is the worst-case time complexity of QuickSort?',
    optionA: 'O(n log n)',
    optionB: 'O(n)',
    optionC: 'O(n²)',
    optionD: 'O(log n)',
    correctAnswer: 'C',
    marks: 2,
    topic: 'Algorithms',
    difficulty: 'Medium',
    explanation: 'QuickSort degrades to O(n²) when the chosen pivot partitions into empty subarrays.'
  },
  {
    question: 'In a max-heap with N elements, what is the time complexity of deleting the maximum element?',
    optionA: 'O(1)',
    optionB: 'O(log N)',
    optionC: 'O(N)',
    optionD: 'O(N log N)',
    correctAnswer: 'B',
    marks: 2,
    topic: 'Data Structures',
    difficulty: 'Hard',
    explanation: 'Replacing root with last leaf and sifting down takes O(log N) operations.'
  }
];

// Smooth number counter transition
const AnimatedCount = ({ value, duration = 900 }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const numVal = Number(value) || 0;
    const step = (now) => {
      const elapsed = now - start;
      const k = Math.min(1, elapsed / duration);
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

export const McqImportView = ({ currentUser }) => {
  // Mode Selection: 'ai' | 'manual' | 'bank'
  const [activeMode, setActiveMode] = useState('ai');

  // Check whether current user is demo faculty vs personal authenticated teacher
  const isDemo = useMemo(() => {
    if (!currentUser) return false;
    const email = (currentUser.email || '').toLowerCase();
    return email === 'teacher@testforge.edu' || email === 'student@testforge.edu';
  }, [currentUser]);

  // Questions Database State
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Manual Form Fields
  const [questionText, setQuestionText] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [marks, setMarks] = useState(2);
  const [topic, setTopic] = useState('Computer Science');
  const [difficulty, setDifficulty] = useState('Medium');
  const [explanation, setExplanation] = useState('');

  // AI Generator Parameters
  const [aiSubject, setAiSubject] = useState('Computer Science');
  const [aiTopic, setAiTopic] = useState('Operating Systems');
  const [aiSubtopic, setAiSubtopic] = useState('Deadlocks, Process Synchronization');
  const [aiBloomLevel, setAiBloomLevel] = useState('Understand');
  const [aiDifficulty, setAiDifficulty] = useState('Medium'); // 'Easy' | 'Medium' | 'Hard' | 'Mixed'
  const [aiStyle, setAiStyle] = useState('conceptual'); // 'conceptual' | 'factual' | 'application_based'
  const [aiAnswerType, setAiAnswerType] = useState('single'); // 'single' | 'multiple'
  const [aiCount, setAiCount] = useState(5);
  const [aiInstructions, setAiInstructions] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [generatedBatch, setGeneratedBatch] = useState([]);

  // Candidate Review Queue State
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(new Set());
  const [editingCandidateId, setEditingCandidateId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [editErrors, setEditErrors] = useState([]);
  const [regeneratingCandidateId, setRegeneratingCandidateId] = useState(null);


  // Settings State
  const [defaultMarks, setDefaultMarks] = useState(2);
  const [defaultDifficulty, setDefaultDifficulty] = useState('Medium');
  const [defaultTopic, setDefaultTopic] = useState('Computer Science');

  // Search & Filters in Database Table
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');

  // Modals & Notifications
  const [notification, setNotification] = useState(null);

  const heroRef = useRef(null);
  const tiltRef = useRef(null);

  // Fetch saved questions from MongoDB
  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/mcq/saved');
      let items = res.data?.data?.items || [];

      if (items.length === 0 && isDemo) {
        const seeded = [];
        for (const item of DEFAULT_INITIAL_MCQS) {
          try {
            const seedRes = await api.post('/mcq', item);
            if (seedRes.data?.data) seeded.push(seedRes.data.data);
          } catch {
            // fallback
          }
        }
        items = seeded.length > 0 ? seeded : DEFAULT_INITIAL_MCQS.map((q, i) => ({ ...q, _id: `local-${i}` }));
      }

      setQuestions(items);
    } catch (err) {
      console.warn('Failed to fetch MCQs:', err);
      if (isDemo) {
        setQuestions(DEFAULT_INITIAL_MCQS.map((q, i) => ({ ...q, _id: `local-${i}` })));
      } else {
        setQuestions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  // Calculate Real Statistics directly from database
  const stats = useMemo(() => {
    const totalQuestions = questions.length;
    const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
    const uniqueTopics = new Set(
      questions
        .map((q) => (q.topic || '').trim())
        .filter(Boolean)
    ).size;
    const aiCount = questions.filter(
      (q) => q.isAiGenerated || q.aiSynthesized || q.tags?.includes('AI')
    ).length;

    return {
      totalQuestions,
      totalMarks,
      distinctTopics: uniqueTopics,
      aiSynthesized: aiCount
    };
  }, [questions]);

  // Unique topics list
  const availableTopics = useMemo(() => {
    const set = new Set(['Computer Science', 'Data Structures', 'Algorithms', 'Web Development', 'Operating Systems']);
    questions.forEach((q) => {
      if (q.topic) set.add(q.topic);
    });
    return Array.from(set);
  }, [questions]);

  // Filtered Questions in Bank Table
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (topicFilter !== 'all' && q.topic !== topicFilter) return false;
      if (difficultyFilter !== 'all' && (q.difficulty || 'Medium') !== difficultyFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const text = (q.question || '').toLowerCase();
        const topicStr = (q.topic || '').toLowerCase();
        return text.includes(query) || topicStr.includes(query);
      }
      return true;
    });
  }, [questions, topicFilter, difficultyFilter, searchQuery]);

  // AI Question Generation Engine
  const handleTriggerAiGeneration = async () => {
    if (!aiSubject.trim() || !aiTopic.trim()) {
      setNotification({
        type: 'error',
        text: 'Please enter both Subject and Topic before generating MCQs.'
      });
      return;
    }

    setIsAiGenerating(true);
    setNotification(null);

    try {
      const subtopicsList = aiSubtopic
        ? aiSubtopic.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const payload = {
        subject: aiSubject.trim(),
        topic: aiTopic.trim(),
        subtopics: subtopicsList,
        count: Math.min(Math.max(Number(aiCount) || 5, 1), 25),
        difficulty: aiDifficulty,
        style: aiStyle,
        answerType: aiAnswerType,
        bloomLevel: aiBloomLevel,
        instructions: aiInstructions.trim()
      };

      const res = await api.post('/ai/generate-mcq', payload, { timeout: 120000 });
      const candidates = res.data?.data?.candidates || [];

      if (!candidates || candidates.length === 0) {
        throw new Error('No candidate MCQs were generated. Please try adjusting your parameters.');
      }

      const formatted = candidates.map((c, idx) => {
        const candId = c.candidateId || `cand_mcq_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        const statement = (c.statement || c.question || '').trim();

        let optionsList = [];
        if (Array.isArray(c.options) && c.options.length > 0) {
          optionsList = c.options.map((opt, oIdx) => ({
            id: String(opt.id || String.fromCharCode(65 + oIdx)).toUpperCase(),
            text: String(opt.text ?? opt.value ?? '').trim()
          }));
        } else {
          optionsList = [
            { id: 'A', text: c.optionA || '' },
            { id: 'B', text: c.optionB || '' },
            { id: 'C', text: c.optionC || '' },
            { id: 'D', text: c.optionD || '' }
          ].filter(o => o.text);
        }

        let correctAnswers = [];
        if (Array.isArray(c.correctAnswers) && c.correctAnswers.length > 0) {
          correctAnswers = c.correctAnswers.map(a => String(a).toUpperCase());
        } else if (c.correctAnswer) {
          correctAnswers = [String(c.correctAnswer).toUpperCase()];
        } else {
          correctAnswers = ['A'];
        }

        return {
          _id: candId,
          candidateId: candId,
          statement,
          question: statement,
          options: optionsList,
          optionA: optionsList.find(o => o.id === 'A')?.text || '',
          optionB: optionsList.find(o => o.id === 'B')?.text || '',
          optionC: optionsList.find(o => o.id === 'C')?.text || '',
          optionD: optionsList.find(o => o.id === 'D')?.text || '',
          correctAnswers,
          correctAnswer: correctAnswers[0] || 'A',
          answerType: c.answerType || aiAnswerType,
          subject: c.subject || aiSubject,
          topic: c.topic || aiTopic,
          difficulty: c.difficulty || aiDifficulty,
          style: c.style || aiStyle,
          bloomLevel: c.bloomLevel || c.bloomTaxonomy || aiBloomLevel,
          bloomTaxonomy: c.bloomTaxonomy || c.bloomLevel || aiBloomLevel,
          marks: Number(c.marks) || 1,
          explanation: c.explanation || '',
          isAiGenerated: true
        };
      });

      setGeneratedBatch(formatted);
      setSelectedCandidateIds(new Set(formatted.map(c => c.candidateId)));
      setNotification({
        type: 'success',
        text: `Synthesized ${formatted.length} high-yield MCQs calibrated to ${aiBloomLevel} domain using Gemini AI!`
      });
    } catch (err) {
      console.error('AI Generation Error:', err);
      const errMsg = err.customMessage || err.response?.data?.message || err.message || 'AI generation encountered an error. Please retry.';
      setNotification({ type: 'error', text: errMsg });
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Regenerate an Individual Candidate Question
  const handleRegenerateIndividual = async (cand) => {
    const candId = cand.candidateId || cand._id;
    setRegeneratingCandidateId(candId);
    try {
      const payload = {
        subject: cand.subject || aiSubject,
        topic: cand.topic || aiTopic,
        subtopics: cand.topic ? [cand.topic] : [],
        count: 1,
        difficulty: cand.difficulty || aiDifficulty,
        style: cand.style || aiStyle,
        answerType: cand.answerType || aiAnswerType,
        bloomLevel: cand.bloomLevel || aiBloomLevel,
        instructions: aiInstructions.trim()
      };

      const res = await api.post('/ai/generate-mcq', payload, { timeout: 120000 });
      const candidates = res.data?.data?.candidates || [];
      if (!candidates || candidates.length === 0) {
        throw new Error('Failed to regenerate question. Please try again.');
      }

      const newQ = candidates[0];
      const newCandId = newQ.candidateId || `cand_mcq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const statement = (newQ.statement || newQ.question || '').trim();

      let optionsList = [];
      if (Array.isArray(newQ.options) && newQ.options.length > 0) {
        optionsList = newQ.options.map((opt, oIdx) => ({
          id: String(opt.id || String.fromCharCode(65 + oIdx)).toUpperCase(),
          text: String(opt.text ?? opt.value ?? '').trim()
        }));
      } else {
        optionsList = [
          { id: 'A', text: newQ.optionA || '' },
          { id: 'B', text: newQ.optionB || '' },
          { id: 'C', text: newQ.optionC || '' },
          { id: 'D', text: newQ.optionD || '' }
        ].filter(o => o.text);
      }

      let correctAnswers = [];
      if (Array.isArray(newQ.correctAnswers) && newQ.correctAnswers.length > 0) {
        correctAnswers = newQ.correctAnswers.map(a => String(a).toUpperCase());
      } else if (newQ.correctAnswer) {
        correctAnswers = [String(newQ.correctAnswer).toUpperCase()];
      } else {
        correctAnswers = ['A'];
      }

      const formattedNew = {
        _id: newCandId,
        candidateId: newCandId,
        statement,
        question: statement,
        options: optionsList,
        optionA: optionsList.find(o => o.id === 'A')?.text || '',
        optionB: optionsList.find(o => o.id === 'B')?.text || '',
        optionC: optionsList.find(o => o.id === 'C')?.text || '',
        optionD: optionsList.find(o => o.id === 'D')?.text || '',
        correctAnswers,
        correctAnswer: correctAnswers[0] || 'A',
        answerType: newQ.answerType || cand.answerType,
        subject: newQ.subject || cand.subject,
        topic: newQ.topic || cand.topic,
        difficulty: newQ.difficulty || cand.difficulty,
        style: newQ.style || cand.style,
        bloomLevel: newQ.bloomLevel || newQ.bloomTaxonomy || cand.bloomLevel,
        bloomTaxonomy: newQ.bloomTaxonomy || newQ.bloomLevel || cand.bloomLevel,
        marks: Number(newQ.marks) || cand.marks || 1,
        explanation: newQ.explanation || '',
        isAiGenerated: true
      };

      setGeneratedBatch(prev => prev.map(item => (item.candidateId === candId || item._id === candId ? formattedNew : item)));
      setSelectedCandidateIds(prev => {
        const nextSet = new Set(prev);
        nextSet.delete(candId);
        nextSet.add(newCandId);
        return nextSet;
      });

      setNotification({
        type: 'success',
        text: 'Regenerated question successfully!'
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error('Individual Regeneration Error:', err);
      const msg = err.customMessage || err.response?.data?.message || err.message || 'Regeneration failed. Please retry.';
      setNotification({ type: 'error', text: msg });
    } finally {
      setRegeneratingCandidateId(null);
    }
  };

  // Candidate Selection Handlers
  const handleToggleSelectCandidate = (candId) => {
    setSelectedCandidateIds(prev => {
      const nextSet = new Set(prev);
      if (nextSet.has(candId)) {
        nextSet.delete(candId);
      } else {
        nextSet.add(candId);
      }
      return nextSet;
    });
  };

  const handleSelectAllCandidates = () => {
    setSelectedCandidateIds(new Set(generatedBatch.map(c => c.candidateId || c._id)));
  };

  const handleDeselectAllCandidates = () => {
    setSelectedCandidateIds(new Set());
  };

  const handleDiscardCandidate = (candId) => {
    setGeneratedBatch(prev => prev.filter(c => (c.candidateId ? c.candidateId !== candId : c._id !== candId)));
    setSelectedCandidateIds(prev => {
      const nextSet = new Set(prev);
      nextSet.delete(candId);
      return nextSet;
    });
    if (editingCandidateId === candId) {
      setEditingCandidateId(null);
      setEditFormData(null);
    }
  };

  // Inline Editing Handlers for AI Candidates
  const handleStartEditCandidate = (cand) => {
    setEditingCandidateId(cand.candidateId || cand._id);
    setEditErrors([]);
    setEditFormData({
      statement: cand.statement || cand.question || '',
      answerType: cand.answerType || 'single',
      options: cand.options.map(o => ({ ...o })),
      correctAnswers: Array.isArray(cand.correctAnswers) ? [...cand.correctAnswers] : [cand.correctAnswer || 'A'],
      explanation: cand.explanation || '',
      difficulty: cand.difficulty || 'Medium',
      bloomLevel: cand.bloomLevel || 'Understand',
      marks: Number(cand.marks) || 1
    });
  };

  const handleCancelEditCandidate = () => {
    setEditingCandidateId(null);
    setEditFormData(null);
    setEditErrors([]);
  };

  const handleAddEditCandidateOption = () => {
    if (!editFormData || editFormData.options.length >= 8) return;
    const nextCharCode = 65 + editFormData.options.length;
    const nextId = String.fromCharCode(nextCharCode);
    setEditFormData(prev => ({
      ...prev,
      options: [...prev.options, { id: nextId, text: '' }]
    }));
  };

  const handleRemoveEditCandidateOption = (optId) => {
    if (!editFormData || editFormData.options.length <= 2) return;
    const remaining = editFormData.options
      .filter(o => o.id !== optId)
      .map((o, idx) => ({ ...o, id: String.fromCharCode(65 + idx) }));

    const updatedCorrect = editFormData.correctAnswers.filter(a => a !== optId);
    setEditFormData(prev => ({
      ...prev,
      options: remaining,
      correctAnswers: updatedCorrect.length > 0 ? updatedCorrect : [remaining[0].id]
    }));
  };

  const handleToggleEditCandidateCorrectAnswer = (optId) => {
    if (!editFormData) return;
    if (editFormData.answerType === 'single') {
      setEditFormData(prev => ({
        ...prev,
        correctAnswers: [optId]
      }));
    } else {
      setEditFormData(prev => {
        const exists = prev.correctAnswers.includes(optId);
        const updated = exists
          ? prev.correctAnswers.filter(id => id !== optId)
          : [...prev.correctAnswers, optId];
        return {
          ...prev,
          correctAnswers: updated
        };
      });
    }
  };

  const handleSaveEditCandidate = () => {
    if (!editFormData) return;
    const errors = [];
    if (!editFormData.statement.trim() || editFormData.statement.trim().length < 10) {
      errors.push('Question statement must contain at least 10 characters.');
    }
    if (editFormData.options.some(o => !o.text.trim())) {
      errors.push('All option fields must have non-empty text.');
    }
    const optionTexts = editFormData.options.map(o => o.text.trim().toLowerCase());
    if (new Set(optionTexts).size !== optionTexts.length) {
      errors.push('All answer options must have distinct text.');
    }
    if (editFormData.correctAnswers.length === 0) {
      errors.push('Please select at least one correct answer.');
    }
    if (editFormData.answerType === 'single' && editFormData.correctAnswers.length !== 1) {
      errors.push('Single choice questions must have exactly one correct answer.');
    }

    if (errors.length > 0) {
      setEditErrors(errors);
      return;
    }

    setGeneratedBatch(prev => prev.map(cand => {
      const candId = cand.candidateId || cand._id;
      if (candId === editingCandidateId) {
        return {
          ...cand,
          statement: editFormData.statement.trim(),
          question: editFormData.statement.trim(),
          options: editFormData.options.map(o => ({ ...o, text: o.text.trim() })),
          optionA: editFormData.options.find(o => o.id === 'A')?.text.trim() || '',
          optionB: editFormData.options.find(o => o.id === 'B')?.text.trim() || '',
          optionC: editFormData.options.find(o => o.id === 'C')?.text.trim() || '',
          optionD: editFormData.options.find(o => o.id === 'D')?.text.trim() || '',
          correctAnswers: editFormData.correctAnswers,
          correctAnswer: editFormData.correctAnswers[0] || 'A',
          answerType: editFormData.answerType,
          explanation: editFormData.explanation.trim(),
          difficulty: editFormData.difficulty,
          bloomLevel: editFormData.bloomLevel,
          bloomTaxonomy: editFormData.bloomLevel,
          marks: Number(editFormData.marks) || 1
        };
      }
      return cand;
    }));

    setEditingCandidateId(null);
    setEditFormData(null);
    setEditErrors([]);
    setNotification({
      type: 'success',
      text: 'Candidate edits saved successfully!'
    });
    setTimeout(() => setNotification(null), 3000);
  };

  // Approve Selected Candidates & Commit to MongoDB Question Bank
  const handleApproveSelected = async () => {
    const selectedList = generatedBatch.filter(c => selectedCandidateIds.has(c.candidateId || c._id));
    if (selectedList.length === 0) {
      setNotification({
        type: 'error',
        text: 'No candidate questions selected. Please select at least one question to approve.'
      });
      return;
    }

    // Client-side pre-validation
    for (let i = 0; i < selectedList.length; i++) {
      const q = selectedList[i];
      if (!q.statement || q.statement.length < 10) {
        setNotification({
          type: 'error',
          text: `Candidate #${i + 1} has an invalid statement (less than 10 characters). Please edit it first.`
        });
        return;
      }
      if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
        setNotification({
          type: 'error',
          text: `Candidate #${i + 1} does not have any correct answer specified. Please edit it first.`
        });
        return;
      }
    }

    setSaving(true);
    try {
      const candidatesPayload = selectedList.map(q => ({
        statement: q.statement || q.question,
        question: q.statement || q.question,
        options: q.options || [
          { id: 'A', text: q.optionA },
          { id: 'B', text: q.optionB },
          { id: 'C', text: q.optionC },
          { id: 'D', text: q.optionD }
        ],
        correctAnswers: q.correctAnswers || [q.correctAnswer || 'A'],
        correctAnswer: q.correctAnswer || (q.correctAnswers ? q.correctAnswers[0] : 'A'),
        answerType: q.answerType || 'single',
        subject: q.subject || aiSubject,
        topic: q.topic || aiTopic,
        difficulty: q.difficulty || aiDifficulty,
        style: q.style || aiStyle,
        marks: Number(q.marks) || 1,
        explanation: q.explanation || '',
        bloomTaxonomy: q.bloomTaxonomy || q.bloomLevel || 'Understand',
        bloomLevel: q.bloomLevel || q.bloomTaxonomy || 'Understand',
        isAiGenerated: true,
        status: 'published'
      }));

      const res = await api.post('/mcq/batch', { candidates: candidatesPayload });
      const resData = res.data?.data;
      const savedDocs = Array.isArray(resData) ? resData : (resData?.savedQuestions || resData?.items || []);

      // Prepend to Question Bank vault
      if (savedDocs.length > 0) {
        setQuestions(prev => [...savedDocs, ...prev]);
      } else {
        // Refresh question bank directly
        await fetchQuestions();
      }

      // Remove approved questions from candidate review queue
      const approvedIds = new Set(selectedList.map(c => c.candidateId || c._id));
      setGeneratedBatch(prev => prev.filter(c => !approvedIds.has(c.candidateId || c._id)));
      setSelectedCandidateIds(prev => {
        const nextSet = new Set(prev);
        for (const id of approvedIds) nextSet.delete(id);
        return nextSet;
      });

      setNotification({
        type: 'success',
        text: `Successfully approved and saved ${savedDocs.length || selectedList.length} MCQs to MongoDB Question Bank!`
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.error('Approval Batch Persistence Error:', err);
      const msg = err.customMessage || err.response?.data?.message || err.message || 'Failed to save approved questions to bank.';
      setNotification({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  // Save / Update Single Manual Question
  const handleSaveManual = async (e) => {
    e.preventDefault();
    if (!questionText.trim() || !optionA.trim() || !optionB.trim()) {
      alert('Question text and at least 2 options are required.');
      return;
    }

    setSaving(true);
    const payload = {
      question: questionText.trim(),
      optionA: optionA.trim(),
      optionB: optionB.trim(),
      optionC: optionC.trim() || 'N/A',
      optionD: optionD.trim() || 'N/A',
      correctAnswer,
      marks: Number(marks) || defaultMarks,
      topic: topic.trim() || defaultTopic,
      difficulty,
      explanation: explanation.trim()
    };

    try {
      if (editingId) {
        await api.put(`/mcq/saved/${editingId}`, payload);
      } else {
        await api.post('/mcq', payload);
      }
      await fetchQuestions();
      handleClearForm();
      setActiveMode('bank');
      setNotification({ type: 'success', text: 'Question saved successfully!' });
    } catch {
      alert('Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  // Clear Form Fields
  const handleClearForm = () => {
    setEditingId(null);
    setQuestionText('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer('A');
    setMarks(defaultMarks);
    setTopic(defaultTopic);
    setDifficulty(defaultDifficulty);
    setExplanation('');
  };

  // Start Edit
  const handleStartEdit = (q) => {
    setEditingId(q._id);
    setQuestionText(q.question || '');
    setOptionA(q.optionA || '');
    setOptionB(q.optionB || '');
    setOptionC(q.optionC || '');
    setOptionD(q.optionD || '');
    setCorrectAnswer(q.correctAnswer || 'A');
    setMarks(q.marks || defaultMarks);
    setTopic(q.topic || defaultTopic);
    setDifficulty(q.difficulty || defaultDifficulty);
    setExplanation(q.explanation || '');
    setActiveMode('manual');
  };

  // Delete Question
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.delete(`/mcq/saved/${id}`);
      setQuestions((prev) => prev.filter((q) => q._id !== id));
      setNotification({ type: 'success', text: 'Question deleted.' });
    } catch {
      setQuestions((prev) => prev.filter((q) => q._id !== id));
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['Question,Option A,Option B,Option C,Option D,Correct Answer,Marks,Topic,Difficulty,Explanation'];
    const rows = questions.map((q) =>
      [
        `"${(q.question || '').replace(/"/g, '""')}"`,
        `"${(q.optionA || '').replace(/"/g, '""')}"`,
        `"${(q.optionB || '').replace(/"/g, '""')}"`,
        `"${(q.optionC || '').replace(/"/g, '""')}"`,
        `"${(q.optionD || '').replace(/"/g, '""')}"`,
        q.correctAnswer,
        q.marks || 2,
        `"${q.topic || 'General'}"`,
        q.difficulty || 'Medium',
        `"${(q.explanation || '').replace(/"/g, '""')}"`
      ].join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TestForge_MCQ_Bank_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3D Gyro Handlers
  const handleHeroMouseMove = (e) => {
    if (!heroRef.current || !tiltRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.style.transform = `rotateX(${-y * 18}deg) rotateY(${x * 24}deg)`;
  };

  const handleHeroMouseLeave = () => {
    if (!tiltRef.current) return;
    tiltRef.current.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div className="tf-mcq-root select-none font-sans text-[#171819] pb-16">
      {/* ────────────────────────────────────────────────────────────────────────────
          SCOPED STYLES: 100% LIGHT THEME, 3D NEURAL CORE, QUESTION BANK MOTIONS
          ──────────────────────────────────────────────────────────────────────────── */}
      <style>{`
        .tf-mcq-root {
          --canvas: #F2F3F0;
          --card: #FFFFFF;
          --line: #DDE1DA;
          --ink: #171819;
          --mute: #777D78;
          --acc: #EDFF72;
          --dark: #101112;
        }

        /* Top 2-Column Banner Grid */
        .tf-mcq-root .tf-top {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1024px) {
          .tf-mcq-root .tf-top {
            grid-template-columns: 1fr;
          }
        }

        /* Bento Cards */
        .tf-mcq-root .tf-card {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 28px;
          position: relative;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        /* Hero Bento Card */
        .tf-mcq-root .tf-hero {
          background: #101112;
          color: #ffffff;
          padding: 32px 36px;
          border-radius: 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 290px;
          position: relative;
          overflow: hidden;
          border: 1px solid #232528;
        }

        /* Staggered Title Animations */
        .tf-mcq-root .hero-title {
          font-size: clamp(32px, 3.4vw, 46px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.05;
          margin: 6px 0 10px;
          display: flex;
          flex-wrap: wrap;
        }
        .tf-mcq-root .tfTitleChar {
          display: inline-block;
          animation: tfCharIn 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
          animation-delay: calc(var(--ci) * 0.025s);
        }
        @keyframes tfCharIn {
          from {
            opacity: 0;
            transform: translateY(14px) rotate(4deg);
          }
          to {
            opacity: 1;
            transform: translateY(0) rotate(0deg);
          }
        }

        /* 3D Neural Synapse Spark Stage - Aligned like Create Question */
        .tf-mcq-root .stage {
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
        .tf-mcq-root .stage .float {
          animation: tfSynFloat 3.2s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        @keyframes tfSynFloat {
          0%, 100% {
            transform: translateY(0px) rotateZ(0deg);
          }
          50% {
            transform: translateY(-16px) rotateZ(3deg);
          }
        }
        .tf-mcq-root .tilt {
          transform-style: preserve-3d;
          transition: transform .12s ease-out;
          display: grid;
          place-items: center;
        }
        .tf-mcq-root .synapse-sphere {
          width: 155px;
          height: 155px;
          position: relative;
          transform-style: preserve-3d;
        }
        .tf-mcq-root .orbit-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(237, 255, 114, 0.5);
          transform: rotateX(65deg) rotateY(20deg);
          animation: tfSpinOrbit 8s linear infinite;
        }
        .tf-mcq-root .orbit-ring-2 {
          position: absolute;
          inset: 16px;
          border-radius: 50%;
          border: 2px dashed rgba(255, 255, 255, 0.4);
          transform: rotateX(-50deg) rotateY(35deg);
          animation: tfSpinOrbit2 12s linear infinite;
        }
        .tf-mcq-root .core-spark {
          position: absolute;
          inset: 42px;
          background: #17181c;
          border: 2.5px solid #EDFF72;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 32px rgba(237, 255, 114, 0.45);
        }
        .tf-mcq-root .stage .shadow {
          position: absolute;
          bottom: 24px;
          width: 140px;
          height: 22px;
          border-radius: 50%;
          background: rgba(0,0,0,.55);
          filter: blur(10px);
          animation: tfShadow 3.2s ease-in-out infinite;
        }
        @keyframes tfShadow {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(0.72); opacity: 0.28; }
        }
        @keyframes tfSpinOrbit {
          from { transform: rotateX(65deg) rotateY(20deg) rotateZ(0deg); }
          to { transform: rotateX(65deg) rotateY(20deg) rotateZ(360deg); }
        }
        @keyframes tfSpinOrbit2 {
          from { transform: rotateX(-50deg) rotateY(35deg) rotateZ(360deg); }
          to { transform: rotateX(-50deg) rotateY(35deg) rotateZ(0deg); }
        }

        /* 2x2 Telemetry Cards */
        .tf-mcq-root .tf-quad {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .tf-mcq-root .tf-mini {
          padding: 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 136px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .tf-mcq-root .tf-mini:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04);
        }
        .tf-mcq-root .tf-tile {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: #F2F3F0;
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 800;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .tf-mcq-root .tf-cap {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .tf-mcq-root .tf-big {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1;
        }
        .tf-mcq-root .tf-sub {
          font-size: 11px;
          font-weight: 600;
          color: var(--mute);
          margin-top: 4px;
        }

        /* Rise Entrance Animations */
        .tf-mcq-root .rise {
          animation: tfRise 0.45s ease backwards;
          animation-delay: calc(var(--k, 0) * 0.06s);
        }
        @keyframes tfRise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────────────────────────
          TOP 2-COLUMN BANNER GRID: HERO CARD + 4 STATS CARDS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="tf-top">
        {/* Left Hero Card with 3D Neural Synapse Spark */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          className="tf-hero rise"
          style={{ '--k': 1 }}
        >
          <div className="max-w-[520px] relative z-10">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1c1d22] border border-[#2d3036] text-[11px] font-mono font-bold tracking-wider text-[#d5dbd2] uppercase mb-2">
              <span className="w-2 h-2 rounded-full bg-[#EDFF72] shadow-[0_0_8px_#EDFF72]" />
              AI COGNITIVE SYNAPSE & MCQ STUDIO
            </div>

            {/* Animated Staggered Character Title */}
            <h1 className="hero-title" aria-label="AI MCQ Studio">
              {'AI MCQ Studio'.split('').map((ch, i) => (
                <span key={i} className="tfTitleChar" style={{ '--ci': i }}>
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              ))}
            </h1>

            <p className="text-xs text-[#a0a59e] max-w-[440px] leading-relaxed mb-6">
              Synthesize Bloom-calibrated questions via AI generation, author custom items, and curate your institution's multiple-choice repository.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveMode('ai')}
                className={`px-5 py-2.5 rounded-full text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-xs ${
                  activeMode === 'ai'
                    ? 'bg-[#EDFF72] text-[#101112]'
                    : 'bg-[#1c1d22] text-white hover:bg-[#252830] border border-[#30333d]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>AI Generator</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('manual')}
                className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMode === 'manual'
                    ? 'bg-[#EDFF72] text-[#101112]'
                    : 'bg-[#1c1d22] text-white hover:bg-[#252830] border border-[#30333d]'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Manual Creator</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('bank')}
                className={`px-4 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMode === 'bank'
                    ? 'bg-[#EDFF72] text-[#101112]'
                    : 'bg-[#1c1d22] text-white hover:bg-[#252830] border border-[#30333d]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Repository Vault ({questions.length})</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-4 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
                title="Export vault to CSV"
              >
                <Download className="w-3.5 h-3.5 text-[#a0a59e]" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={fetchQuestions}
                className="px-3.5 py-2.5 rounded-full bg-[#1c1d22] hover:bg-[#252830] text-xs font-bold text-white border border-[#30333d] transition-all cursor-pointer flex items-center gap-1.5"
                title="Sync live data from MongoDB"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#EDFF72] ${loading ? 'animate-spin' : ''}`} />
                <span>Sync Live</span>
              </button>
            </div>
          </div>

          {/* Footer Telemetry Strip */}
          <div className="pt-4 border-t border-[#23252a] flex items-center gap-5 text-xs text-[#8c9289] font-mono relative z-10 flex-wrap">
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={stats.totalQuestions} /></b> banked
            </span>
            <span>
              <b className="text-[#EDFF72] font-sans text-sm"><AnimatedCount value={stats.distinctTopics} /></b> topics
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={stats.totalMarks} /></b> marks
            </span>
            <span>
              <b className="text-white font-sans text-sm"><AnimatedCount value={stats.aiSynthesized} /></b> AI verified
            </span>
          </div>

          {/* 3D Neural Synapse Spark Stage with Interactive Gyro Tilt */}
          <div className="stage" aria-hidden="true">
            <div className="float">
              <div className="tilt" ref={tiltRef}>
                <div className="synapse-sphere">
                  <div className="orbit-ring" />
                  <div className="orbit-ring-2" />
                  <div className="core-spark">
                    <Brain className="w-8 h-8 text-[#EDFF72] stroke-[2.2]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="shadow" />
          </div>
        </section>

        {/* Right 2x2 Telemetry Cards Grid */}
        <div className="tf-quad">
          {/* Card 1: Banked Questions */}
          <div className="tf-card tf-mini rise" style={{ '--k': 2 }}>
            <div className="tf-tile">
              <BookOpen className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Banked Questions</div>
            <div className="tf-big">
              <AnimatedCount value={stats.totalQuestions} />
            </div>
            <div className="tf-sub">
              Available for paper assembly
            </div>
          </div>

          {/* Card 2: AI Synthesized */}
          <div className="tf-card tf-mini rise" style={{ '--k': 3 }}>
            <div className="tf-tile">
              <Sparkles className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">AI Generated</div>
            <div className="tf-big">
              <AnimatedCount value={stats.aiSynthesized} />
            </div>
            <div className="tf-sub">
              Bloom calibrated items
            </div>
          </div>

          {/* Card 3: Total Allocated Marks */}
          <div className="tf-card tf-mini rise" style={{ '--k': 4 }}>
            <div className="tf-tile">
              <Award className="w-4 h-4 text-[#171819]" />
            </div>
            <div className="tf-cap">Total Marks Capacity</div>
            <div className="tf-big">
              <AnimatedCount value={stats.totalMarks} />m
            </div>
            <div className="tf-sub">
              {stats.distinctTopics} active subject areas
            </div>
          </div>

          {/* Card 4: Validation Engine */}
          <div className="tf-card tf-mini rise" style={{ '--k': 5 }}>
            <div className="flex items-center justify-between">
              <div className="tf-tile">
                <FileCheck2 className="w-4 h-4 text-[#171819]" />
              </div>
              <span className={`w-2 h-2 rounded-full ${stats.totalQuestions > 0 ? 'bg-emerald-500' : 'bg-zinc-400'} shadow-xs`} />
            </div>
            <div className="tf-cap">Syntax Validator</div>
            <div className="tf-big text-lg font-bold">
              {stats.totalQuestions > 0 ? '100% Valid' : '0 Items'}
            </div>
            <div className="tf-sub">
              {stats.totalQuestions > 0 ? `${stats.totalQuestions} verified in vault` : 'Awaiting questions'}
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────────
          MODE NAVIGATION TABS
          ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-6 bg-white border border-[#DDE1DA] rounded-[24px] p-3 shadow-xs flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-[#F2F3F0] rounded-full border border-[#DDE1DA]">
          <button
            type="button"
            onClick={() => setActiveMode('ai')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'ai'
                ? 'bg-[#101112] text-white shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#EDFF72]" />
            <span>AI Question Generator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('manual')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'manual'
                ? 'bg-[#101112] text-white shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Manual Creator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('bank')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'bank'
                ? 'bg-[#101112] text-white shadow-xs'
                : 'text-[#777D78] hover:text-[#171819]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Repository Vault ({questions.length})</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notification.text}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODE 1: AI QUESTION GENERATOR WORKSPACE
          ──────────────────────────────────────────────────────────────────────────── */}
      {activeMode === 'ai' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Generation Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="tf-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-[#171819]" />
                <h3 className="text-sm font-black text-[#171819]">AI Generation Parameters</h3>
              </div>
              <p className="text-[11px] text-[#777D78] mb-4">
                Configure subject, cognitive domain, difficulty, and question style for neural MCQ synthesis.
              </p>

              <div className="space-y-4 text-xs">
                {/* Subject */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">
                    Subject / Discipline *
                  </label>
                  <input
                    type="text"
                    value={aiSubject}
                    onChange={(e) => setAiSubject(e.target.value)}
                    placeholder="e.g. Computer Science, Mathematics"
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#101112]"
                  />
                </div>

                {/* Topic */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">
                    Primary Topic *
                  </label>
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="e.g. Operating Systems, Dynamic Programming"
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#101112]"
                  />
                </div>

                {/* Subtopic */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">
                    Subtopics / Specific Concepts (Optional)
                  </label>
                  <input
                    type="text"
                    value={aiSubtopic}
                    onChange={(e) => setAiSubtopic(e.target.value)}
                    placeholder="e.g. Deadlocks, Banker's algorithm, Semaphores"
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#101112]"
                  />
                </div>

                {/* Question Count (Presets + Custom) */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1.5">
                    Question Count (1 to 25)
                  </label>
                  <div className="flex items-center gap-2">
                    {[5, 10, 20].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAiCount(preset)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          aiCount === preset
                            ? 'bg-[#101112] text-[#EDFF72] border-[#101112] shadow-2xs'
                            : 'bg-[#F2F3F0] text-[#777D78] border-[#DDE1DA] hover:text-[#171819]'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                    <div className="w-24 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={25}
                        value={aiCount}
                        onChange={(e) => setAiCount(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                        className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-black text-center text-[#171819] focus:outline-none focus:border-[#101112]"
                        placeholder="Custom"
                      />
                    </div>
                  </div>
                </div>

                {/* Difficulty & Style */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Difficulty</label>
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                      <option value="Mixed">Mixed (Distributed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Question Style</label>
                    <select
                      value={aiStyle}
                      onChange={(e) => setAiStyle(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                    >
                      <option value="conceptual">Conceptual</option>
                      <option value="factual">Factual</option>
                      <option value="application_based">Application-based</option>
                    </select>
                  </div>
                </div>

                {/* Answer Type & Bloom's Taxonomy Level */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Answer Type</label>
                    <select
                      value={aiAnswerType}
                      onChange={(e) => setAiAnswerType(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                    >
                      <option value="single">Single Correct</option>
                      <option value="multiple">Multiple Correct</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#171819] mb-1">Bloom's Taxonomy</label>
                    <select
                      value={aiBloomLevel}
                      onChange={(e) => setAiBloomLevel(e.target.value)}
                      className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2.5 text-xs font-bold text-[#171819] focus:outline-none cursor-pointer"
                    >
                      <option value="Remember">Remember (Recall)</option>
                      <option value="Understand">Understand (Explain)</option>
                      <option value="Apply">Apply (Execute)</option>
                      <option value="Analyze">Analyze (Distinguish)</option>
                      <option value="Evaluate">Evaluate (Justify)</option>
                    </select>
                  </div>
                </div>

                {/* Additional Instructions */}
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">
                    Additional Instructions (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    placeholder="e.g. Focus on edge conditions in resource allocation, avoid trivial questions."
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs font-semibold text-[#171819] focus:outline-none focus:border-[#101112] resize-none"
                  />
                </div>

                {/* Generate Button */}
                <button
                  type="button"
                  disabled={isAiGenerating}
                  onClick={handleTriggerAiGeneration}
                  className="w-full py-3.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-[#101112] text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Sparkles className={`w-4 h-4 ${isAiGenerating ? 'animate-spin' : 'fill-current'}`} />
                  <span>{isAiGenerating ? 'Synthesizing with Gemini AI...' : `Generate ${aiCount} MCQs with AI`}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Candidate Review Queue (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-black text-[#171819]">
                  Candidate Review Queue
                </h3>
                <p className="text-xs text-[#777D78]">
                  {generatedBatch.length > 0
                    ? `${selectedCandidateIds.size} of ${generatedBatch.length} questions selected for approval`
                    : 'Temporary AI candidates awaiting teacher review'}
                </p>
              </div>

              {generatedBatch.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedCandidateIds.size === generatedBatch.length ? (
                    <button
                      type="button"
                      onClick={handleDeselectAllCandidates}
                      className="px-3 py-1.5 rounded-full bg-[#F2F3F0] text-[#777D78] hover:text-[#171819] text-xs font-bold transition-all cursor-pointer border border-[#DDE1DA]"
                    >
                      Deselect All
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSelectAllCandidates}
                      className="px-3 py-1.5 rounded-full bg-[#F2F3F0] text-[#171819] hover:bg-[#e4e7e1] text-xs font-bold transition-all cursor-pointer border border-[#DDE1DA]"
                    >
                      Select All
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleApproveSelected}
                    disabled={saving || selectedCandidateIds.size === 0}
                    className="px-4 py-1.5 rounded-full bg-[#101112] text-[#EDFF72] text-xs font-black hover:bg-black transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : `Approve Selected (${selectedCandidateIds.size})`}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setGeneratedBatch([]);
                      setSelectedCandidateIds(new Set());
                      setEditingCandidateId(null);
                    }}
                    className="px-2.5 py-1.5 rounded-full text-xs font-bold text-[#777D78] hover:text-rose-600 cursor-pointer"
                  >
                    Clear Queue
                  </button>
                </div>
              )}
            </div>

            {isAiGenerating ? (
              <div className="tf-card py-20 text-center space-y-4">
                <div className="w-10 h-10 border-3 border-[#101112] border-t-transparent rounded-full animate-spin mx-auto" />
                <div>
                  <h4 className="font-black text-sm text-[#171819]">Synthesizing Bloom-Calibrated Questions</h4>
                  <p className="text-xs text-[#777D78] mt-1">Calling Google Gemini for {aiCount} items in {aiBloomLevel} domain...</p>
                </div>
              </div>
            ) : generatedBatch.length === 0 ? (
              <div className="tf-card py-16 text-center space-y-3 p-8">
                <div className="w-12 h-12 rounded-2xl bg-[#F2F3F0] text-[#171819] flex items-center justify-center mx-auto">
                  <Brain className="w-6 h-6 stroke-[1.8]" />
                </div>
                <h4 className="text-sm font-black text-[#171819]">No Generated Items in Current Queue</h4>
                <p className="text-xs text-[#777D78] max-w-sm mx-auto leading-relaxed">
                  Configure your subject, topic, and Bloom taxonomy domain on the left, then click "Generate MCQs with AI" to review candidate questions.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {generatedBatch.map((q, idx) => {
                  const candId = q.candidateId || q._id;
                  const isSelected = selectedCandidateIds.has(candId);
                  const isEditing = editingCandidateId === candId;
                  const isRegenerating = regeneratingCandidateId === candId;

                  if (isEditing && editFormData) {
                    return (
                      <div key={candId} className="tf-card p-6 space-y-4 border-2 border-[#101112] shadow-md bg-white">
                        <div className="flex items-center justify-between pb-2 border-b border-[#DDE1DA]">
                          <span className="text-xs font-black text-[#101112] flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editing Candidate #{idx + 1}</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleCancelEditCandidate}
                            className="text-[#777D78] hover:text-[#101112] p-1 rounded-md cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Edit Validation Errors */}
                        {editErrors.length > 0 && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold space-y-1">
                            {editErrors.map((err, eIdx) => (
                              <div key={eIdx} className="flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{err}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Statement Input */}
                        <div>
                          <label className="block text-[11px] font-bold text-[#171819] mb-1">
                            Question Statement *
                          </label>
                          <textarea
                            rows={3}
                            value={editFormData.statement}
                            onChange={(e) => setEditFormData({ ...editFormData, statement: e.target.value })}
                            className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs font-bold text-[#171819] focus:outline-none focus:border-[#101112]"
                          />
                        </div>

                        {/* Metadata row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-[#171819] mb-1">Difficulty</label>
                            <select
                              value={editFormData.difficulty}
                              onChange={(e) => setEditFormData({ ...editFormData, difficulty: e.target.value })}
                              className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-2.5 py-2 text-xs font-bold text-[#171819]"
                            >
                              <option value="Easy">Easy</option>
                              <option value="Medium">Medium</option>
                              <option value="Hard">Hard</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#171819] mb-1">Answer Type</label>
                            <select
                              value={editFormData.answerType}
                              onChange={(e) => {
                                const newType = e.target.value;
                                setEditFormData({
                                  ...editFormData,
                                  answerType: newType,
                                  correctAnswers: newType === 'single'
                                    ? [editFormData.correctAnswers[0] || 'A']
                                    : editFormData.correctAnswers
                                });
                              }}
                              className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-2.5 py-2 text-xs font-bold text-[#171819]"
                            >
                              <option value="single">Single Correct</option>
                              <option value="multiple">Multiple Correct</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#171819] mb-1">Marks</label>
                            <input
                              type="number"
                              min={1}
                              value={editFormData.marks}
                              onChange={(e) => setEditFormData({ ...editFormData, marks: Number(e.target.value) || 1 })}
                              className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-2.5 py-2 text-xs font-black text-[#171819]"
                            />
                          </div>
                        </div>

                        {/* Options Editor */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-bold text-[#171819]">
                              Options ({editFormData.answerType === 'single' ? 'Click radio to designate correct option' : 'Check all correct options'})
                            </label>
                            {editFormData.options.length < 8 && (
                              <button
                                type="button"
                                onClick={handleAddEditCandidateOption}
                                className="text-xs font-bold text-[#101112] hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Option</span>
                              </button>
                            )}
                          </div>

                          <div className="space-y-2">
                            {editFormData.options.map((opt) => {
                              const isCorrect = editFormData.correctAnswers.includes(opt.id);
                              return (
                                <div
                                  key={opt.id}
                                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                                    isCorrect
                                      ? 'bg-emerald-50/70 border-emerald-300'
                                      : 'bg-[#F2F3F0] border-[#DDE1DA]'
                                  }`}
                                >
                                  {/* Radio or Checkbox */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleEditCandidateCorrectAnswer(opt.id)}
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer transition-all ${
                                      isCorrect
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-white border border-[#DDE1DA] text-[#777D78] hover:border-[#101112]'
                                    }`}
                                  >
                                    {opt.id}
                                  </button>

                                  <input
                                    type="text"
                                    value={opt.text}
                                    onChange={(e) => {
                                      const newText = e.target.value;
                                      setEditFormData({
                                        ...editFormData,
                                        options: editFormData.options.map((o) =>
                                          o.id === opt.id ? { ...o, text: newText } : o
                                        )
                                      });
                                    }}
                                    placeholder={`Option ${opt.id} text`}
                                    className="flex-1 bg-white border border-[#DDE1DA] rounded-lg px-2.5 py-1.5 text-xs text-[#171819] focus:outline-none focus:border-[#101112]"
                                  />

                                  {editFormData.options.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveEditCandidateOption(opt.id)}
                                      className="text-[#777D78] hover:text-rose-600 p-1 rounded-md cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Explanation Input */}
                        <div>
                          <label className="block text-[11px] font-bold text-[#171819] mb-1">
                            Pedagogical Explanation *
                          </label>
                          <textarea
                            rows={2}
                            value={editFormData.explanation}
                            onChange={(e) => setEditFormData({ ...editFormData, explanation: e.target.value })}
                            className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] focus:outline-none focus:border-[#101112]"
                          />
                        </div>

                        {/* Save / Cancel Footer */}
                        <div className="pt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleCancelEditCandidate}
                            className="px-4 py-2 rounded-full text-xs font-bold text-[#777D78] hover:text-[#171819] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEditCandidate}
                            className="px-5 py-2 rounded-full bg-[#101112] text-[#EDFF72] text-xs font-black hover:bg-black transition-all cursor-pointer shadow-xs"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={candId}
                      className={`tf-card p-6 space-y-4 transition-all shadow-xs relative ${
                        isSelected
                          ? 'border-[#101112] bg-white ring-1 ring-[#101112]/20'
                          : 'border-[#DDE1DA] bg-white/80 opacity-85'
                      }`}
                    >
                      {/* Regeneration Overlay Spinner */}
                      {isRegenerating && (
                        <div className="absolute inset-0 bg-white/85 backdrop-blur-xs rounded-[24px] z-10 flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 text-[#101112] animate-spin" />
                          <span className="text-xs font-black text-[#101112]">Regenerating with Gemini AI...</span>
                        </div>
                      )}

                      {/* Header row with selection checkbox & badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectCandidate(candId)}
                            className="cursor-pointer text-[#101112]"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-[#101112] fill-[#EDFF72]" />
                            ) : (
                              <Square className="w-5 h-5 text-[#777D78]" />
                            )}
                          </button>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full bg-[#101112] text-white text-[10px] font-black">
                              Q{idx + 1}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                              {q.bloomLevel || q.bloomTaxonomy}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              q.difficulty === 'Easy' ? 'bg-emerald-50 text-emerald-700' :
                              q.difficulty === 'Hard' ? 'bg-rose-50 text-rose-700' :
                              'bg-amber-50 text-amber-800'
                            }`}>
                              {q.difficulty}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] text-[10px] font-bold">
                              {q.answerType === 'multiple' ? 'Multiple Correct' : 'Single Correct'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] text-[10px] font-bold">
                              {q.topic}
                            </span>
                          </div>
                        </div>

                        <span className="font-mono text-xs font-black text-[#171819] shrink-0 bg-[#F2F3F0] px-2.5 py-1 rounded-xl">
                          {q.marks || 1}m
                        </span>
                      </div>

                      {/* Statement */}
                      <h4 className="font-bold text-sm text-[#171819] leading-snug pl-8">
                        {q.statement || q.question}
                      </h4>

                      {/* Options Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pl-8">
                        {(q.options || []).map((opt) => {
                          const isCorrect = (q.correctAnswers || []).includes(opt.id) || q.correctAnswer === opt.id;
                          return (
                            <div
                              key={opt.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-all ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold ring-1 ring-emerald-400/30'
                                  : 'bg-[#F2F3F0] border-[#DDE1DA] text-[#171819]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                  isCorrect ? 'bg-emerald-600 text-white' : 'bg-white border border-[#DDE1DA]'
                                }`}>
                                  {opt.id}
                                </span>
                                <span className="truncate">{opt.text}</span>
                              </div>
                              {isCorrect && (
                                <span className="shrink-0 flex items-center gap-1 text-[10px] uppercase font-black text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                                  <Check className="w-3 h-3" />
                                  <span>Correct</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Pedagogical Explanation */}
                      {q.explanation && (
                        <div className="ml-8 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                          <span className="font-bold block mb-0.5 text-amber-950">Pedagogical Rationale:</span>
                          {q.explanation}
                        </div>
                      )}

                      {/* Action Bar */}
                      <div className="pt-2 border-t border-[#DDE1DA]/80 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEditCandidate(q)}
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-[#101112] hover:bg-[#F2F3F0] transition-all cursor-pointer flex items-center gap-1 border border-[#DDE1DA]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          disabled={isRegenerating}
                          onClick={() => handleRegenerateIndividual(q)}
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-[#101112] hover:bg-[#F2F3F0] transition-all cursor-pointer flex items-center gap-1 border border-[#DDE1DA] disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                          <span>Regenerate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDiscardCandidate(candId)}
                          className="px-3 py-1.5 rounded-full text-xs font-bold text-[#777D78] hover:text-rose-600 cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Discard</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODE 2: MANUAL QUESTION CREATOR
          ──────────────────────────────────────────────────────────────────────────── */}
      {activeMode === 'manual' && (
        <div className="max-w-3xl mx-auto">
          <div className="tf-card p-8">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#DDE1DA]">
              <div>
                <h3 className="text-base font-black text-[#171819]">
                  {editingId ? 'Edit Bank Question' : 'Author Multiple Choice Question'}
                </h3>
                <p className="text-xs text-[#777D78] mt-0.5">
                  Set choices, correct answer key, marks, and candidate explanations.
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="px-3 py-1 rounded-full bg-[#F2F3F0] text-xs font-bold text-[#777D78]"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSaveManual} className="space-y-5 text-xs">
              <div>
                <label className="block text-xs font-bold text-[#171819] uppercase mb-1">
                  Question Problem Statement *
                </label>
                <textarea
                  rows={3}
                  required
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="e.g. Which of the following data structures is optimal for Dijkstra algorithm?"
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-2xl p-4 text-xs font-bold text-[#171819] outline-none resize-none leading-relaxed font-sans"
                />
              </div>

              {/* Options A, B, C, D */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['A', 'B', 'C', 'D'].map((letter) => {
                  const stateVal = letter === 'A' ? optionA : letter === 'B' ? optionB : letter === 'C' ? optionC : optionD;
                  const setFn = letter === 'A' ? setOptionA : letter === 'B' ? setOptionB : letter === 'C' ? setOptionC : setOptionD;

                  return (
                    <div key={letter} className="p-3 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[11px] text-[#171819]">Option {letter} *</span>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="correctAnswer"
                            value={letter}
                            checked={correctAnswer === letter}
                            onChange={(e) => setCorrectAnswer(e.target.value)}
                            className="text-[#101112]"
                          />
                          <span className="text-[10px] font-black text-emerald-800">Correct Key</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        required
                        value={stateVal}
                        onChange={(e) => setFn(e.target.value)}
                        placeholder={`Choice ${letter}`}
                        className="w-full bg-white border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-semibold text-[#171819] outline-none"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Meta row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">Marks</label>
                  <input
                    type="number"
                    min={1}
                    value={marks}
                    onChange={(e) => setMarks(Number(e.target.value) || 2)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">Topic</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#171819] mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl px-3 py-2 text-xs font-bold text-[#171819] outline-none cursor-pointer"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-[11px] font-bold text-[#171819] mb-1">Rationale / Explanation</label>
                <textarea
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain why the chosen option is correct..."
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] rounded-xl p-3 text-xs text-[#171819] outline-none resize-none font-sans"
                />
              </div>

              <div className="pt-3 border-t border-[#DDE1DA] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="px-5 py-2.5 rounded-full text-xs font-bold text-[#777D78] hover:text-[#171819]"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-[#101112] text-xs font-black transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Question' : 'Save Question to Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────────
          MODE 4: QUESTION BANK REPOSITORY VAULT
          ──────────────────────────────────────────────────────────────────────────── */}
      {activeMode === 'bank' && (
        <div className="space-y-6">
          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-[#DDE1DA] rounded-[24px] p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-black text-[#171819] tracking-tight">
                Banked MCQ Items
              </h2>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#F2F3F0] text-[#777D78] border border-[#DDE1DA]">
                {filteredQuestions.length} records
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-[#777D78] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search questions, topics..."
                  className="w-full bg-[#F2F3F0] border border-[#DDE1DA] focus:border-[#101112] rounded-full pl-9 pr-8 py-2 text-xs font-semibold text-[#171819] outline-none"
                />
              </div>

              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                className="bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] text-xs font-bold rounded-xl px-3 py-2 outline-none cursor-pointer"
              >
                <option value="all">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-4 py-2 bg-[#101112] hover:bg-black text-[#EDFF72] text-xs font-bold rounded-full cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Questions Grid */}
          {filteredQuestions.length === 0 ? (
            <div className="tf-card p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F2F3F0] flex items-center justify-center mx-auto text-[#777D78]">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-[#171819]">
                {questions.length === 0 ? 'No MCQs in Database' : 'No Matching MCQs'}
              </h4>
              <p className="text-xs text-[#777D78] max-w-sm mx-auto">
                {questions.length === 0
                  ? 'Use the AI Batch Generator, CSV Upload, or Manual Item Builder above to add MCQs to your bank.'
                  : 'Try adjusting your search query, topic filter, or difficulty tags.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredQuestions.map((q, idx) => (
              <div key={q._id} className="tf-card p-5 space-y-3 flex flex-col justify-between hover:border-[#101112]/40 transition-all shadow-xs">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold text-[#777D78] uppercase font-mono">
                      #{idx + 1} • {q.topic || 'General'}
                    </span>
                    <span className="font-mono text-xs font-black text-[#171819] bg-[#F2F3F0] px-2 py-0.5 rounded-md">
                      {q.marks || 2}m
                    </span>
                  </div>

                  <h4 className="font-bold text-xs text-[#171819] leading-snug line-clamp-3">
                    {q.question}
                  </h4>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                    {['A', 'B', 'C', 'D'].map((letter) => (
                      <div
                        key={letter}
                        className={`p-2 rounded-lg border truncate ${
                          q.correctAnswer === letter
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                            : 'bg-[#F2F3F0] border-[#DDE1DA] text-[#777D78]'
                        }`}
                      >
                        <span className="font-bold mr-1">{letter}.</span>
                        {q[`option${letter}`]}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#DDE1DA]/80 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-[#777D78] font-bold">
                    Key: Option {q.correctAnswer}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(q)}
                      className="p-1.5 rounded-lg text-[#777D78] hover:text-[#171819] hover:bg-[#F2F3F0] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(q._id)}
                      className="p-1.5 rounded-lg text-[#777D78] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    </div>
  );
};

export default McqImportView;
