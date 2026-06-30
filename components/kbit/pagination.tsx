import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Select } from './select';

const PAGE_SIZE_OPTIONS = [
  { value: '20', label: '20 / trang' },
  { value: '50', label: '50 / trang' },
  { value: '100', label: '100 / trang' },
];

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  rangeStart: number;
  rangeEnd: number;
  onPrev: () => void;
  onNext: () => void;
  onPageSizeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  perPage,
  rangeStart,
  rangeEnd,
  onPrev,
  onNext,
  onPageSizeChange,
  className,
}) => (
  <div className={cn('flex flex-wrap items-center justify-between gap-4', className)}>
    <p className="text-sm text-slate-500 font-roboto">
      Showing <span className="font-medium text-slate-700">{rangeStart}–{rangeEnd}</span>{' '}
      of <span className="font-medium text-slate-700">{totalItems}</span>
    </p>
    <div className="flex items-center gap-2">
      <div className="w-36">
        <Select options={PAGE_SIZE_OPTIONS} value={String(perPage)} onChange={onPageSizeChange} />
      </div>
      <Button variant="outline" size="sm" onClick={onPrev} disabled={currentPage <= 1} aria-label="Previous">
        <ChevronLeft className="h-4 w-4" /> Prev
      </Button>
      <span className="text-sm font-roboto text-slate-600 px-2 min-w-[80px] text-center">
        {currentPage} / {totalPages}
      </span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={currentPage >= totalPages} aria-label="Next">
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

Pagination.displayName = 'Pagination';
