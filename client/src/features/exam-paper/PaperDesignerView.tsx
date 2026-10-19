import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  FileCheck2,
  Clock,
  Award,
  Download,
  CheckCircle2,
  BookOpen
} from 'lucide-react';

interface PaperDesignerViewProps {
  questions: any[];
}

export const PaperDesignerView: React.FC<PaperDesignerViewProps> = ({ questions }) => {
  const [title, setTitle] = useState('Data Structures & Algorithms - Mid-Semester Exam');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [totalMarks, setTotalMarks] = useState(50);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(
    questions.map((q) => q._id)
  );
  const [generatedDraft, setGeneratedDraft] = useState<any | null>(null);

  const toggleQuestion = (id: string) => {
    setSelectedQuestions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAssemblePaper = () => {
    const included = questions.filter((q) => selectedQuestions.includes(q._id));
    const draft = {
      title,
      durationMinutes,
      totalMarks,
      assembledAt: new Date().toISOString(),
      questionCount: included.length,
      questions: included.map((q, idx) => ({
        sectionNumber: idx + 1,
        title: q.title,
        difficulty: q.difficulty,
        allocatedMarks: Math.round(totalMarks / (included.length || 1)),
        language: q.language
      }))
    };
    setGeneratedDraft(draft);
  };

  const handleDownloadDraft = () => {
    if (!generatedDraft) return;
    const blob = new Blob([JSON.stringify(generatedDraft, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.replace(/\s+/g, '_').toLowerCase()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Smart Assessment Assembly
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Exam Paper Designer</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure examination parameters, balance difficulty mix, and export standardized test drafts.
          </p>
        </div>

        <Button size="sm" onClick={handleAssemblePaper}>
          <FileCheck2 className="h-3.5 w-3.5" /> Assemble Exam Paper
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration form */}
        <div className="space-y-6 lg:col-span-1">
          <Card title="Exam Parameters" subtitle="Configure duration and marks allocation">
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Examination Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs font-medium focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-orange-600" /> Duration (mins)
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-amber-500" /> Total Marks
                  </label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-700 mb-2">Select Questions from Bank</span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {questions.map((q) => (
                    <label
                      key={q._id}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-orange-300 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedQuestions.includes(q._id)}
                        onChange={() => toggleQuestion(q._id)}
                        className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                      <div className="flex-1 truncate">
                        <div className="font-bold text-slate-800 truncate text-xs">{q.title}</div>
                        <div className="text-[10px] text-slate-500">{q.difficulty} • {q.language}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Assembled Paper Draft */}
        <div className="lg:col-span-2">
          <Card
            title={generatedDraft ? generatedDraft.title : 'Assembled Paper Draft'}
            subtitle={
              generatedDraft
                ? `${generatedDraft.durationMinutes} Minutes • Total ${generatedDraft.totalMarks} Marks • ${generatedDraft.questionCount} Questions`
                : 'Click "Assemble Exam Paper" to preview the structured draft'
            }
            action={
              generatedDraft && (
                <Button size="sm" variant="secondary" onClick={handleDownloadDraft}>
                  <Download className="h-3.5 w-3.5" /> Export JSON Draft
                </Button>
              )
            }
          >
            {!generatedDraft ? (
              <div className="text-center py-20 text-slate-400 text-xs">
                <BookOpen className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                No paper assembled yet. Configure parameters and click Assemble.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2 font-medium shadow-xs">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Exam paper draft is balanced. Each question is automatically allocated balanced marks.
                  </span>
                </div>

                <div className="space-y-3">
                  {generatedDraft.questions.map((item: any) => (
                    <div
                      key={item.sectionNumber}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs border border-orange-200">
                          {item.sectionNumber}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Language: {item.language} • Target: Practical coding examination
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            item.difficulty === 'Easy'
                              ? 'success'
                              : item.difficulty === 'Medium'
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {item.difficulty}
                        </Badge>
                        <span className="text-xs font-mono font-bold text-orange-800 bg-orange-100 px-3 py-1 rounded-lg border border-orange-200">
                          {item.allocatedMarks} Marks
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PaperDesignerView;
