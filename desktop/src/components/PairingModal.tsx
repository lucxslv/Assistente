import React from "react";
import { X, Smartphone } from "lucide-react";
import { PairingPanel } from "./PairingPanel";

export interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PairingModal: React.FC<PairingModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-2xl bg-[var(--surface,#14171F)] border border-[var(--border,#212631)] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Parear Dispositivo Mobile
              </h2>
              <p className="text-[11px] text-zinc-400">
                Conecte seu celular Android ou iOS para controle remoto seguro
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com o Painel de Pareamento */}
        <div className="p-6 overflow-y-auto bg-zinc-950/40">
          <PairingPanel onClose={onClose} isModal={true} />
        </div>
      </div>
    </div>
  );
};
