import React, { useState } from "react";
import { AgentTerminal } from "../../types";
import {
  Terminal as TerminalIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";

interface WorkspaceTerminalsProps {
  terminals: AgentTerminal[];
}

export const WorkspaceTerminals: React.FC<WorkspaceTerminalsProps> = ({
  terminals,
}) => {
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(
    terminals.length > 0 ? terminals[terminals.length - 1].id : null
  );
  const [copied, setCopied] = useState(false);

  const selectedTerminal =
    terminals.find((t) => t.id === selectedTerminalId) ||
    terminals[terminals.length - 1] ||
    null;

  const handleCopy = () => {
    if (!selectedTerminal) return;
    navigator.clipboard.writeText(selectedTerminal.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatus = (terminal: AgentTerminal) => {
    if (terminal.status === "running") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
          Executando
        </span>
      );
    }
    if (terminal.exitCode === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Exit 0
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-rose-400">
        <AlertCircle className="w-3 h-3 text-rose-400" />
        Exit {terminal.exitCode ?? 1}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5]">
      {/* ================= Barra de Abas de Terminais ================= */}
      <div className="px-4 border-b border-white/[0.08] bg-[#12151C]/70 flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center space-x-1 py-2">
          {terminals.length === 0 ? (
            <span className="text-xs text-zinc-500 py-1 font-mono">
              Nenhum processo de terminal aberto
            </span>
          ) : (
            terminals.map((t) => {
              const isSelected = selectedTerminal?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTerminalId(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-2 cursor-pointer border ${
                    isSelected
                      ? "bg-[#0C0D12] text-zinc-100 border-white/[0.16] shadow-sm"
                      : "bg-white/[0.02] text-zinc-400 border-transparent hover:bg-white/[0.05]"
                  }`}
                >
                  <TerminalIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="truncate max-w-[140px]">{t.name}</span>
                  {renderStatus(t)}
                </button>
              );
            })
          )}
        </div>

        {selectedTerminal && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.06] transition"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span className="text-[11px]">{copied ? "Copiado" : "Copiar"}</span>
            </button>
          </div>
        )}
      </div>

      {/* ================= Janela de Console do Terminal ================= */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 bg-[#090A0F]">
        {selectedTerminal ? (
          <div className="flex-1 flex flex-col rounded-xl border border-white/[0.08] bg-[#0C0D12] overflow-hidden shadow-md">
            {/* Header da Janela de Terminal */}
            <div className="px-4 py-2.5 border-b border-white/[0.06] bg-[#12151C]/50 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-medium text-zinc-300">{selectedTerminal.name}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 text-[11px] truncate max-w-md">
                  {selectedTerminal.command}
                </span>
              </div>

              <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                {selectedTerminal.exitCode !== undefined && (
                  <span
                    className={
                      selectedTerminal.exitCode === 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"
                    }
                  >
                    Exit Code: {selectedTerminal.exitCode}
                  </span>
                )}
                <span>{new Date(selectedTerminal.startedAt).toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Prompt e Saída */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-200 select-text space-y-3">
              {/* Linha de comando simulada estilo PowerShell */}
              <div className="text-slate-300 flex items-center gap-2">
                <span className="text-slate-500">PS C:\Projects\Charlie&gt;</span>
                <span className="font-semibold">{selectedTerminal.command}</span>
              </div>

              {/* Saída do processo */}
              <pre className="whitespace-pre-wrap font-mono text-zinc-300/90 text-xs">
                {selectedTerminal.output || "(Nenhuma saída de texto registrada)"}
              </pre>

              {/* Indicador de término */}
              {selectedTerminal.status !== "running" && (
                <div className="pt-2 text-[11px] text-zinc-500 border-t border-white/[0.04] flex items-center justify-between">
                  <span>Processo encerrado com código {selectedTerminal.exitCode ?? 0}</span>
                  {selectedTerminal.completedAt && (
                    <span>Concluído em {new Date(selectedTerminal.completedAt).toLocaleTimeString()}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
            <TerminalIcon className="w-10 h-10 text-zinc-600 mb-2" />
            <h4 className="text-sm font-medium text-zinc-400">Nenhum terminal ativo</h4>
            <p className="text-xs max-w-sm">
              Quando o Charlie executar comandos locais no PowerShell ou CMD, as saídas e códigos de retorno aparecerão aqui em tempo real.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
