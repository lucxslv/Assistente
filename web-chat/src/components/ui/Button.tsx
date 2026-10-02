import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary';

    const variants = {
      primary:
        'bg-primary text-white hover:bg-primary-hover shadow-glow-sm hover:shadow-glow font-medium border border-primary-border',
      secondary:
        'bg-[#171920] hover:bg-[#1E222B] text-[#F3F4F6] border border-white/[0.08] hover:border-white/[0.14]',
      ghost:
        'bg-transparent hover:bg-white/[0.06] text-[#9CA3AF] hover:text-[#F3F4F6] border border-transparent',
      danger:
        'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20',
      outline:
        'bg-transparent hover:bg-white/[0.04] text-[#9CA3AF] hover:text-[#F3F4F6] border border-white/[0.1]',
    };

    const sizes = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5',
      md: 'text-sm px-3.5 py-2 gap-2',
      lg: 'text-base px-5 py-2.5 gap-2.5',
      icon: 'w-9 h-9 p-0',
      'icon-sm': 'w-7 h-7 p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
