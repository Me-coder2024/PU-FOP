'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import Button from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  totalCount?: number;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  className?: string;
}

export default function Table<T>({
  columns,
  data,
  loading = false,
  totalCount = 0,
  pageSize = 10,
  currentPage = 1,
  onPageChange,
  emptyMessage = 'No data available',
  className,
}: TableProps<T>) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const showPagination = onPageChange && totalPages > 1;

  return (
    <div className={cn('flex flex-col w-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
              {columns.map((col) => (
                <th key={col.key} className={cn('px-6 py-4 font-bold text-xs uppercase tracking-wider text-slate-600', col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500 font-medium">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
                    Loading data...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500 font-medium">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-6 py-4 whitespace-nowrap', col.className)}>
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="text-xs text-slate-600 font-medium">
            Showing <span className="font-bold text-slate-900">{Math.min((currentPage - 1) * pageSize + 1, totalCount)}</span> to{' '}
            <span className="font-bold text-slate-900">{Math.min(currentPage * pageSize, totalCount)}</span> of{' '}
            <span className="font-bold text-slate-900">{totalCount}</span> entries
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage === 1 || loading}
              onClick={() => onPageChange(currentPage - 1)}
              className="p-1 min-w-0 text-slate-600 hover:bg-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              const isCurrent = pageNum === currentPage;
              return (
                <Button
                  key={pageNum}
                  variant={isCurrent ? 'primary' : 'ghost'}
                  size="sm"
                  disabled={loading}
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    'w-8 h-8 p-0 text-xs font-bold rounded-md',
                    isCurrent ? 'bg-[#2563EB] text-white' : 'text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage === totalPages || loading}
              onClick={() => onPageChange(currentPage + 1)}
              className="p-1 min-w-0 text-slate-600 hover:bg-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
