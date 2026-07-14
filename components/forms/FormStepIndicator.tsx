'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';
import { Check } from 'lucide-react';

interface Step {
  label: string;
}

interface FormStepIndicatorProps {
  steps: Step[];
  currentStep: number; // 0-indexed
}

export default function FormStepIndicator({ steps, currentStep }: FormStepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full max-w-3xl mx-auto px-4 py-6">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;

        return (
          <React.Fragment key={idx}>
            {/* Step Node */}
            <div className="flex flex-col items-center relative z-10">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2',
                  isCompleted
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : isActive
                    ? 'bg-primary-500 border-primary-500 text-white ring-4 ring-primary-500/20'
                    : 'bg-white border-slate-200 text-slate-400'
                )}
              >
                {isCompleted ? <Check className="w-4.5 h-4.5" /> : idx + 1}
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider mt-2.5 transition-all text-center max-w-[120px]',
                  isActive ? 'text-primary-500' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {idx < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-4 bg-slate-200 relative -top-3">
                <div
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: idx < currentStep ? '100%' : '0%' }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
