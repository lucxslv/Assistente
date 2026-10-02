import React from "react";
import { AgentSubagent } from "../../types";
import {
  Cpu,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCode,
  Wrench,
} from "lucide-react";

interface WorkspaceSubagentsProps {
  subagents: AgentSubagent[];
}

export const WorkspaceSubagents: React.FC<WorkspaceSubagentsProps> = ({
  subagents,
}) => {
  const renderStatusBadge = (status: AgentSubagent["status"]) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
            Em execução
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Concluído
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            Falha
          </span>
        );
      case "waiting":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Clock className="w-3 h-3 text-zinc-400" />
            Aguardando
          </span>
        );
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-[#090A0F] text-[#F2F3F5] space-y-6">
      {/* ================= Header da Seção ================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-slate-400" />
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-mono">
              Equipe de Subagentes Especializados
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Visualização observável e em tempo real dos agentes atuando sob a orquestração do Charlie Runtime.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-[#12151C] px-3 py-1.5 rounded-lg border border-white/[0.08]">
          <span>{subagents.length} Agentes no Workspace</span>
        </div>
      </div>

      {/* ================= Grid de Subagentes ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subagents.map((agent) => (
          <div
            key={agent.id}
            className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5 space-y-4 hover:border-white/[0.16] transition shadow-sm"
          >
            {/* Topo do Card */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-300 font-mono text-xs font-bold">
                  {agent.role[0]}
                </div>
                <div>
                  <h3 className="text-xs font-mono font-semibold text-zinc-100">
                    {agent.role}
                  </h3>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    ID: {agent.id.slice(-6)}
                  </div>
                </div>
              </div>

              <div>{renderStatusBadge(agent.status)}</div>
            </div>

            {/* Objetivo do Agente */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                Objetivo do Subagente
              </span>
              <p className="text-xs text-zinc-300 leading-relaxed bg-[#090A0F]/60 p-2.5 rounded-lg border border-white/[0.04]">
                {agent.goal}
              </p>
            </div>

            {/* Tarefa Atual / Resultado */}
            {agent.currentTask && (
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">
                  Atividade Atual
                </span>
                <div className="text-xs text-zinc-200 font-mono bg-white/[0.02] p-2 rounded border border-white/[0.04] truncate">
                  {agent.currentTask}
                </div>
              </div>
            )}

            {agent.result && (
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-emerald-400/80 block">
                  Resultado Produzido
                </span>
                <div className="text-xs text-emerald-300 font-mono bg-emerald-950/20 p-2 rounded border border-emerald-500/20">
                  {agent.result}
                </div>
              </div>
            )}

            {/* Ferramentas e Artefatos Utilizados */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/[0.06] text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                <span className="font-mono text-[11px]">
                  {agent.toolsUsed.length > 0 ? agent.toolsUsed.join(", ") : "Nenhuma ferramenta"}
                </span>
              </div>

              {agent.artifacts && agent.artifacts.length > 0 && (
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <FileCode className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="font-mono text-[11px]">
                    {agent.artifacts.length} artefatos
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
