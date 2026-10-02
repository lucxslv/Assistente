import React, { useState } from "react";
import { AgentChange, ChangeReviewStatus } from "../../types";
import {
  GitCommit,
  Check,
  RotateCcw,
} from "lucide-react";

interface WorkspaceChangesProps {
  changes: AgentChange[];
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
}

export const WorkspaceChanges: React.FC<WorkspaceChangesProps> = ({
  changes,
  onReviewChange,
}) => {
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(
    changes.length > 0 ? changes[0].id : null
  );

  const selectedChange = changes.find((c) => c.id === selectedChangeId) || changes[0] || null;

  const modifiedCount = changes.filter((c) => c.type === "M").length;
  const addedCount = changes.filter((c) => c.type === "A").length;
  const deletedCount = changes.filter((c) => c.type === "D").length;

  const renderTypeBadge = (type: "M" | "A" | "D") => {
    switch (type) {
      case "A":
        return (
          <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            A
          </span>
        );
      case "D":
        return (
          <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            D
          </span>
        );
      case "M":
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            M
          </span>
        );
    }
  };

  const renderStatusBadge = (status: ChangeReviewStatus) => {
    switch (status) {
      case "approved":
      case "applied":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Aprovado
          </span>
        );
      case "reverted":
      case "rejected":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Revertido
          </span>
        );
      case "pending_review":
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Pendente
          </span>
        );
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5]">
      {/* ================= Painel Esquerdo: Lista de Arquivos Alterados (Change Set) ================= */}
      <div className="w-80 border-r border-white/[0.08] bg-[#12151C]/60 flex flex-col h-full">
        {/* Cabeçalho do Change Set */}
        <div className="p-4 border-b border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-semibold text-zinc-200 uppercase font-mono tracking-wider">
                Conjunto de Mudanças
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.08]">
              {changes.length} arquivos
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
            <span>{modifiedCount} modificados</span>
            <span>•</span>
            <span>{addedCount} adicionados</span>
            <span>•</span>
            <span>{deletedCount} deletados</span>
          </div>
        </div>

        {/* Lista de Arquivos */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {changes.length === 0 ? (
            <div className="text-center py-16 px-4 text-xs text-zinc-500">
              Nenhuma alteração registrada nesta sessão.
            </div>
          ) : (
            changes.map((chg) => {
              const isSelected = selectedChange?.id === chg.id;
              return (
                <button
                  key={chg.id}
                  type="button"
                  onClick={() => setSelectedChangeId(chg.id)}
                  className={`w-full text-left p-3.5 flex items-start gap-2.5 transition cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.08] border-l-2 border-slate-300"
                      : "hover:bg-white/[0.02] border-l-2 border-transparent"
                  }`}
                >
                  <div className="mt-0.5">{renderTypeBadge(chg.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono text-zinc-200 truncate">
                      {chg.path}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      {renderStatusBadge(chg.status)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ================= Painel Direito: Visualizador Unificado de Diff ================= */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#090A0F]">
        {selectedChange ? (
          <>
            {/* Header do Diff */}
            <div className="px-6 py-3.5 border-b border-white/[0.08] bg-[#12151C]/40 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {renderTypeBadge(selectedChange.type)}
                <div>
                  <h3 className="text-xs font-mono font-semibold text-zinc-100 truncate">
                    {selectedChange.path}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {renderStatusBadge(selectedChange.status)}
                    {selectedChange.reviewedAt && (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Revisado em {new Date(selectedChange.reviewedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Botões de Decisão (Permission Engine) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onReviewChange?.(selectedChange.id, "accept")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Aprovar Alteração</span>
                </button>

                <button
                  type="button"
                  onClick={() => onReviewChange?.(selectedChange.id, "revert")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reverter</span>
                </button>
              </div>
            </div>

            {/* Visualizador de Diff Linha a Linha */}
            <div className="flex-1 overflow-y-auto p-6 font-mono text-xs select-text">
              <div className="max-w-5xl mx-auto rounded-xl border border-white/[0.08] bg-[#0C0D12] overflow-hidden shadow-sm">
                <div className="px-4 py-2 border-b border-white/[0.06] bg-white/[0.02] text-zinc-400 flex items-center justify-between text-[11px]">
                  <span>Diff Unificado</span>
                  <span>Codificação UTF-8</span>
                </div>

                <div className="p-4 space-y-0.5 overflow-x-auto">
                  {selectedChange.diff ? (
                    selectedChange.diff.split("\n").map((line, idx) => {
                      const isAddition = line.startsWith("+");
                      const isDeletion = line.startsWith("-");
                      const isHeader = line.startsWith("@@");

                      let bgClass = "hover:bg-white/[0.02]";
                      let textClass = "text-zinc-300";

                      if (isAddition) {
                        bgClass = "bg-emerald-950/25 hover:bg-emerald-950/40 text-emerald-300";
                        textClass = "text-emerald-300";
                      } else if (isDeletion) {
                        bgClass = "bg-rose-950/25 hover:bg-rose-950/40 text-rose-300";
                        textClass = "text-rose-300";
                      } else if (isHeader) {
                        bgClass = "bg-white/[0.04] text-slate-400 font-semibold";
                        textClass = "text-slate-400";
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex items-start px-2 py-0.5 rounded leading-relaxed ${bgClass}`}
                        >
                          <span className="w-8 flex-shrink-0 text-zinc-600 select-none text-right pr-3 text-[10px]">
                            {idx + 1}
                          </span>
                          <span className={`flex-1 whitespace-pre font-mono ${textClass}`}>
                            {line}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-zinc-500 py-8 text-center font-sans text-xs">
                      {selectedChange.newContent ? (
                        <pre className="text-left font-mono text-zinc-300 leading-relaxed">
                          {selectedChange.newContent}
                        </pre>
                      ) : (
                        "Nenhuma diferença detectada."
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
            <GitCommit className="w-10 h-10 text-zinc-600 mb-2" />
            <h4 className="text-sm font-medium text-zinc-400">Nenhuma alteração selecionada</h4>
            <p className="text-xs max-w-sm">
              Quando o agente editar ou criar arquivos, você poderá revisar linha a linha com poder de aceitar ou reverter com segurança.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
