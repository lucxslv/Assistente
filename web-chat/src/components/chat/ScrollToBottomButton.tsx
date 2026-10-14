import React from 'react';
import { ArrowDown } from 'lucide-react';
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
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 animate-fade-in pointer-events-auto">
      <button
        onClick={handleClick}
        className="h-9 px-3.5 rounded-full bg-[#1E1E20]/95 backdrop-blur-md text-white border border-white/[0.08] hover:border-white/[0.14] hover:bg-[#26262A] shadow-card active:scale-[0.98] transition-all duration-150 flex items-center gap-2 cursor-pointer group"
        aria-label="Rolar para a mensagem mais recente"
      >
        <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center shrink-0 group-hover:translate-y-0.5 transition-transform">
          <ArrowDown className="w-3 h-3 stroke-[2.5]" />
        </div>
        <span className="text-[12px] font-medium text-white/90 group-hover:text-white transition-colors">
          {unreadCount > 0 ? 'Nova mensagem' : 'Rolar para o final'}
        </span>
        {unreadCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

