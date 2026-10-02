import React from "react";
import { AgentSession } from "../../types";
import {
  CheckCircle2,
  FileCode,
  Terminal,
  Folder,
  FileCheck,
  Cpu,
  ArrowRight,
  GitCommit,
} from "lucide-react";

interface WorkspaceOverviewProps {
  session: AgentSession;
  onNavigateTab: (tab: any) => void;
}

export const WorkspaceOverview: React.FC<WorkspaceOverviewProps> = ({
  session,
  onNavigateTab,
}) => {
  const completedTasks = session.tasks.filter((t) => t.status === "success").length;
  const runningTasks = session.tasks.filter((t) => t.status === "running").length;
  const pendingTasks = session.tasks.filter((t) => t.status === "pending" || t.status === "waiting_permission").length;
  const artifactsCount = session.artifacts?.length || 0;
  const filesCount = session.files?.length || 0;
  const terminalsCount = session.terminals?.length || 0;
  const changesCount = session.changes?.length || 0;
  const verifiedCount = session.evidence?.filter((e) => e.passed).length || 0;

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* ================= Banner de Objetivo e Progresso ================= */}
      <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                Objetivo Operacional
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                ID: {session.id.slice(-8)}
              </span>
            </div>
            <h2 className="text-base font-semibold text-zinc-100">{session.goal}</h2>
            {session.project && (
              <p className="text-xs text-zinc-400 flex items-center gap-1.5 pt-0.5">
                <Folder className="w-3.5 h-3.5 text-zinc-500" />
                <span>Projeto: {session.project}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-zinc-100">
                {session.progress}%
              </div>
              <div className="text-[11px] text-zinc-400">Progresso global</div>
            </div>
          </div>
        </div>

        {/* Barra de Progresso Sutis */}
        <div className="w-full bg-white/[0.06] rounded-full h-1.5 mt-4 overflow-hidden">
          <div
            className="bg-slate-300 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${session.progress}%` }}
          />
        </div>
      </div>

      {/* ================= Grid de Métricas Operacionais Compactas ================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => onNavigateTab("tasks")}
          className="text-left bg-[#12151C]/90 hover:bg-[#12151C] border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-4 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium text-zinc-300">Tarefas DAG</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400/80 group-hover:text-emerald-400 transition" />
          </div>
          <div className="text-xl font-mono font-semibold text-zinc-100">
            {completedTasks}
            <span className="text-xs text-zinc-500 font-normal font-sans ml-1">
              / {session.tasks.length}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
            {runningTasks > 0 ? (
              <span className="text-slate-300">● {runningTasks} em execução</span>
            ) : (
              <span>{pendingTasks} pendentes</span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("artifacts")}
          className="text-left bg-[#12151C]/90 hover:bg-[#12151C] border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-4 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium text-zinc-300">Artefatos</span>
            <FileCode className="w-4 h-4 text-slate-400 group-hover:text-zinc-200 transition" />
          </div>
          <div className="text-xl font-mono font-semibold text-zinc-100">
            {artifactsCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {artifactsCount > 0 ? "Relatórios e dados disponíveis" : "Nenhum gerado ainda"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("terminals")}
          className="text-left bg-[#12151C]/90 hover:bg-[#12151C] border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-4 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium text-zinc-300">Terminais</span>
            <Terminal className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition" />
          </div>
          <div className="text-xl font-mono font-semibold text-zinc-100">
            {terminalsCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Processos PowerShell & CMD
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("evidence")}
          className="text-left bg-[#12151C]/90 hover:bg-[#12151C] border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-4 transition group cursor-pointer"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium text-zinc-300">Evidências</span>
            <FileCheck className="w-4 h-4 text-emerald-400/80 group-hover:text-emerald-400 transition" />
          </div>
          <div className="text-xl font-mono font-semibold text-zinc-100">
            {verifiedCount}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Comprovadas pelo Verifier
          </div>
        </button>
      </div>

      {/* ================= Subagentes Especializados Ativos ================= */}
      {session.subagents && session.subagents.length > 0 && (
        <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                Equipe de Subagentes Especializados
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("subagents")}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
            >
              <span>Ver detalhes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {session.subagents.map((sub) => {
              const isRunning = sub.status === "running";
              const isCompleted = sub.status === "completed";
              return (
                <div
                  key={sub.id}
                  className="bg-[#090A0F]/60 border border-white/[0.06] rounded-lg p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-200">{sub.role}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isRunning
                          ? "bg-slate-300 animate-pulse"
                          : isCompleted
                          ? "bg-emerald-400"
                          : "bg-zinc-600"
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-1">
                    {sub.currentTask || sub.goal}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= Últimos Artefatos e Mudanças ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Artefatos Recentes */}
        <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                Artefatos Gerados
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("artifacts")}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              Ver todos ({artifactsCount})
            </button>
          </div>

          {session.artifacts && session.artifacts.length > 0 ? (
            <div className="space-y-2">
              {session.artifacts.slice(0, 3).map((art) => (
                <div
                  key={art.id}
                  onClick={() => onNavigateTab("artifacts")}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#090A0F]/50 border border-white/[0.04] hover:border-white/[0.12] cursor-pointer transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm">📄</span>
                    <div className="truncate">
                      <div className="text-xs font-mono text-zinc-200 truncate">{art.name}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">{art.type}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-500 py-6 text-center border border-dashed border-white/[0.06] rounded-lg">
              Nenhum artefato persistente produzido até o momento.
            </div>
          )}
        </div>

        {/* Arquivos & Conjunto de Mudanças */}
        <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                Arquivos & Alterações
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("changes")}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition"
            >
              Ver diffs ({changesCount})
            </button>
          </div>

          {session.changes && session.changes.length > 0 ? (
            <div className="space-y-2">
              {session.changes.slice(0, 3).map((chg) => (
                <div
                  key={chg.id}
                  onClick={() => onNavigateTab("changes")}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#090A0F]/50 border border-white/[0.04] hover:border-white/[0.12] cursor-pointer transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        chg.type === "A"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : chg.type === "D"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-slate-500/10 text-slate-300 border border-slate-500/20"
                      }`}
                    >
                      {chg.type}
                    </span>
                    <span className="text-xs font-mono text-zinc-300 truncate">{chg.path}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase">{chg.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-500 py-6 text-center border border-dashed border-white/[0.06] rounded-lg">
              {filesCount > 0
                ? `${filesCount} arquivos inspecionados sem alterações no código.`
                : "Nenhum arquivo inspecionado ou alterado."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
