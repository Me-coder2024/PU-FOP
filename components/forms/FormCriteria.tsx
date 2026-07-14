'use client';

import React from 'react';
import Card from '@/components/ui/Card';
import { ShieldCheck, AlertCircle } from 'lucide-react';

export default function FormCriteria() {
  return (
    <Card className="bg-white border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-2 text-slate-900">
        <ShieldCheck className="w-5 h-5 text-primary-500" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">Submission Criteria</h3>
      </div>

      <div className="space-y-3.5 text-xs text-slate-500">
        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-800">Email & Profile:</strong> Registered Parul University Pharmacy email (@paruluniversity.ac.in) required. Ensure profile is updated prior to filing.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-800">Title Originality:</strong> Proposed titles are evaluated against prior dissertation registers. Similarity scores exceeding 60% trigger secondary coordinator evaluation.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-800">Department Parameters:</strong> Form details adjust to selected departments. Complete all mandatory fields including compounds, methods, and expected deliverables.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-800">Ethics Approval:</strong> If animal models are utilized, IAEC approval checklist criteria must be met.
          </p>
        </div>
      </div>

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
        <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800 leading-normal font-medium">
          Once submitted, topics are locked for edits pending supervisor approval. Duplicate title submissions are blocked.
        </p>
      </div>
    </Card>
  );
}
