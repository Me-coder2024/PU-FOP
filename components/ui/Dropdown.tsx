'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label?: string;
  options: (DropdownOption | string)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export default function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  error,
  disabled = false,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options to object format
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={cn('relative w-full text-left font-sans', className)} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between text-left text-slate-900 transition-all focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
          isOpen && 'border-blue-500 ring-1 ring-blue-500',
          error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500'
        )}
      >
        <span className={cn(!value && 'text-slate-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 transition-transform duration-300',
            isOpen && 'rotate-180 text-blue-500'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 z-[100] max-h-60 overflow-y-auto scrollbar-thin">
          {normalizedOptions.map((option) => {
            const isSelected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2.5 text-sm flex items-center justify-between text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors text-left font-medium',
                  isSelected && 'text-blue-600 bg-blue-50 hover:bg-blue-100 font-bold'
                )}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-rose-450 leading-none">
          {error}
        </p>
      )}
    </div>
  );
}
