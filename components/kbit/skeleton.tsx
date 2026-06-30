import React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, width, height, style, ...props }) => (
  <div
    className={cn('animate-pulse rounded-lg bg-slate-200', className)}
    style={{ width, height, ...style }}
    aria-hidden="true"
    {...props}
  />
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number; className?: string }> = ({
  rows = 5,
  cols = 4,
  className,
}) => (
  <div className={cn('w-full rounded-2xl border border-slate-200 overflow-hidden shadow-sm', className)}>
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} height={12} className="flex-1 rounded-md" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, rowIdx) => (
      <div
        key={rowIdx}
        className={cn(
          'px-4 py-3.5 flex gap-4 border-b border-slate-100 last:border-0',
          rowIdx % 2 === 1 && 'bg-slate-50/40',
        )}
      >
        {Array.from({ length: cols }).map((_, colIdx) => (
          <Skeleton
            key={colIdx}
            height={14}
            className={cn('flex-1 rounded-md', colIdx === 0 && 'max-w-[40%]')}
          />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4', className)}>
    <div className="flex items-center gap-3">
      <Skeleton width={40} height={40} className="rounded-xl flex-shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton height={14} className="w-1/2 rounded-md" />
        <Skeleton height={10} className="w-3/4 rounded-md" />
      </div>
    </div>
    <div className="flex flex-col gap-2">
      <Skeleton height={12} className="w-full rounded-md" />
      <Skeleton height={12} className="w-5/6 rounded-md" />
      <Skeleton height={12} className="w-2/3 rounded-md" />
    </div>
  </div>
);

Skeleton.displayName = 'Skeleton';
SkeletonTable.displayName = 'SkeletonTable';
SkeletonCard.displayName = 'SkeletonCard';
