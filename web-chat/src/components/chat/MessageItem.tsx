import React, { useState } from 'react';
import { Copy, Check, RotateCcw, AlertTriangle, Sparkles, User as UserIcon } from 'lucide-react';
import { Message } from '../../types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { formatTimeOrDate } from '../../utils/formatters';

interface MessageItemProps {
  message: Message;
  userName?: string;
  onRetry?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, userName = 'Você', onRetry }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={`group w-full max-w-4xl mx-auto px-4 py-3 flex gap-3.5 transition-colors ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Assistant Avatar */}
      {isAssistant && (
        <div className="w-8 h-8 rounded-xl bg-[#13151D] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-primary mt-0.5 shadow-glow-sm">
          <Sparkles className="w-4 h-4" />
        </div>
      )}

      {/* Message Body Container */}
      <div
        className={`flex flex-col max-w-[85%] sm:max-w-[78%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Header: Name & Time */}
        <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-[#6B7280]">
          <span className="font-medium text-[#9CA3AF]">
            {isUser ? userName : 'Charlie'}
          </span>
          <span>•</span>
          <span>{formatTimeOrDate(message.createdAt)}</span>
        </div>

        {/* Content Box */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all ${
            isUser
              ? 'bg-[#181B22] text-[#F3F4F6] border border-white/[0.08] rounded-tr-sm'
              : 'bg-[#0E0F12] text-[#E5E7EB] border border-white/[0.06] rounded-tl-sm w-full shadow-sm'
          }`}
        >
          {/* User Attachments Preview */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-white/[0.08]">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 p-1.5 rounded-lg bg-black/30 border border-white/[0.06] text-xs"
                >
                  {att.isImage && att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(att.dataUrl, '_blank')}
                    />
                  ) : (
                    <span className="text-primary font-mono text-[11px] px-1">{att.name}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Render Markdown or Plain Text */}
          {message.content ? (
            <div>
              <MarkdownRenderer content={message.content} />
              {/* Streaming Cursor */}
              {message.isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle" />
              )}
            </div>
          ) : message.isStreaming ? (
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF] py-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Pensando...</span>
            </div>
          ) : null}

          {/* Error notice */}
          {message.error && (
            <div className="mt-2.5 flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{message.error}</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tentar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action bar on hover */}
        {!message.isStreaming && message.content && (
          <div className="flex items-center gap-1 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 p-1 rounded text-[11px] text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04] transition-colors cursor-pointer"
              title="Copiar mensagem"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 text-[10px]">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="text-[10px]">Copiar</span>
                </>
              )}
            </button>
            {isUser && onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 p-1 rounded text-[11px] text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04] transition-colors cursor-pointer"
                title="Reenviar esta mensagem"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="text-[10px]">Reenviar</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-[#1A1D24] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-[#9CA3AF] mt-0.5">
          <UserIcon className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};
