import React, { useState } from "react";
import { AgentSession, RiskLevel } from "../../types";
import {
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ChevronDown,
  ChevronRight,
  GitFork,
  Shield,
  FileCheck,
} from "lucide-react";

interface WorkspaceTimelineProps {
  session: AgentSession;
  onRetryTask?: (taskId: string) => void;
}

export const WorkspaceTimeline: React.FC<WorkspaceTimelineProps> = ({
  session,
  onRetryTask,
}) => {
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const completedCount = session.tasks.filter((t) => t.status === "success").length;
  const runningTask = session.tasks.find((t) => t.status === "running");

  const renderRiskBadge = (risk?: RiskLevel) => {
    if (!risk) return null;
    switch (risk) {
      case "CRITICAL":
        return (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-950/80 text-rose-300 border border-rose-800/60">
            Crítico
          </span>
        );
      case "HIGH":
        return (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/60">
            Alto
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
            Médio
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
            Baixo
          </span>
        );
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-[#090A0F] text-[#F2F3F5] space-y-6 select-none">
      {/* Header da Linha do Tempo */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-mono">
              Grafo de Execução DAG
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Plano de tarefas decomposto em ordem topológica com dependências e verificação de integridade.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-[#12151C] border border-white/[0.08] text-zinc-300">
            Concluídas: <strong className="text-emerald-400">{completedCount}</strong>/{session.tasks.length}
          </span>
          {runningTask && (
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 animate-pulse flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Executando: {runningTask.id}
            </span>
          )}
        </div>
      </div>

      {/* Lista Vertical de Tarefas com Conexões */}
      <div className="max-w-4xl mx-auto relative pl-8 space-y-4 before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-[1px] before:bg-white/[0.08]">
        {session.tasks.map((task, index) => {
          const isExpanded = !!expandedTasks[task.id];
          const isRunning = task.status === "running";
          const isSuccess = task.status === "success";
          const isFailure = task.status === "failure";
          const isWaitingPerm = task.status === "waiting_permission";

          return (
            <div key={task.id} className="relative">
              {/* Marcador de Linha */}
              <div className="absolute -left-8 mt-3 flex items-center justify-center">
                {isSuccess ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                ) : isRunning ? (
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-400 text-indigo-300 flex items-center justify-center animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  </div>
                ) : isWaitingPerm ? (
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 flex items-center justify-center animate-pulse">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                ) : isFailure ? (
                  <div className="w-6 h-6 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 flex items-center justify-center">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#12151C] border border-white/[0.1] text-zinc-500 flex items-center justify-center text-[10px] font-mono">
                    {index + 1}
                  </div>
                )}
              </div>

              {/* Card da Tarefa */}
              <div
                className={`bg-[#12151C] border rounded-xl overflow-hidden transition ${
                  isRunning
                    ? "border-indigo-500/40 shadow-sm"
                    : isWaitingPerm
                    ? "border-amber-500/40"
                    : "border-white/[0.08] hover:border-white/[0.14]"
                }`}
              >
                {/* Linha Principal Clicável */}
                <div
                  onClick={() => toggleTaskExpand(task.id)}
                  className="p-3.5 px-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className="text-zinc-500 hover:text-zinc-300 transition"
                      aria-label="Expandir detalhes"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {task.title}
                        </span>
                        {renderRiskBadge(task.risk)}
                      </div>
                      <p className="text-[11px] text-zinc-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>Ferramenta: <strong className="text-zinc-400">{task.tool || "lógica"}</strong></span>
                        {task.dependencies && task.dependencies.length > 0 && (
                          <>
                            <span>•</span>
                            <span>Depende de: {task.dependencies.join(", ")}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs pl-2">
                    {task.evidence?.passed && (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        verificado
                      </span>
                    )}
                    {task.attempts > 1 && (
                      <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded">
                        tentativa {task.attempts}
                      </span>
                    )}
                    <span className="text-xs text-zinc-400 capitalize">
                      {task.status === "success"
                        ? "Concluído"
                        : task.status === "running"
                        ? "Em execução"
                        : task.status === "waiting_permission"
                        ? "Aguardando autorização"
                        : task.status === "failure"
                        ? "Falhou"
                        : "Pendente"}
                    </span>
                  </div>
                </div>

                {/* Bloco Expandido (Parâmetros, Saída, Evidência e Retry) */}
                {isExpanded && (
                  <div className="p-4 border-t border-white/[0.06] bg-[#0C0D12] space-y-3 text-xs animate-fade-in">
                    {task.description && (
                      <p className="text-zinc-300 text-xs leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {task.command && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">
                          Comando Executado:
                        </span>
                        <pre className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-lg font-mono text-[11px] text-zinc-300 overflow-x-auto">
                          {task.command}
                        </pre>
                      </div>
                    )}

                    {task.args && Object.keys(task.args).length > 0 && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">
                          Argumentos da Ferramenta:
                        </span>
                        <pre className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-lg font-mono text-[11px] text-zinc-300 overflow-x-auto">
                          {JSON.stringify(task.args, null, 2)}
                        </pre>
                      </div>
                    )}

                    {task.evidence && (
                      <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>Evidência Verificada ({task.evidence.type})</span>
                        </div>
                        <p className="text-xs text-emerald-300 font-mono">
                          {task.evidence.summary}
                        </p>
                      </div>
                    )}

                    {task.error && (
                      <div className="bg-rose-950/20 border border-rose-900/40 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-rose-400 text-xs font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Diagnóstico de Falha:</span>
                        </div>
                        <p className="text-xs text-rose-300 font-mono">
                          {task.error}
                        </p>
                        {onRetryTask && (
                          <button
                            type="button"
                            onClick={() => onRetryTask(task.id)}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3 text-zinc-400" />
                            <span>Tentar esta etapa novamente</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
