import React from 'react';
import { cn } from '@/lib/utils';

export const Table: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div className={cn('w-full overflow-x-auto rounded-2xl border border-slate-200 shadow-sm', className)} {...props}>
    <table className="w-full text-sm font-roboto border-collapse">{children}</table>
  </div>
);

export const Thead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <thead className={cn('bg-slate-50 border-b border-slate-200', className)} {...props}>
    {children}
  </thead>
);

export const Tbody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...props }) => (
  <tbody className={cn('[&>tr]:border-b [&>tr]:border-slate-100 [&>tr:last-child]:border-0', className)} {...props}>
    {children}
  </tbody>
);

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ className, children, ...props }) => (
  <tr className={cn('hover:bg-primary-50/60 transition-colors', className)} {...props}>
    {children}
  </tr>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, children, ...props }) => (
  <th
    className={cn(
      'px-4 py-3 text-left font-montserrat font-semibold text-xs text-slate-500 uppercase tracking-wider whitespace-nowrap',
      className,
    )}
    {...props}
  >
    {children}
  </th>
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, children, ...props }) => (
  <td className={cn('px-4 py-3.5 text-slate-700 whitespace-nowrap', className)} {...props}>
    {children}
  </td>
);

Table.displayName = 'Table';
Thead.displayName = 'Thead';
Tbody.displayName = 'Tbody';
Tr.displayName = 'Tr';
Th.displayName = 'Th';
Td.displayName = 'Td';
