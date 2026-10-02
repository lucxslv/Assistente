import React from 'react';
import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { FileAttachment } from '../../types/chat';
import { formatFileSize } from '../../utils/formatters';

interface FilePreviewProps {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2 pb-1 bg-[#111317]/80 border-t border-white/[0.06]">
      {attachments.map((file) => (
        <div
          key={file.id}
          className="relative group flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md bg-[#181B22] border border-white/[0.08] text-xs text-[#E5E7EB] max-w-[240px]"
        >
          {file.isImage && file.dataUrl ? (
            <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-black/40 border border-white/[0.06]">
              <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded flex items-center justify-center bg-white/[0.04] text-primary flex-shrink-0">
              {file.isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-xs font-medium text-[#F3F4F6]">{file.name}</span>
            <span className="text-[10px] text-[#9CA3AF]">{formatFileSize(file.size)}</span>
          </div>

          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="p-1 rounded text-[#9CA3AF] hover:text-white hover:bg-white/[0.1] transition-colors ml-1"
            title="Remover anexo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
