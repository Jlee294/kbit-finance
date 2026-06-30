import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
  className,
}) => (
  <div className={cn('flex items-start justify-between gap-4 flex-wrap', className)}>
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-primary">{icon}</span>
        </div>
      )}
      <div className="min-w-0">
        <h1 className="font-montserrat font-bold text-xl text-slate-900 truncate">{title}</h1>
        {subtitle && (
          <p className="text-sm text-slate-500 font-roboto mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
    {actions && (
      <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
    )}
  </div>
);

PageHeader.displayName = 'PageHeader';
