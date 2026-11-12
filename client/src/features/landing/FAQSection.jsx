import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      q: 'What is TestForge?',
      a: 'TestForge is an intelligent assessment platform designed to simplify the complete examination lifecycle: from creating question papers and coding assessments to evaluating submissions and tracking student performance in one place.'
    },
    {
      q: 'Who can use TestForge?',
      a: 'Teachers, students and authorized administrators. Educators create and schedule tests, while students attempt them via unique access codes or their personal student dashboard.'
    },
    {
      q: 'Can students attempt coding questions?',
      a: 'Yes, through the integrated coding assessment environment featuring a syntax-highlighted editor, runtime sandbox, and automated evaluation against visible and hidden test cases.'
    },
    {
      q: 'How can students join a test?',
      a: 'Students can click "Join a Test" and enter their test access code. Once verified by the backend, they proceed to instructions and the examination workspace.'
    },
    {
      q: 'Can students use TestForge without an account?',
      a: 'Yes, when an educator enables guest attempts for a specific assessment. However, accessing personal test history, progress analytics, and saved profile data requires signing into the Student Portal.'
    },
    {
      q: 'Can teachers generate questions using AI?',
      a: 'Yes, through the AI Question Generator. Faculty can specify topics, target difficulty levels, and question types (Coding or MCQ) to synthesize rigorous items instantly.'
    }
  ];

  return (
    <section id="faq" className="py-20 sm:py-28 max-w-4xl mx-auto">
      <div className="text-center max-w-xl mx-auto mb-14">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold tracking-widest text-[#777D78] uppercase">
          <span className="w-5 h-[2px] bg-[#171819]" />
          <span>Frequently Asked Questions</span>
          <span className="w-5 h-[2px] bg-[#171819]" />
        </div>

        <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#171819] leading-[1.08]">
          Got questions?{' '}
          <span className="relative inline-block px-1.5 py-0.5 rounded-lg bg-[#EDFF72] text-[#111]">
            Answers
          </span>{' '}
          below.
        </h2>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className={`rounded-2xl border transition-all ${
                isOpen
                  ? 'border-[#171819] bg-white shadow-md'
                  : 'border-[#DDE1DA] bg-white hover:border-[#171819]/40'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full py-5 px-6 sm:px-7 flex items-center justify-between gap-4 text-left font-bold text-base sm:text-lg text-[#171819] cursor-pointer"
                aria-expanded={isOpen}
              >
                <span>{faq.q}</span>
                <span
                  className={`size-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isOpen ? 'bg-[#EDFF72] text-[#111]' : 'bg-[#F2F3F0] text-[#777D78]'
                  }`}
                >
                  {isOpen ? <Minus className="size-4 stroke-[2.5]" /> : <Plus className="size-4 stroke-[2.5]" />}
                </span>
              </button>

              {isOpen && (
                <div className="px-6 sm:px-7 pb-6 text-sm sm:text-base text-[#666B66] leading-relaxed border-t border-[#F2F3F0] pt-4 animate-in fade-in duration-200">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
