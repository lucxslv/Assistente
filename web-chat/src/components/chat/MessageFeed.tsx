import React, { useEffect } from 'react';
import { Sparkles, Terminal, Code, Cpu, Database } from 'lucide-react';
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
      icon: Terminal,
      title: 'Diagnóstico de Sistema',
      prompt: 'Execute um diagnóstico completo dos serviços ativos e verifique a conectividade.',
    },
    {
      icon: Code,
      title: 'Desenvolvimento Fullstack',
      prompt: 'Explique a arquitetura moderna de microsserviços reativos com FastAPI e WebSockets.',
    },
    {
      icon: Database,
      title: 'Modelagem & SQL',
      prompt: 'Como desenhar um esquema de banco de dados no PostgreSQL com índices otimizados para busca de texto?',
    },
    {
      icon: Cpu,
      title: 'Inteligência Artificial',
      prompt: 'Quais as melhores práticas para streaming de tokens em tempo real usando Server-Sent Events?',
    },
  ];

  return (
    <div className="relative flex-1 h-full overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-2 py-4 space-y-2 select-text"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto px-4 py-8 text-center animate-fade-in">
            {/* Center Logo Icon */}
            <div className="w-16 h-16 rounded-2xl bg-[#13151D] border border-white/[0.08] flex items-center justify-center text-primary shadow-glow mb-6">
              <Sparkles className="w-8 h-8" />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-[#F3F4F6] mb-2">
              Charlie Web Chat
            </h2>
            <p className="text-sm text-[#9CA3AF] max-w-md mb-8 leading-relaxed">
              Assistente de inteligência autônomo com suporte a streaming de alta performance, execução de ferramentas e interface técnica clean.
            </p>

            {/* Quick Starters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
              {starterPrompts.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectPrompt(item.prompt)}
                    className="p-3.5 rounded-xl bg-[#0E0F12] border border-white/[0.06] hover:border-primary/40 hover:bg-[#13151A] hover:shadow-glow-sm transition-all duration-150 flex items-start gap-3 group text-left cursor-pointer"
                  >
                    <div className="p-2 rounded-lg bg-white/[0.04] text-primary group-hover:bg-primary-soft transition-colors mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
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
