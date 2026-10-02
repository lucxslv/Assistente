import React, { useEffect } from 'react';
import { Sparkles, Code, Brain, PenTool, HelpCircle } from 'lucide-react';
import { Message, CharlieAIStatus } from '../../types/chat';
import { MessageItem } from './MessageItem';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ScrollToBottomButton } from './ScrollToBottomButton';

interface MessageFeedProps {
  messages: Message[];
  userName?: string;
  charlieStatus: CharlieAIStatus;
  isStreaming: boolean;
  onSelectPrompt: (prompt: string) => void;
  onRetryMessage?: () => void;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({
  messages,
  userName,
  charlieStatus,
  isStreaming,
  onSelectPrompt,
  onRetryMessage,
}) => {
  const { containerRef, isScrolledUp, unreadCount, scrollToBottom, onNewContent } =
    useAutoScroll<HTMLDivElement>();

  // Follow stream tokens
  useEffect(() => {
    if (messages.length > 0) {
      onNewContent(isStreaming);
    }
  }, [messages, isStreaming, onNewContent]);

  const starterPrompts = [
    {
      icon: Brain,
      title: 'Raciocínio & Planejamento',
      prompt: 'Analise este problema e me ajude a estruturar um plano de ação passo a passo com prós e contras.',
    },
    {
      icon: PenTool,
      title: 'Redação & Refinamento',
      prompt: 'Ajude a revisar e aprimorar a clareza, coesão e tom profissional deste texto.',
    },
    {
      icon: Code,
      title: 'Geração & Revisão de Código',
      prompt: 'Escreva uma função moderna em TypeScript com tratamento defensivo de erros e me explique a lógica.',
    },
    {
      icon: HelpCircle,
      title: 'Análise de Contexto',
      prompt: 'Vou colar um trecho de documento aqui para você sintetizar os pontos principais e implicações.',
    },
  ];

  return (
    <div className="relative flex-1 h-full overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-2 sm:px-4 py-3 sm:py-4 space-y-2 select-text"
      >
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center max-w-xl mx-auto px-3 sm:px-4 py-6 sm:py-8 text-center animate-fade-in">
            {/* Center Logo Icon */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-black border border-white/[0.08] flex items-center justify-center shadow-glow mb-4 sm:mb-6 overflow-hidden p-2">
              <img src="/logo.png" alt="Charlie Logo" className="w-full h-full object-contain" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F3F4F6] mb-1.5 sm:mb-2">
              Charlie Web
            </h2>
            <p className="text-xs sm:text-sm text-[#9CA3AF] max-w-sm mb-6 sm:mb-8 leading-relaxed">
              Ambiente de teste e conversação para raciocínio, redação, análise de contexto e desenvolvimento em tempo real.
            </p>

            {/* Quick Starters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 w-full text-left">
              {starterPrompts.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectPrompt(item.prompt)}
                    className="p-3 sm:p-3.5 rounded-xl bg-[#0E0F12] border border-white/[0.06] hover:border-primary/40 active:border-primary/50 hover:bg-[#13151A] transition-all duration-150 flex items-start gap-2.5 sm:gap-3 group text-left cursor-pointer"
                  >
                    <div className="p-2 rounded-lg bg-white/[0.04] text-primary group-hover:bg-primary-soft transition-colors mt-0.5 flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#F3F4F6] group-hover:text-primary transition-colors">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#6B7280] line-clamp-2 mt-0.5 leading-snug">
                        {item.prompt}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                userName={userName}
                onRetry={msg.role === 'user' ? onRetryMessage : undefined}
              />
            ))}

            {/* Thinking / Working Indicator when status is thinking and no pending assistant message yet */}
            {charlieStatus === 'thinking' && messages[messages.length - 1]?.role === 'user' && (
              <div className="w-full max-w-4xl mx-auto px-4 py-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#13151D] border border-white/[0.08] flex items-center justify-center text-primary shadow-glow-sm animate-pulse">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0E0F12] border border-white/[0.06] text-xs text-[#9CA3AF]">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                  <span className="font-mono text-[11px]">Processando resposta...</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Scroll to Bottom Pill */}
      <ScrollToBottomButton
        isVisible={isScrolledUp}
        unreadCount={unreadCount}
        onClick={() => scrollToBottom(true)}
      />
    </div>
  );
};
