import React, { useState, useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { hapticFeedback } from '../../utils/haptics';

interface RenameThreadModalProps {
  isOpen: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
}

export const RenameThreadModal: React.FC<RenameThreadModalProps> = ({
  isOpen,
  initialName,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || 'Nova Conversa');
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialName]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      hapticFeedback.light();
      onSave(trimmed);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Renomear conversa"
      description="Escolha um título claro para identificar esta conversa no seu histórico."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da conversa..."
            maxLength={60}
            className="w-full bg-[#181B22] border border-white/[0.1] rounded-xl px-3.5 py-3 text-base sm:text-sm text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all font-sans"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover active:scale-95 transition-all shadow-glow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Salvar Título</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
