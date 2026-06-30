import React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  variant?: 'dashed' | 'plain';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  variant = 'dashed',
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-4 py-16 px-6 text-center',
      variant === 'dashed' && 'rounded-2xl border-2 border-dashed border-slate-200 bg-white',
      className,
    )}
  >
    {icon && (
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
        {icon}
      </div>
    )}
    <div className="flex flex-col items-center gap-1.5 max-w-sm">
      <p className="font-montserrat font-semibold text-slate-700">{title}</p>
      {description && (
        <p className="text-sm text-slate-400 font-roboto leading-relaxed">{description}</p>
      )}
    </div>
    {action}
  </div>
);

EmptyState.displayName = 'EmptyState';
