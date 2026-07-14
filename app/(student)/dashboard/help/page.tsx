'use client';

import React, { useState } from 'react';
import { Icon } from '@iconify/react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: 'How do I submit my dissertation topic?',
    answer: 'Navigate to the "Submit Topic" page from the sidebar, fill in all the required details (including drug name, dosage form, statement of novelty, methodology details, tools, expected deliverables), and click the "Submit Your Title" button at the bottom of the page.',
  },
  {
    question: 'What is the Research Alignment Score?',
    answer: 'The Research Alignment Score is a real-time check of your dissertation title and fields to ensure key details (such as Drug Name, Dosage Form, and Keywords) are present and properly recognized. It acts as an automated guide to optimize your title structure before review.',
  },
  {
    question: 'How does the similarity check work?',
    answer: 'Our AI model compares your submitted title and details against already approved dissertations in the repository. If a significant overlap (typically above 60%) is found, you will be flagged for review or requested to revise.',
  },
  {
    question: 'Who reviews my submitted dissertation topic?',
    answer: 'Your submission goes through a hierarchical approval process: first reviewed by your assigned Guide, then by the Head of Department (HOD) for final verification.',
  },
  {
    question: 'Can I edit my dissertation topic after submitting?',
    answer: 'Once submitted, a topic is locked for editing. However, if your Guide requests revisions, or if the PG Director or Dean unlocks editing privileges, you will be able to edit and resubmit your topic.',
  },
];

export default function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
            Help & FAQs
          </h1>
          <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center">
            <Icon icon="solar:question-circle-bold" className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-sm text-slate-500" style={authorFont}>
          Find answers to frequently asked questions about the PU-FOP dissertation submission process.
        </p>
      </div>

      {/* Accordion FAQ list */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="transition-all">
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
                >
                  <span className="text-sm font-bold text-slate-800" style={authorFont}>
                    {faq.question}
                  </span>
                  <Icon
                    icon={isOpen ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                    className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'text-[#4361EE]' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 pt-1 text-xs text-slate-500 leading-relaxed border-t border-slate-50 bg-slate-50/20" style={authorFont}>
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact Support Card */}
      <div className="bg-gradient-to-r from-[#4361EE] to-[#3A56D4] rounded-2xl p-6 text-white shadow-lg shadow-[#4361EE]/20 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-bold" style={authorFont}>Still need help?</h3>
          <p className="text-xs text-white/80" style={authorFont}>
            Get in touch with the PU-FOP academic coordination desk for specialized support.
          </p>
        </div>
        <a
          href="mailto:support@paruluniversity.ac.in"
          className="px-5 py-2.5 bg-white text-[#4361EE] text-xs font-bold rounded-xl hover:bg-white/95 transition-all shadow-md"
          style={authorFont}
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}
