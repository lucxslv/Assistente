import React, { useEffect } from 'react';
import { Sparkles, Code, Brain, PenTool, HelpCircle } from 'lucide-react';
import { Message, CharlieAIStatus } from '../../types/chat';
import { MessageItem } from './MessageItem';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { hapticFeedback } from '../../utils/haptics';

interface MessageFeedProps {
  messages: Message[];
  userName?: string;
  userAvatarUrl?: string;
  charlieStatus: CharlieAIStatus;
  isStreaming: boolean;
  onSelectPrompt: (prompt: string) => void;
  onRetryAssistant?: (msg: Message) => void;
  onRegenerateAssistant?: (msg: Message) => void;
  onEditUser?: (msg: Message, newContent: string) => void;
  onFeedback?: (msg: Message, rating: 1 | -1) => void;
  onResendUser?: (msg: Message) => void;
}

export const MessageFeed: React.FC<MessageFeedProps> = ({
  messages,
  userName,
  userAvatarUrl,
  charlieStatus,
  isStreaming,
  onSelectPrompt,
  onRetryAssistant,
  onRegenerateAssistant,
  onEditUser,
  onFeedback,
  onResendUser,
}) => {
  const { containerRef, isScrolledUp, unreadCount, scrollToBottom, onNewContent } =
    useAutoScroll<HTMLDivElement>();

  useEffect(() => {
    if (messages.length > 0) onNewContent(isStreaming);
  }, [messages, isStreaming, onNewContent]);

  const starterPrompts = [
    { icon: Brain, title: 'Raciocínio & Planejamento', prompt: 'Analise este problema e me ajude a estruturar um plano de ação passo a passo com prós e contras.' },
    { icon: PenTool, title: 'Redação & Refinamento', prompt: 'Ajude a revisar e aprimorar a clareza, coesão e tom profissional deste texto.' },
    { icon: Code, title: 'Geração & Revisão de Código', prompt: 'Escreva uma função moderna em TypeScript com tratamento defensivo de erros e me explique a lógica.' },
    { icon: HelpCircle, title: 'Análise de Contexto', prompt: 'Vou colar um trecho de documento aqui para você sintetizar os pontos principais e implicações.' },
  ];

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col bg-[#161618]">
      <div
        ref={containerRef}
        role="log"
        aria-live="polite"
        aria-label="Histórico de mensagens"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6 space-y-3 select-text"
      >
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center max-w-xl mx-auto px-3 sm:px-4 py-8 text-center animate-fade-in">
            <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center mb-4 shrink-0 overflow-hidden p-1.5">
              <img src="/logo-dark.png" alt="Charlie" className="w-full h-full object-contain object-center" width="48" height="48" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-white mb-1.5">Charlie</h2>
            <p className="text-xs text-white/40 max-w-sm mb-6 leading-relaxed">
              Escolha um atalho abaixo ou digite sua mensagem para começar.
            </p>
            <div className="w-full text-left">
              <p className="text-[11px] tracking-[0.14em] text-white/25 uppercase font-semibold mb-3 text-center">
                Sugestões para começar
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {starterPrompts.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        hapticFeedback.light();
                        onSelectPrompt(item.prompt);
                      }}
                      className="p-4 rounded-[14px] bg-[#1E1E20] border border-white/[0.06] hover:border-white/[0.10] hover:bg-[#222224] transition-colors flex items-start gap-3 text-left cursor-pointer"
                    >
                      <span className="w-8 h-8 rounded-lg bg-white/[0.06] text-white/70 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 stroke-[1.7]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-white">{item.title}</span>
                        <span className="block text-[12px] text-white/40 line-clamp-2 mt-0.5 leading-snug">{item.prompt}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                userName={userName}
                userAvatarUrl={userAvatarUrl}
                onRetryAssistant={onRetryAssistant}
                onRegenerateAssistant={onRegenerateAssistant}
                onEditUser={onEditUser}
                onFeedback={onFeedback}
                onResendUser={onResendUser}
              />
            ))}
            {charlieStatus === 'thinking' && messages[messages.length - 1]?.role === 'user' && (
              <div className="w-full max-w-4xl mx-auto px-2 py-2 flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-black" />
                </span>
                <span className="px-3 py-2 rounded-full bg-[#1E1E20] border border-white/[0.06] text-xs text-white/50 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                  Processando resposta…
                </span>
              </div>
            )}
          </>
        )}
      </div>
      <ScrollToBottomButton isVisible={isScrolledUp} unreadCount={unreadCount} onClick={() => scrollToBottom(true)} />
    </div>
  );
};
