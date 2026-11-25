import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  BookOpen
} from 'lucide-react';

export const StudentMyTestsPage = ({
  availableExams = [],
  myAttempts = [],
  isLoading = false,
  onStartExam,
  onViewResult
}) => {
  const [selectedTab, setSelectedTab] = useState('ALL'); // 'ALL' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('ALL');

  // Compute combined test items from real backend availableExams and myAttempts
  const allTestItems = useMemo(() => {
    const items = [];
    const attemptByExamId = {};
    const attemptByExamCode = {};

    myAttempts.forEach((a) => {
      const eId = a.examId?._id || a.examId;
      if (eId) attemptByExamId[eId.toString()] = a;
      if (a.examCode) attemptByExamCode[a.examCode.toUpperCase()] = a;
    });

    const now = Date.now();

    // 1. Process available/assigned exams
    availableExams.forEach((exam) => {
      const eIdStr = (exam._id || '').toString();
      const codeStr = (exam.examCode || '').toUpperCase();
      const matchedAttempt = attemptByExamId[eIdStr] || attemptByExamCode[codeStr];

      let status = 'ACTIVE'; // 'ACTIVE' | 'IN_PROGRESS' | 'COMPLETED' | 'UPCOMING' | 'EXPIRED'

      if (matchedAttempt) {
        if (matchedAttempt.status === 'SUBMITTED' || matchedAttempt.status === 'submitted') {
          status = 'COMPLETED';
        } else if (matchedAttempt.status === 'IN_PROGRESS') {
          if (matchedAttempt.expiresAt && now > new Date(matchedAttempt.expiresAt).getTime()) {
            status = 'COMPLETED';
          } else {
            status = 'IN_PROGRESS';
          }
        }
      } else {
        if (exam.status === 'COMPLETED' || (exam.schedule?.endTime && now > new Date(exam.schedule.endTime).getTime())) {
          status = 'EXPIRED';
        } else if (exam.schedule?.startTime && now < new Date(exam.schedule.startTime).getTime()) {
          status = 'UPCOMING';
        } else {
          status = 'ACTIVE';
        }
      }

      items.push({
        id: exam._id || exam.examCode,
        examCode: exam.examCode,
        title: exam.title,
        teacher: exam.createdBy?.name || 'Instructor',
        subject: exam.sections?.[0]?.name || 'Computer Science',
        questions: (exam.sections || []).reduce((acc, s) => acc + (s.questions?.length || 0), 0) || exam.questionCount || 10,
        marks: exam.totalMarks || 100,
        duration: `${exam.durationMinutes || 60} mins`,
        deadline: exam.schedule?.endTime ? new Date(exam.schedule.endTime).toLocaleDateString() : 'Open',
        status,
        attempt: matchedAttempt || null
      });
    });

    // 2. Add completed attempts not already in availableExams
    myAttempts.forEach((a) => {
      const eId = (a.examId?._id || a.examId || '').toString();
      const code = (a.examCode || '').toUpperCase();
      const alreadyAdded = items.some((it) => it.id === eId || (code && it.examCode === code));

      if (!alreadyAdded) {
        items.push({
          id: a._id,
          examCode: a.examCode || 'EXAM',
          title: a.examId?.title || 'Academic Assessment',
          teacher: a.examId?.createdBy?.name || 'Faculty',
          subject: a.examId?.sections?.[0]?.name || 'Assessment',
          questions: a.answers?.length || 10,
          marks: a.maxScore || 100,
          duration: `${a.examId?.durationMinutes || 60} mins`,
          deadline: a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : 'Submitted',
          status: 'COMPLETED',
          attempt: a
        });
      }
    });

    return items;
  }, [availableExams, myAttempts]);

  // Unique subjects for filter select
  const subjects = useMemo(() => {
    const set = new Set();
    allTestItems.forEach((t) => {
      if (t.subject) set.add(t.subject);
    });
    return Array.from(set);
  }, [allTestItems]);

  // Filtered items based on tabs, search, and subject
  const filteredTests = useMemo(() => {
    return allTestItems.filter((test) => {
      // Tab filter
      if (selectedTab === 'UPCOMING' && test.status !== 'UPCOMING') return false;
      if (selectedTab === 'ACTIVE' && test.status !== 'ACTIVE' && test.status !== 'IN_PROGRESS') return false;
      if (selectedTab === 'COMPLETED' && test.status !== 'COMPLETED') return false;

      // Subject filter
      if (selectedSubject !== 'ALL' && test.subject !== selectedSubject) return false;

      // Search query (title or teacher)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesTitle = test.title.toLowerCase().includes(q);
        const matchesTeacher = test.teacher.toLowerCase().includes(q);
        const matchesCode = test.examCode.toLowerCase().includes(q);
        if (!matchesTitle && !matchesTeacher && !matchesCode) return false;
      }

      return true;
    });
  }, [allTestItems, selectedTab, selectedSubject, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── CONTROLS ROW: SEGMENTED TABS + SEARCH + SUBJECT FILTER ── */}
      <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Segmented Tabs (All, Upcoming, Active, Completed) */}
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#F2F3F0] border border-[#DDE1DA] overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'UPCOMING', label: 'Upcoming' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'COMPLETED', label: 'Completed' }
          ].map((tab) => {
            const isActive = selectedTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTab(tab.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#191A1D] text-[#EDFF72] font-bold shadow-xs'
                    : 'text-[#777D78] hover:text-[#171819]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Subject Filter Select */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#777D78]" />
            <input
              type="text"
              placeholder="Search title, teacher, code…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-full border border-[#DDE1DA] bg-[#F2F3F0] text-xs text-[#171819] placeholder:text-[#777D78] focus:border-[#171819] focus:bg-white focus:outline-none transition-colors"
            />
          </div>

          {/* Subject Filter Select */}
          {subjects.length > 0 && (
            <div className="shrink-0">
              <select
                aria-label="Filter tests by subject"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="h-10 px-3.5 rounded-full border border-[#DDE1DA] bg-[#F2F3F0] text-xs font-semibold text-[#171819] focus:border-[#171819] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── CARD GRID (min 320px responsive columns) ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-pulse" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 rounded-[24px] border border-[#DDE1DA] bg-white p-6" />
          ))}
        </div>
      ) : filteredTests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredTests.map((test) => {
            // Status Chip Styling:
            // Active = lime, In progress = dark with lime text, Expired = white with grey border, others neutral
            let chipStyle = 'bg-[#F2F3F0] text-[#777D78] border-transparent';
            let chipLabel = test.status;

            if (test.status === 'ACTIVE') {
              chipStyle = 'bg-[#EDFF72] text-[#191A1D] border-transparent font-bold';
              chipLabel = 'Active';
            } else if (test.status === 'IN_PROGRESS') {
              chipStyle = 'bg-[#191A1D] text-[#EDFF72] border-transparent font-bold';
              chipLabel = 'In progress';
            } else if (test.status === 'EXPIRED') {
              chipStyle = 'bg-white text-[#777D78] border-[#DDE1DA]';
              chipLabel = 'Expired';
            } else if (test.status === 'COMPLETED') {
              chipStyle = 'bg-[#191A1D] text-white border-transparent';
              chipLabel = 'Completed';
            } else if (test.status === 'UPCOMING') {
              chipStyle = 'bg-[#E9ECE7] text-[#171819] border-transparent';
              chipLabel = 'Upcoming';
            }

            return (
              <div
                key={test.id}
                className="rounded-[24px] border border-[#DDE1DA] bg-white p-6 shadow-xs hover:-translate-y-0.5 transition-transform flex flex-col justify-between min-h-[240px]"
              >
                <div>
                  {/* Top Bar: Code & Status Chip */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#F2F3F0] text-[#171819]">
                      {test.examCode}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${chipStyle}`}>
                      {chipLabel}
                    </span>
                  </div>

                  {/* Title & Teacher */}
                  <h3 className="text-base font-bold text-[#171819] leading-snug line-clamp-2">
                    {test.title}
                  </h3>
                  <p className="text-xs text-[#777D78] mt-1">
                    {test.teacher} · {test.subject}
                  </p>
                </div>

                {/* Info Tiles */}
                <div className="pt-4 mt-4 border-t border-[#DDE1DA]">
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-[#777D78] mb-4">
                    <div>
                      <span className="block font-medium text-[#A0A59F]">Questions</span>
                      <span className="font-mono font-bold text-[#171819]">{test.questions}</span>
                    </div>
                    <div>
                      <span className="block font-medium text-[#A0A59F]">Marks</span>
                      <span className="font-mono font-bold text-[#171819]">{test.marks}</span>
                    </div>
                    <div>
                      <span className="block font-medium text-[#A0A59F]">Duration</span>
                      <span className="font-mono font-bold text-[#171819]">{test.duration}</span>
                    </div>
                  </div>

                  {/* Single Action Button Per Status */}
                  {test.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() => onStartExam(test.examCode)}
                      className="w-full h-10 rounded-full bg-[#EDFF72] hover:bg-[#d8ee4b] text-[#191A1D] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <span>Start test</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}

                  {test.status === 'IN_PROGRESS' && (
                    <button
                      type="button"
                      onClick={() => onStartExam(test.examCode)}
                      className="w-full h-10 rounded-full bg-[#191A1D] hover:bg-black text-[#EDFF72] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <span>Continue test</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}

                  {test.status === 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => {
                        const attId = test.attempt?._id || test.id;
                        if (onViewResult && attId) onViewResult(attId);
                      }}
                      className="w-full h-10 rounded-full bg-white hover:bg-[#F2F3F0] border border-[#DDE1DA] text-[#171819] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      <span>View result</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}

                  {test.status === 'UPCOMING' && (
                    <button
                      type="button"
                      disabled
                      className="w-full h-10 rounded-full bg-[#F2F3F0] text-[#777D78] text-xs font-bold opacity-60 cursor-not-allowed flex items-center justify-center"
                    >
                      <span>Opens soon</span>
                    </button>
                  )}

                  {test.status === 'EXPIRED' && (
                    <button
                      type="button"
                      disabled
                      className="w-full h-10 rounded-full bg-[#F2F3F0] text-[#777D78] text-xs font-bold opacity-60 cursor-not-allowed flex items-center justify-center"
                    >
                      <span>Unavailable</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="rounded-[24px] border border-[#DDE1DA] bg-white p-16 text-center space-y-3">
          <div className="size-12 rounded-2xl bg-[#F2F3F0] text-[#777D78] mx-auto flex items-center justify-center">
            <BookOpen className="size-6" />
          </div>
          <h4 className="text-base font-bold text-[#171819]">No tests found</h4>
          <p className="text-xs text-[#777D78] max-w-sm mx-auto">
            No tests found. Try a different tab, subject or search term.
          </p>
        </div>
      )}
    </div>
  );
};

export default StudentMyTestsPage;
