import React from 'react';
import { ChevronDown, ArrowDown } from 'lucide-react';
import { hapticFeedback } from '../../utils/haptics';

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

  const handleClick = () => {
    hapticFeedback.light();
    onClick();
  };

  return (
    <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-6 z-20 animate-fade-in pointer-events-auto">
      <button
        onClick={handleClick}
        className="min-h-[44px] px-3.5 py-2 rounded-full bg-[#151821]/95 backdrop-blur-md text-[#F3F4F6] border border-white/[0.14] shadow-2xl hover:bg-[#1E222D] active:scale-95 transition-all duration-150 flex items-center gap-2 cursor-pointer group"
        aria-label="Rolar para a mensagem mais recente"
      >
        <div className="w-5 h-5 rounded-full bg-primary-soft text-primary flex items-center justify-center flex-shrink-0 group-hover:translate-y-0.5 transition-transform">
          <ArrowDown className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-[#F3F4F6]">
          {unreadCount > 0 ? 'Nova mensagem' : 'Rolar para o final'}
        </span>
        {unreadCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center leading-none shadow-glow-sm">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

