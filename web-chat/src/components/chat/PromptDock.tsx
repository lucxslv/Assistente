import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight, Paperclip, Square, AlertCircle, X } from 'lucide-react';
import { FileAttachment } from '../../types/chat';
import { FilePreview } from './FilePreview';
import { generateUUID } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import { hapticFeedback } from '../../utils/haptics';
import { mediaDb } from '../../services/mediaDb';

interface PromptDockProps {
  value: string;
  onChange: (val: string) => void;
  onSend: (text: string, attachments: FileAttachment[]) => void;
  isStreaming: boolean;
  onStop: () => void;
  disabled?: boolean;
  isKeyboardOpen?: boolean;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DOC_SIZE_BYTES = 2 * 1024 * 1024;    // 2 MB
const MAX_ATTACHMENTS = 5;

export const PromptDock: React.FC<PromptDockProps> = ({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  disabled = false,
  isKeyboardOpen = false,
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-resize textarea to fit text up to 5 lines (~140px on mobile, ~180px on desktop)
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const maxHeight = isMobile ? 140 : 180;
    const newHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${Math.max(newHeight, 44)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleProcessFiles = useCallback(
    async (files: FileList | File[]) => {
      setValidationError(null);

      if (attachments.length + files.length > MAX_ATTACHMENTS) {
        setValidationError(`Limite de no máximo ${MAX_ATTACHMENTS} anexos por mensagem.`);
        hapticFeedback.warning();
        return;
      }

      const newAttachments: FileAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImg = file.type.startsWith('image/');

        // Validação estrita de tamanho
        if (isImg && file.size > MAX_IMAGE_SIZE_BYTES) {
          setValidationError(`A imagem "${file.name}" excede o limite máximo de 10 MB.`);
          hapticFeedback.warning();
          continue;
        }

        if (!isImg && file.size > MAX_DOC_SIZE_BYTES) {
          setValidationError(`O arquivo "${file.name}" excede o limite máximo de 2 MB.`);
          hapticFeedback.warning();
          continue;
        }

        const attachmentId = generateUUID();
        const attachment: FileAttachment = {
          id: attachmentId,
          name: file.name,
          size: file.size,
          type: file.type,
          isImage: isImg,
        };

        if (isImg) {
          // Ler DataURL
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string) || '');
            reader.readAsDataURL(file);
          });
          attachment.dataUrl = dataUrl;

          // Salva no cache IndexedDB em segundo plano
          mediaDb.saveMedia(attachmentId, dataUrl, file.type);
        } else {
          // Arquivos de texto ou código
          try {
            const text = await file.text();
            attachment.textPreview = text.slice(0, 15000);
          } catch {
            // Binário não textual
          }
        }

        newAttachments.push(attachment);
      }

      if (newAttachments.length > 0) {
        hapticFeedback.light();
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    },
    [attachments.length]
  );

  // Handle paste events (e.g. pasted screenshots)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleProcessFiles(files);
      }
    },
    [handleProcessFiles]
  );

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFiles(e.dataTransfer.files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (isStreaming) {
      hapticFeedback.warning();
      onStop();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;

    hapticFeedback.light();
    onSend(trimmed, attachments);
    setAttachments([]);
    setValidationError(null);
    onChange('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      textareaRef.current.style.overflowY = 'hidden';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    hapticFeedback.light();
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    mediaDb.deleteMedia(id);
  };

  const canSend = value.trim().length > 0 || attachments.length > 0;

  const handleFocus = () => {
    // Mantém window no topo sem deslocar cabeçalho
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      requestAnimationFrame(() => {
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    }
  };

  return (
    <div
      className={cn(
        'w-full max-w-4xl mx-auto px-2.5 sm:px-4 pt-1 flex-shrink-0 transition-all duration-150',
        isKeyboardOpen
          ? 'pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] sm:pb-3'
          : 'pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:pb-3'
      )}
    >
      {/* Alerta de Validação de Anexo */}
      {validationError && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between animate-slide-up">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{validationError}</span>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="p-1 hover:text-white cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col rounded-2xl sm:rounded-xl bg-[#0E0F12] border transition-all duration-150 ${
          isDragging
            ? 'border-primary shadow-glow bg-[#13151D]'
            : 'border-white/[0.08] hover:border-white/[0.12] focus-within:border-primary/50 focus-within:shadow-glow-sm'
        }`}
      >
        {/* Attachment Previews */}
        <FilePreview attachments={attachments} onRemove={handleRemoveAttachment} />

        {/* Input Area */}
        <div className="flex items-end gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2">
          {/* File Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            className="min-h-[44px] min-w-[44px] p-2.5 text-[#9CA3AF] hover:text-[#F3F4F6] active:bg-white/[0.08] rounded-xl transition-colors disabled:opacity-40 cursor-pointer flex items-center justify-center flex-shrink-0"
            title="Anexar imagem ou arquivo (máx. 10MB)"
            aria-label="Anexar imagem ou arquivo"
          >
            <Paperclip className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,text/*,application/json,.pdf,.py,.js,.ts,.tsx,.jsx,.html,.css,.md"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleProcessFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Auto-expanding Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={handleFocus}
            disabled={disabled}
            placeholder={isStreaming ? 'Charlie está respondendo...' : 'Envie uma mensagem para o Charlie...'}
            className="flex-1 max-h-[140px] sm:max-h-[180px] min-h-[44px] py-2.5 bg-transparent text-[#F3F4F6] placeholder-[#6B7280] text-base sm:text-sm resize-none focus:outline-none leading-relaxed font-sans"
          />

          {/* Action Button: Send Arrow [ → ] or Stop Square [ ■ ] */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 flex items-center justify-center transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95"
              title="Interromper geração"
              aria-label="Interromper geração"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || !canSend}
              className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-all duration-150 flex-shrink-0 ${
                canSend
                  ? 'bg-primary text-white hover:bg-primary-hover active:scale-95 shadow-glow-sm cursor-pointer'
                  : 'bg-white/[0.04] text-[#6B7280] cursor-not-allowed opacity-50'
              }`}
              title="Enviar mensagem [Enter]"
              aria-label="Enviar mensagem"
            >
              <ArrowRight className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Footer subtle caption (Hidden on mobile to save vertical space) */}
      <div className="hidden sm:flex items-center justify-center mt-2 select-none">
        <span className="text-[10px] tracking-wider text-[#6B7280] font-mono uppercase">
          ENTER PARA ENVIAR • SHIFT+ENTER PARA QUEBRA DE LINHA
        </span>
      </div>
    </div>
  );
};
