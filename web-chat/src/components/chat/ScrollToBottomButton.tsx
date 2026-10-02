import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  isVisible: boolean;
  unreadCount?: number;
  onClick: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({
  isVisible,
  unreadCount = 0,
  onClick,
}) => {
  if (!isVisible) return null;

  return (
    <div className="absolute bottom-24 right-8 z-20 animate-fade-in">
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A1D24] text-[#F3F4F6] border border-white/[0.12] shadow-card hover:bg-[#222630] hover:border-white/[0.2] transition-all cursor-pointer group"
      >
        <ChevronDown className="w-4 h-4 text-primary group-hover:translate-y-0.5 transition-transform" />
        <span className="text-xs font-medium">Rolar para o final</span>
        {unreadCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-primary text-[10px] font-bold text-white leading-none">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};
