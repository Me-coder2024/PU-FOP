'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  description: string;
  duration?: number;
}

interface ToastContextType {
  toast: (message: Omit<ToastMessage, 'id'>) => void;
  success: (description: string, title?: string) => void;
  error: (description: string, title?: string) => void;
  info: (description: string, title?: string) => void;
  warning: (description: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type, title, description, duration = 4000 }: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, description, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((description: string, title?: string) => toast({ type: 'success', title, description }), [toast]);
  const error = useCallback((description: string, title?: string) => toast({ type: 'error', title, description }), [toast]);
  const info = useCallback((description: string, title?: string) => toast({ type: 'info', title, description }), [toast]);
  const warning = useCallback((description: string, title?: string) => toast({ type: 'warning', title, description }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-primary-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  };

  const bgStyles = {
    success: 'bg-slate-900 border-emerald-500/20 text-emerald-100',
    error: 'bg-slate-900 border-rose-500/20 text-rose-100',
    info: 'bg-slate-900 border-primary-500/20 text-primary-100',
    warning: 'bg-slate-900 border-amber-500/20 text-amber-100',
  };

  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md pointer-events-auto transform transition-all duration-300 animate-in slide-in-from-top-4 sm:slide-in-from-right-4',
        bgStyles[toast.type]
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        {toast.title && <h5 className="font-semibold text-xs text-white uppercase tracking-wider mb-0.5">{toast.title}</h5>}
        <p className="text-xs text-slate-300 leading-normal">{toast.description}</p>
      </div>
      <button
        onClick={onClose}
        className="text-slate-400 hover:text-white hover:bg-white/5 rounded-lg p-1 transition-colors self-start shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
