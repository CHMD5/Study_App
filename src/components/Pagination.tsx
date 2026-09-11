'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './ui';

export type PaginationProps = {
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1 && !totalItems) return null;

  const startItem = pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const endItem = pageSize && totalItems ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <div
      role="navigation"
      aria-label="Pagination Navigation"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400',
        className,
      )}
    >
      <div>
        {totalItems !== undefined && startItem !== null && endItem !== null ? (
          <span>
            Showing <strong className="tnum font-semibold text-slate-900 dark:text-slate-100">{startItem}</strong> to{' '}
            <strong className="tnum font-semibold text-slate-900 dark:text-slate-100">{endItem}</strong> of{' '}
            <strong className="tnum font-semibold text-slate-900 dark:text-slate-100">{totalItems}</strong> items
          </span>
        ) : (
          <span>
            Page <strong className="tnum font-semibold text-slate-900 dark:text-slate-100">{currentPage}</strong> of{' '}
            <strong className="tnum font-semibold text-slate-900 dark:text-slate-100">{Math.max(1, totalPages)}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
          Previous
        </Button>

        <span className="tnum px-2 font-medium text-slate-700 dark:text-slate-300">
          {currentPage} / {Math.max(1, totalPages)}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
