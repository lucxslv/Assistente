import React, { useState } from "react";
import { AgentEvidenceItem } from "../../types";
import {
  FileCheck,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Lock,
} from "lucide-react";

interface WorkspaceEvidenceProps {
  evidence: AgentEvidenceItem[];
}

export const WorkspaceEvidence: React.FC<WorkspaceEvidenceProps> = ({
  evidence,
}) => {
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    evidence.length > 0 ? evidence[0].id : null
  );
  const [search, setSearch] = useState("");

  const selectedEvidence =
    evidence.find((e) => e.id === selectedEvidenceId) || evidence[0] || null;

  const filteredEvidence = evidence.filter((e) => {
    const matchesSearch =
      !search ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.details && e.details.toLowerCase().includes(search.toLowerCase())) ||
      e.type.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const passedCount = evidence.filter((e) => e.passed).length;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#161618] text-[#F2F3F5]">
      {/* ================= Painel Esquerdo: Auditoria de Evidências ================= */}
      <div className="w-80 border-r border-white/[0.08] bg-[#1E1E20]/60 flex flex-col h-full">
        <div className="p-4 border-b border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold text-[#F3F4F6] uppercase font-mono tracking-wider">
                Auditoria de Evidências
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {passedCount}/{evidence.length} Válidas
            </span>
          </div>

          <div className="text-[11px] text-[#9CA3AF]">
            Diferenciação formal entre <strong>crença do agente</strong> e <strong>prova auditada</strong>.
          </div>

          <div className="pt-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar evidência..."
              className="w-full bg-[#161618] text-xs text-[#F3F4F6] placeholder-zinc-500 rounded-[14px] px-3 py-1.5 border border-white/[0.08] focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {/* Lista de Evidências */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {filteredEvidence.length === 0 ? (
            <div className="text-center py-16 px-4 text-xs text-zinc-500">
              Nenhuma evidência registrada ainda.
            </div>
          ) : (
            filteredEvidence.map((ev) => {
              const isSelected = selectedEvidence?.id === ev.id;
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelectedEvidenceId(ev.id)}
                  className={`w-full text-left p-3.5 flex items-start gap-2.5 transition cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.08] border-l-2 border-slate-300"
                      : "hover:bg-white/[0.02] border-l-2 border-transparent"
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {ev.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono font-medium text-[#F3F4F6] truncate">
                      {ev.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/[0.04] text-[#9CA3AF] border border-white/[0.06]">
                        {ev.type}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ================= Painel Direito: Dossiê Detalhado da Evidência ================= */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#161618]">
        {selectedEvidence ? (
          <div className="flex flex-col h-full">
            {/* Header do Dossiê */}
            <div className="px-6 py-4 border-b border-white/[0.08] bg-[#1E1E20]/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[14px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-mono font-semibold text-zinc-100">
                    {selectedEvidence.title}
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] font-mono mt-0.5">
                    <span>Tipo: {selectedEvidence.type.toUpperCase()}</span>
                    <span>•</span>
                    <span>Auditado em {new Date(selectedEvidence.timestamp).toLocaleString("pt-BR")}</span>
                  </div>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="inline-flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5l10-10"/></svg> Prova Validada</span>
              </span>
            </div>

            {/* Corpo do Dossiê */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-4xl">
              {/* Card de Resumo de Validação */}
              <div className="bg-[#1E1E20] border border-white/[0.08] rounded-[14px] p-5 space-y-3">
                <div className="text-xs font-semibold text-[#F3F4F6] uppercase font-mono tracking-wider flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span>Resumo do Verifier</span>
                </div>
                <p className="text-xs text-[#E5E7EB] leading-relaxed">
                  {selectedEvidence.details || "A verificação foi executada de forma determinística contra o sistema de arquivos local ou código de retorno do processo."}
                </p>
              </div>

              {/* Comando ou Fonte de Execução */}
              {selectedEvidence.command && (
                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-[#9CA3AF] uppercase tracking-wider">
                    Comando de Verificação Executado
                  </span>
                  <pre className="p-3 bg-[#0C0D12] border border-white/[0.08] rounded-[14px] font-mono text-xs text-[#E5E7EB] overflow-x-auto">
                    {selectedEvidence.command}
                  </pre>
                </div>
              )}

              {/* Saída de Teste ou Dados Técnicos */}
              {selectedEvidence.output && (
                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-[#9CA3AF] uppercase tracking-wider">
                    Saída Bruta Capturada
                  </span>
                  <pre className="p-4 bg-[#0C0D12] border border-white/[0.08] rounded-[14px] font-mono text-xs text-[#E5E7EB] overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">
                    {selectedEvidence.output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
            <FileCheck className="w-10 h-10 text-zinc-600 mb-2" />
            <h4 className="text-sm font-medium text-[#9CA3AF]">Nenhuma evidência selecionada</h4>
            <p className="text-xs max-w-sm">
              Cada tarefa concluída pelo Charlie gera uma evidência verificada por código, sistema ou arquivo, eliminando alucinações.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
