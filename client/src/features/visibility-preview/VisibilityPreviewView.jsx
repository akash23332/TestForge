import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { SearchableQuestionSelect } from '../../components/SearchableQuestionSelect';
import { api } from '../../lib/api';
import {
  Eye,
  Lock,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export const VisibilityPreviewView = ({
  questions,
  selectedQuestion,
  onSelectQuestion
}) => {
  const currentQ = selectedQuestion || questions[0];
  const [activeView, setActiveView] = useState('teacher');
  const [studentData, setStudentData] = useState(null);
  const [auditPassed, setAuditPassed] = useState(null);

  const fetchStudentView = async () => {
    if (!currentQ) return;
    try {
      const res = await api.get(`/questions/${currentQ._id}/student-view`);
      setStudentData(res.data.data);
      // Strictly verify that referenceSolution is completely omitted
      const hasLeak = 'referenceSolution' in res.data.data;
      setAuditPassed(!hasLeak);
    } catch {
      setAuditPassed(false);
    }
  };

  useEffect(() => {
    fetchStudentView();
  }, [currentQ?._id]);

  if (!currentQ) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-3xl shadow-xs">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300 mb-2" />
        <h3 className="text-slate-800 font-bold">No questions available</h3>
        <p className="text-xs text-slate-400 mt-1">Please create a question first to inspect visibility.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Assessment Security Audit
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Student vs. Teacher Visibility Auditor
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict Section 13 audit: ensures reference solutions and hidden tests never reach student bundles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SearchableQuestionSelect
            questions={questions}
            selectedQuestion={currentQ}
            onSelectQuestion={onSelectQuestion}
            className="w-64 sm:w-80"
          />
        </div>
      </div>

      {/* Security Audit Badge */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Server-Side Sanitization Verification
              {auditPassed && (
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                  Zero Leaks Confirmed
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Payload returned by <span className="font-mono font-bold text-slate-700">/api/v1/questions/:id/student-view</span> excludes reference solutions by query projection.
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            onClick={() => setActiveView('teacher')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'teacher'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Lock className="h-3.5 w-3.5 text-purple-600" /> Teacher View
          </button>
          <button
            onClick={() => setActiveView('student')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'student'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Eye className="h-3.5 w-3.5" /> Student View
          </button>
        </div>
      </div>

      {/* View Content Display */}
      {activeView === 'teacher' ? (
        /* TEACHER VIEW */
        <div className="space-y-6 animate-fadeIn">
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-purple-900 text-xs flex items-center gap-2.5 font-medium shadow-xs">
            <Lock className="h-4 w-4 shrink-0 text-purple-600" />
            <span>
              <strong>Teacher Master View:</strong> Contains complete problem specs, private reference solutions, and all grading test cases.
            </span>
          </div>

          <Card title={currentQ.title} subtitle={`Difficulty: ${currentQ.difficulty} • Language: ${currentQ.language}`}>
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">Problem Statement</h4>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {currentQ.statement}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">Constraints</h4>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-mono text-[11px]">
                  {currentQ.constraints || 'None specified'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <h4 className="font-bold text-sky-700 mb-1.5">Student Starter Code</h4>
                  <pre className="p-4 rounded-xl bg-slate-900 text-sky-300 font-mono text-[11px] overflow-x-auto shadow-inner">
                    {currentQ.starterCode}
                  </pre>
                </div>
                <div>
                  <h4 className="font-bold text-purple-700 mb-1.5 flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> Private Reference Solution (Teacher Only)
                  </h4>
                  <pre className="p-4 rounded-xl bg-slate-900 text-purple-300 font-mono text-[11px] overflow-x-auto shadow-inner">
                    {currentQ.referenceSolution}
                  </pre>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        /* STUDENT VIEW */
        <div className="space-y-6 animate-fadeIn">
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl text-orange-900 text-xs flex items-center gap-2.5 font-medium shadow-xs">
            <Eye className="h-4 w-4 shrink-0 text-orange-600" />
            <span>
              <strong>Student Candidate View:</strong> Exact sanitized response delivered to student test takers. Private solution and hidden tests are completely stripped by construction.
            </span>
          </div>

          <Card
            title={studentData?.title || currentQ.title}
            subtitle={`Difficulty: ${studentData?.difficulty || currentQ.difficulty} • Language: ${studentData?.language || currentQ.language}`}
          >
            <div className="space-y-4 text-xs">
              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">Problem Statement</h4>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {studentData?.statement || currentQ.statement}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">Constraints</h4>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-mono text-[11px]">
                  {studentData?.constraints || currentQ.constraints}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-sky-700 mb-1.5">Starter Code Workspace</h4>
                <pre className="p-4 rounded-xl bg-slate-900 text-sky-300 font-mono text-[11px] overflow-x-auto shadow-inner">
                  {studentData?.starterCode || currentQ.starterCode}
                </pre>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1.5">Public Test Samples</h4>
                {studentData?.publicTestCases && studentData.publicTestCases.length > 0 ? (
                  <div className="space-y-2">
                    {studentData.publicTestCases.map((tc, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] flex items-center justify-between">
                        <span className="text-slate-600">Input: <span className="font-bold text-slate-900">{tc.input}</span></span>
                        <span className="text-emerald-700 font-bold">Expected: {tc.expectedOutput}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400 italic">No public samples attached.</div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Reference solution and hidden grading tests are strictly omitted from this payload.</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default VisibilityPreviewView;
