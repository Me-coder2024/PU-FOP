import React from 'react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  helperText?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, helperText, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-[#374151] uppercase tracking-wide"
          >
            {label}
            {props.required && <span className="text-[#dc2626] ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-lg border border-[#d1d5db] bg-white px-3.5 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af]',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-[#2272c3]/20 focus:border-[#2272c3]',
              'disabled:bg-[#f3f4f6] disabled:cursor-not-allowed disabled:opacity-60',
              icon && 'pl-10',
              error && 'border-[#dc2626] focus:ring-[#dc2626]/20 focus:border-[#dc2626]',
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs font-medium text-[#dc2626]">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-xs text-[#6b7280]">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
