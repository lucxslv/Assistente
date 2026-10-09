import React, { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, Loader2, Brain } from "lucide-react";

interface ThinkingBlockProps {
  thought: string;
  isStreaming?: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ thought, isStreaming = false }) => {
  const [isOpen, setIsOpen] = useState(isStreaming);

  if (!thought && !isStreaming) return null;

  return (
    <div className="my-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[#0C0D11] overflow-hidden text-left transition-all">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[11px] font-mono select-none transition-colors cursor-pointer text-[var(--text-secondary)]"
      >
        <div className="flex items-center gap-1.5">
          {isStreaming ? (
            <Loader2 className="w-3 h-3 text-[var(--accent)] animate-spin" />
          ) : (
            <Brain className="w-3 h-3 text-indigo-400" />
          )}
          <span className="font-medium text-[var(--text-primary)]">
            {isStreaming ? "Charlie raciocinando..." : "Processo de raciocínio"}
          </span>
          {!isStreaming && thought && (
            <span className="text-[10px] text-[var(--text-muted)]">
              ({thought.length} caracteres)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          <span className="text-[10px]">{isOpen ? "Ocultar" : "Ver"}</span>
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 text-[12px] font-mono leading-relaxed text-zinc-400 bg-[#090A0E] border-t border-[var(--border)]/60 max-h-[300px] overflow-y-auto whitespace-pre-wrap select-text">
          {thought || (
            <span className="italic text-zinc-500 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[var(--accent)]" />
              Analisando premissas e arquitetando resposta...
            </span>
          )}
        </div>
      )}
    </div>
  );
};
