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

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_DOC_SIZE_BYTES = 2 * 1024 * 1024;
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

  useEffect(() => {
    const handleFocusShortcut = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('charlie:focus-prompt', handleFocusShortcut);
    return () => window.removeEventListener('charlie:focus-prompt', handleFocusShortcut);
  }, []);

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
        const lowerName = file.name.toLowerCase();
        const isBinaryPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
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
          type: file.type || 'application/octet-stream',
          isImage: isImg,
        };
        if (isImg) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve((e.target?.result as string) || '');
            reader.readAsDataURL(file);
          });
          attachment.dataUrl = dataUrl;
          mediaDb.saveMedia(attachmentId, dataUrl, file.type);
        } else if (!isBinaryPdf) {
          try {
            const rawText = await file.text();
            const sanitized = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, 15000);
            if (sanitized.trim()) {
              attachment.textPreview = sanitized;
              attachment.extractedText = sanitized;
              attachment.has_extracted_text = true;
            }
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
        'w-full max-w-4xl mx-auto px-3 sm:px-6 pt-2 flex-shrink-0',
        isKeyboardOpen
          ? 'pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:pb-3'
          : 'pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] sm:pb-4'
      )}
    >
      {validationError && (
        <div className="mb-2 px-3 py-2 rounded-[12px] bg-amber-500/10 border border-amber-500/15 text-xs text-amber-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {validationError}
          </span>
          <button onClick={() => setValidationError(null)} className="p-1 hover:text-white cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col rounded-[14px] border bg-[#1E1E20] transition-colors ${
          isDragging ? 'border-white/[0.14] bg-[#222224]' : 'border-white/[0.07] focus-within:border-white/[0.12]'
        }`}
      >
        <FilePreview attachments={attachments} onRemove={handleRemoveAttachment} />

        <div className="flex items-end gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white/60 hover:text-white/90 transition-colors disabled:opacity-40 cursor-pointer"
            title="Anexar imagem ou arquivo (máx. 10MB)"
            aria-label="Anexar imagem ou arquivo"
          >
            <Paperclip className="w-[18px] h-[18px] shrink-0" />
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
            className="flex-1 max-h-[140px] sm:max-h-[180px] min-h-[44px] py-[10px] bg-transparent text-white placeholder:text-white/50 text-[15px] sm:text-sm resize-none focus:outline-none leading-relaxed"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="w-9 h-9 shrink-0 rounded-full bg-white text-black flex items-center justify-center cursor-pointer"
              title="Interromper geração"
              aria-label="Interromper geração"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || !canSend}
              className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                canSend ? 'bg-white text-black hover:bg-white/90 cursor-pointer' : 'bg-white/[0.08] text-white/30 cursor-not-allowed'
              }`}
              title="Enviar mensagem [Enter]"
              aria-label="Enviar mensagem"
            >
              <ArrowRight className="w-[18px] h-[18px] shrink-0" />
            </button>
          )}
        </div>
      </div>

      <div className="hidden sm:flex items-center justify-center mt-2 select-none">
        <span className="text-[10px] tracking-[0.14em] text-white/25 font-mono uppercase">
          ENTER PARA ENVIAR • SHIFT+ENTER PARA QUEBRA DE LINHA
        </span>
      </div>
    </div>
  );
};
