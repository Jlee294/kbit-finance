import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center font-montserrat font-semibold rounded-full whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-slate-100 text-slate-600',
        primary: 'bg-primary-100 text-primary-700',
        success: 'bg-emerald-100 text-emerald-700',
        warning: 'bg-amber-100 text-amber-700',
        danger: 'bg-red-100 text-red-600',
        blue: 'bg-sky-100 text-sky-700',
        purple: 'bg-violet-100 text-violet-700',
        orange: 'bg-orange-100 text-orange-700',
        pink: 'bg-pink-100 text-pink-700',
        teal: 'bg-teal-100 text-teal-700',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge: React.FC<BadgeProps> = ({ className, variant, size, ...props }) => {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
};

Badge.displayName = 'Badge';
export { badgeVariants };
