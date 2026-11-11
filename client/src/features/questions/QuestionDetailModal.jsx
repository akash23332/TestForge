import React, { useState } from 'react';
import {
  X,
  Layers,
  Activity,
  Pencil,
  Eye,
  CheckCircle2,
  Code2,
  Copy,
  Check,
  Tag,
  Clock,
  Sparkles
} from 'lucide-react';

export const QuestionDetailModal = ({
  question,
  onClose,
  onSelectQuestion,
  onEditQuestion,
  onNavigate
}) => {
  const [copiedSection, setCopiedSection] = useState(null);
  const [activeTab, setActiveTab] = useState('statement'); // 'statement' | 'code' | 'examples'

  if (!question) return null;

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const getDifficultyBadge = (diff) => {
    switch (diff) {
      case 'Easy':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Medium':
        return 'bg-[#EDFF72] text-[#191A1D] border-[#DEEF65]';
      case 'Hard':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#191A1D]/60 backdrop-blur-xs animate-fadeIn select-none">
      <div className="bg-[#FFFFFF] rounded-[32px] border border-[#DDE1DA] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-[#DDE1DA] bg-[#F2F3F0] flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-xs ${getDifficultyBadge(
                  question.difficulty
                )}`}
              >
                {question.difficulty || 'Medium'}
              </span>

              <span className="text-[11px] font-mono font-bold uppercase px-2.5 py-0.5 rounded-full bg-white border border-[#DDE1DA] text-[#171819] shadow-xs">
                {question.language || 'javascript'}
              </span>

              <span className="text-[11px] font-semibold text-[#777D78] flex items-center gap-1 ml-auto sm:ml-0">
                <Clock className="w-3.5 h-3.5" />
                {question.createdAt ? new Date(question.createdAt).toLocaleDateString() : 'Active'}
              </span>
            </div>

            <h3 className="text-xl font-extrabold text-[#171819] tracking-tight leading-snug">
              {question.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-[#DDE1DA] flex items-center justify-center text-[#777D78] hover:text-[#171819] hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#DDE1DA] bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('statement')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'statement'
                ? 'border-[#191A1D] text-[#171819]'
                : 'border-transparent text-[#777D78] hover:text-[#171819]'
            }`}
          >
            Problem Statement
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('examples')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'examples'
                ? 'border-[#191A1D] text-[#171819]'
                : 'border-transparent text-[#777D78] hover:text-[#171819]'
            }`}
          >
            Examples & Constraints ({question.examples?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'code'
                ? 'border-[#191A1D] text-[#171819]'
                : 'border-transparent text-[#777D78] hover:text-[#171819]'
            }`}
          >
            Reference Solution
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'statement' && (
            <div className="space-y-4">
              <div className="bg-[#F2F3F0] p-4 rounded-2xl border border-[#DDE1DA]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#777D78] mb-2">
                  Description
                </h4>
                <p className="text-xs sm:text-sm text-[#171819] whitespace-pre-line leading-relaxed font-normal">
                  {question.statement}
                </p>
              </div>

              {question.constraints && (
                <div className="p-4 rounded-2xl bg-white border border-[#DDE1DA]">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#777D78] mb-1.5">
                    Constraints
                  </h4>
                  <pre className="text-xs font-mono text-[#171819] whitespace-pre-line bg-[#F2F3F0] p-2.5 rounded-xl border border-[#DDE1DA]">
                    {question.constraints}
                  </pre>
                </div>
              )}

              {question.tags && question.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#777D78] mb-2">
                    Topic Tags
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {question.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-semibold bg-[#F2F3F0] text-[#171819] px-2.5 py-1 rounded-full border border-[#DDE1DA]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'examples' && (
            <div className="space-y-3">
              {question.examples && question.examples.length > 0 ? (
                question.examples.map((ex, i) => (
                  <div key={i} className="p-4 rounded-2xl bg-[#F2F3F0] border border-[#DDE1DA] space-y-2">
                    <span className="text-xs font-bold text-[#171819]">Example {i + 1}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                      <div className="p-2.5 rounded-xl bg-white border border-[#DDE1DA]">
                        <span className="text-[10px] uppercase font-bold text-[#777D78] block">Input:</span>
                        <code className="text-[#171819]">{ex.input}</code>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-[#DDE1DA]">
                        <span className="text-[10px] uppercase font-bold text-[#777D78] block">Output:</span>
                        <code className="text-[#171819]">{ex.output}</code>
                      </div>
                    </div>
                    {ex.explanation && (
                      <p className="text-[11px] text-[#777D78] italic pt-1">
                        Explanation: {ex.explanation}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-[#777D78] bg-[#F2F3F0] rounded-2xl">
                  No explicit examples configured for this question.
                </div>
              )}
            </div>
          )}

          {activeTab === 'code' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#171819]">
                  {question.language?.toUpperCase() || 'JAVASCRIPT'} Reference Implementation
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(question.referenceSolution || question.starterCode || '', 'code')
                  }
                  className="px-2.5 py-1 rounded-full bg-[#F2F3F0] hover:bg-[#E4E8E2] text-xs font-bold text-[#171819] flex items-center gap-1 border border-[#DDE1DA]"
                >
                  {copiedSection === 'code' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-[#777D78]" /> Copy Code
                    </>
                  )}
                </button>
              </div>

              <pre className="p-4 rounded-2xl bg-[#191A1D] text-[#EDFF72] text-xs font-mono overflow-x-auto max-h-72 border border-[#2D2F34] leading-relaxed">
                <code>
                  {question.referenceSolution || question.starterCode || '// No code uploaded for this question yet.'}
                </code>
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer Actions: Exact TestForge Workflows */}
        <div className="p-4 px-6 border-t border-[#DDE1DA] bg-[#F2F3F0] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectQuestion(question);
                onClose();
                onNavigate('tests');
              }}
              className="px-3.5 py-2 rounded-full bg-white hover:bg-slate-100 text-[#171819] border border-[#DDE1DA] text-xs font-bold flex items-center gap-1.5 shadow-xs transition-transform active:scale-95 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-[#777D78]" />
              <span>Test Studio</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectQuestion(question);
                onClose();
                onNavigate('mutation');
              }}
              className="px-3.5 py-2 rounded-full bg-[#EDFF72] hover:bg-[#E2F560] text-[#191A1D] border border-[#DEEF65] text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-transform active:scale-95 cursor-pointer"
            >
              <Activity className="w-4 h-4 text-[#191A1D]" />
              <span>Mutation Lab</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onEditQuestion(question);
                onClose();
              }}
              className="px-3.5 py-2 rounded-full bg-[#191A1D] text-white hover:bg-[#2A2C31] text-xs font-bold flex items-center gap-1.5 shadow-xs transition-transform active:scale-95 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#EDFF72]" />
              <span>Edit Question</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionDetailModal;
