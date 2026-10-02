import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight, Paperclip, Square, Image as ImageIcon } from 'lucide-react';
import { FileAttachment } from '../../types/chat';
import { FilePreview } from './FilePreview';
import { generateUUID } from '../../utils/formatters';

interface PromptDockProps {
  value: string;
  onChange: (val: string) => void;
  onSend: (text: string, attachments: FileAttachment[]) => void;
  isStreaming: boolean;
  onStop: () => void;
  disabled?: boolean;
}

export const PromptDock: React.FC<PromptDockProps> = ({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  disabled = false,
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-resize textarea to fit text up to 180px
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 180);
    el.style.height = `${Math.max(newHeight, 44)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleProcessFiles = useCallback(async (files: FileList | File[]) => {
    const newAttachments: FileAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImg = file.type.startsWith('image/');
      const attachment: FileAttachment = {
        id: generateUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        isImage: isImg,
      };

      if (isImg) {
        // Read data URL
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.readAsDataURL(file);
        });
        attachment.dataUrl = dataUrl;
      } else if (file.size < 500 * 1024) {
        // Read small text file
        try {
          const text = await file.text();
          attachment.textPreview = text.slice(0, 15000);
        } catch {
          // Binary or unsupported
        }
      }

      newAttachments.push(attachment);
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

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
      onStop();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;

    onSend(trimmed, attachments);
    setAttachments([]);
    onChange('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 pt-1">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col rounded-xl bg-[#0E0F12] border transition-all duration-150 ${
          isDragging
            ? 'border-primary shadow-glow bg-[#13151D]'
            : 'border-white/[0.08] hover:border-white/[0.12] focus-within:border-primary/50 focus-within:shadow-glow-sm'
        }`}
      >
        {/* Attachment Previews */}
        <FilePreview attachments={attachments} onRemove={handleRemoveAttachment} />

        {/* Input Area */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          {/* File Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            className="p-2 text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-40 cursor-pointer mb-0.5"
            title="Anexar arquivo ou imagem"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
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
            disabled={disabled}
            placeholder={isStreaming ? 'Charlie está respondendo...' : 'Envie uma mensagem para o Charlie...'}
            className="flex-1 max-h-[180px] min-h-[40px] py-2 bg-transparent text-[#F3F4F6] placeholder-[#6B7280] text-sm resize-none focus:outline-none leading-relaxed font-sans"
          />

          {/* Action Button: Send Arrow [ → ] or Stop Square [ ■ ] */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 flex items-center justify-center transition-all duration-150 cursor-pointer mb-1"
              title="Interromper geração"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || !canSend}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 mb-1 ${
                canSend
                  ? 'bg-primary text-white hover:bg-primary-hover shadow-glow-sm cursor-pointer active:scale-95'
                  : 'bg-white/[0.04] text-[#6B7280] cursor-not-allowed opacity-50'
              }`}
              title="Enviar mensagem [Enter]"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Footer subtle caption */}
      <div className="flex items-center justify-center mt-2 select-none">
        <span className="text-[10px] tracking-wider text-[#6B7280] font-mono uppercase">
          ENTER PARA ENVIAR • SHIFT+ENTER PARA QUEBRA DE LINHA
        </span>
      </div>
    </div>
  );
};
