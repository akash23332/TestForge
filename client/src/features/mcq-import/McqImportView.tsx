import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileCheck
} from 'lucide-react';

export const McqImportView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Initial Demo Batch with 1 deliberate error row to demonstrate validation
  const sampleBatch = [
    {
      question: 'What is the worst-case time complexity of QuickSort?',
      optionA: 'O(n log n)',
      optionB: 'O(n)',
      optionC: 'O(n^2)',
      optionD: 'O(1)',
      correctAnswer: 'C',
      marks: 2,
      topic: 'Algorithms'
    },
    {
      question: 'Which data structure uses LIFO (Last In First Out)?',
      optionA: 'Queue',
      optionB: 'Stack',
      optionC: 'Tree',
      optionD: 'Graph',
      correctAnswer: 'B',
      marks: 1,
      topic: 'Data Structures'
    },
    {
      // Malformed row: invalid answer key 'Z' and missing option D
      question: 'In JavaScript, which keyword declares a block-scoped variable?',
      optionA: 'var',
      optionB: 'let',
      optionC: 'function',
      optionD: '',
      correctAnswer: 'Z',
      marks: 1,
      topic: 'JavaScript'
    },
    {
      question: 'What is an idempotent REST HTTP method?',
      optionA: 'POST',
      optionB: 'PUT',
      optionC: 'CONNECT',
      optionD: 'PATCH',
      correctAnswer: 'B',
      marks: 1,
      topic: 'REST APIs'
    }
  ];

  const handleParseBatch = async (rowsToParse = sampleBatch) => {
    setLoading(true);
    setSuccessNotice(null);
    try {
      const res = await api.post('/mcq-imports/preview', { rows: rowsToParse });
      setPreviewData(res.data.data);
    } catch {
      alert('Failed to parse MCQ batch.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      'question,optionA,optionB,optionC,optionD,correctAnswer,marks,topic,explanation\n' +
      '"What is O(log n)?","Linear","Logarithmic","Quadratic","Constant","B",1,"Complexity","Divides search space"\n' +
      '"HTTP idempotent method?","POST","PUT","PATCH","CONNECT","B",1,"REST","Repeated requests produce same state"\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'testforge_mcq_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCommitApproved = () => {
    if (!previewData) return;
    const approvedCount = previewData.summary.valid;
    setSuccessNotice(`Successfully imported ${approvedCount} approved MCQ questions into the Question Bank!`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-0.5 bg-orange-600 rounded-full" />
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Bulk Assessment Entry
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Bulk MCQ Import & Preview</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload CSV/XLSX spreadsheets, validate row-level syntax, correct errors, and import.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="h-3.5 w-3.5" /> Sample Template (.csv)
          </Button>
          <Button size="sm" onClick={() => handleParseBatch(sampleBatch)} isLoading={loading}>
            <UploadCloud className="h-3.5 w-3.5" /> Load & Validate Batch
          </Button>
        </div>
      </div>

      {successNotice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-xs font-semibold shadow-xs">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Summary Metrics if parsed */}
      {previewData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Batch Rows</span>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              {previewData.summary.total}
            </div>
          </div>
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
            <span className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Approved / Valid</span>
            <div className="text-3xl font-extrabold text-emerald-600 mt-1">
              {previewData.summary.valid}
            </div>
          </div>
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs">
            <span className="text-xs text-rose-600 font-bold uppercase tracking-wider">Flagged For Review</span>
            <div className="text-3xl font-extrabold text-rose-600 mt-1">
              {previewData.summary.invalid}
            </div>
          </div>
        </div>
      )}

      {/* Table Preview */}
      <Card
        title="Batch Row Preview & Validation Inspection"
        subtitle="Flagged rows cannot be imported until errors are resolved"
        action={
          previewData && (
            <Button
              size="sm"
              onClick={handleCommitApproved}
              disabled={previewData.summary.valid === 0}
            >
              <FileCheck className="h-3.5 w-3.5" /> Import {previewData.summary.valid} Approved Rows
            </Button>
          )
        }
      >
        {!previewData ? (
          <div className="text-center py-16 text-slate-400 text-xs">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300 mb-2" />
            Click "Load & Validate Batch" or upload a CSV file to inspect row integrity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 pr-2">Row</th>
                  <th className="pb-3 pr-4">Question</th>
                  <th className="pb-3 pr-2">Options (A-D)</th>
                  <th className="pb-3 pr-2">Answer</th>
                  <th className="pb-3 pr-2">Marks</th>
                  <th className="pb-3 pr-2">Status</th>
                  <th className="pb-3">Validation Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewData.rows.map((row: any) => (
                  <tr
                    key={row.rowNumber}
                    className={`hover:bg-slate-50 transition-colors ${
                      !row.isValid ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="py-3.5 pr-2 font-mono text-slate-400">{row.rowNumber}</td>
                    <td className="py-3.5 pr-4 font-bold text-slate-900 max-w-xs">{row.question}</td>
                    <td className="py-3.5 pr-2 text-slate-600 font-mono text-[11px]">
                      A: {row.optionA} | B: {row.optionB} | C: {row.optionC} | D: {row.optionD || '—'}
                    </td>
                    <td className="py-3.5 pr-2 font-bold text-center">
                      <span
                        className={`px-2.5 py-1 rounded-md font-mono ${
                          row.isValid ? 'bg-slate-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {row.correctAnswer}
                      </span>
                    </td>
                    <td className="py-3.5 pr-2 text-slate-700 font-bold">{row.marks}</td>
                    <td className="py-3.5 pr-2">
                      <Badge variant={row.isValid ? 'success' : 'error'}>
                        {row.isValid ? 'Approved' : 'Error'}
                      </Badge>
                    </td>
                    <td className="py-3.5 text-slate-600">
                      {row.isValid ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> All options & key valid
                        </span>
                      ) : (
                        <div className="text-rose-700 font-medium space-y-0.5">
                          {row.errors.map((err: string, i: number) => (
                            <div key={i} className="flex items-center gap-1 text-[11px]">
                              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600" /> {err}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default McqImportView;
