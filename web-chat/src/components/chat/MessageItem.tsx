import React, { useState, useEffect } from 'react';
import { Copy, Check, RotateCcw, AlertTriangle, User as UserIcon } from 'lucide-react';
import { Message, FileAttachment } from '../../types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { formatTimeOrDate } from '../../utils/formatters';
import { hapticFeedback } from '../../utils/haptics';
import { mediaDb } from '../../services/mediaDb';

const AttachmentThumbnail: React.FC<{ att: FileAttachment }> = ({ att }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(att.dataUrl || null);

  useEffect(() => {
    let isCancelled = false;
    if (att.isImage && !att.dataUrl) {
      mediaDb.getMedia(att.id).then((cached) => {
        if (!isCancelled && cached) {
          setDataUrl(cached);
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [att.id, att.isImage, att.dataUrl]);

  if (att.isImage && dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={att.name}
        className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => window.open(dataUrl, '_blank')}
      />
    );
  }

  return <span className="text-primary font-mono text-[11px] px-1">{att.name}</span>;
};

interface MessageItemProps {
  message: Message;
  userName?: string;
  onRetryAssistant?: (message: Message) => void;
  onResendUser?: (message: Message) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  userName = 'Você',
  onRetryAssistant,
  onResendUser,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      hapticFeedback.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={`group w-full max-w-4xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex gap-2.5 sm:gap-3.5 transition-colors ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Assistant Avatar with Charlie Logo */}
      {isAssistant && (
        <div className="w-8 h-8 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden mt-0.5 shadow-glow-sm p-1">
          <img src="/logo.png" alt="Charlie" className="w-full h-full object-contain" />
        </div>
      )}

      {/* Message Body Container */}
      <div
        className={`flex flex-col max-w-[90%] sm:max-w-[78%] ${
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

        {/* Content Box with Mobile-first Typography text-[15px] and relaxed line height */}
        <div
          className={`rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-[15px] sm:text-sm leading-relaxed transition-all ${
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
                  <AttachmentThumbnail att={att} />
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
              {onRetryAssistant && (
                <button
                  onClick={() => {
                    hapticFeedback.light();
                    onRetryAssistant(message);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tentar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action bar (Always visible with subtle opacity on mobile, hover on desktop) */}
        {!message.isStreaming && message.content && (
          <div className="flex items-center gap-1.5 mt-1 px-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center gap-1.5 px-2 py-1 sm:p-1 rounded-lg text-[11px] text-[#6B7280] hover:text-[#D1D5DB] active:text-white hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer"
              title="Copiar mensagem"
              aria-label="Copiar mensagem"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[10px]">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Copiar</span>
                </>
              )}
            </button>
            {isUser && onResendUser && (
              <button
                onClick={() => {
                  hapticFeedback.light();
                  onResendUser(message);
                }}
                className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 flex items-center gap-1.5 px-2 py-1 sm:p-1 rounded-lg text-[11px] text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer"
                title="Editar ou reenviar esta mensagem"
                aria-label="Reenviar mensagem"
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
