import React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  dot = false,
  className,
}) => {
  const variants = {
    default: 'bg-white/[0.06] text-[#9CA3AF] border-white/[0.08]',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-primary-soft text-primary border-primary-border',
    outline: 'bg-transparent text-[#9CA3AF] border-white/[0.12]',
  };

  const dotColors = {
    default: 'bg-[#9CA3AF]',
    success: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse',
    warning: 'bg-amber-400',
    danger: 'bg-red-400',
    info: 'bg-primary shadow-[0_0_8px_rgba(139,124,255,0.6)]',
    outline: 'bg-[#9CA3AF]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border select-none',
        variants[variant],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
