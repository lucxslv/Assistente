import React, { useState, useEffect } from "react";
import { useAgentRuntime } from "../services/agentRuntimeStore";
import {
  Play,
  Pause,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Sparkles,
  Trash2,
  FolderOpen,
  Folder,
  ArrowRight,
  X,
  History as HistoryIcon,
} from "lucide-react";
import { AgentWorkspace } from "./workspace/AgentWorkspace";

export interface AgentCommandCenterProps {
  selectedArtifactId?: string;
}

export const AgentCommandCenter: React.FC<AgentCommandCenterProps> = ({ selectedArtifactId }) => {
  const {
    session,
    permissions,
    pendingPermissions,
    logs,
    processes,
    history,
    historyMetrics,
    startGoal,
    pauseAgent,
    resumeAgent,
    cancelAgent,
    retryTask,
    resolvePermission,
    resolveChangeReview,
    refreshProcesses,
    loadSession,
    deleteHistorySession,
    clearHistory,
    clearSession,
  } = useAgentRuntime();

  const [goalInput, setGoalInput] = useState("");
  const [projectInput, setProjectInput] = useState("Charlie");
  const [showProcessesModal, setShowProcessesModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    if (showProcessesModal) {
      refreshProcesses();
    }
  }, [showProcessesModal]);

  const handleStartGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;
    startGoal(goalInput.trim(), projectInput.trim() || "Charlie");
    setGoalInput("");
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
            Em execução
          </span>
        );
      case "waiting_permission":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Autorização necessária
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Pause className="w-3 h-3 text-zinc-400" />
            Pausado
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Concluído
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            Falha
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
            Aguardando
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090A0F] text-[#F2F3F5] overflow-hidden select-none">
      {/* ================= HEADER SUPERIOR DISCRETO (ÚNICO) ================= */}
      <header className="px-6 py-3 border-b border-white/[0.08] bg-[#12151C]/70 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400 text-sm">
            ⚙️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-semibold tracking-wider text-zinc-200 uppercase font-mono">
                Charlie Agentic Runtime
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                v1.2
              </span>
              {session ? (
                renderStatusBadge(session.status)
              ) : (
                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                  Pronto
                </div>
              )}
            </div>
            {session && (
              <p className="text-xs text-zinc-400 max-w-xl truncate mt-0.5 font-normal">
                {session.goal}
              </p>
            )}
          </div>
        </div>

        {/* Master Controls & Utilitários */}
        <div className="flex items-center gap-2">
          {session && (
            <>
              {session.status === "running" && (
                <button
                  type="button"
                  onClick={pauseAgent}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Pausar</span>
                </button>
              )}

              {session.status === "paused" && (
                <button
                  type="button"
                  onClick={resumeAgent}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 transition cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Retomar</span>
                </button>
              )}

              {session.status === "running" && (
                <button
                  type="button"
                  onClick={cancelAgent}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-900/40 transition cursor-pointer"
                >
                  <span>Cancelar</span>
                </button>
              )}

              <button
                type="button"
                onClick={clearSession}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.08] transition cursor-pointer"
              >
                <span>Nova Missão</span>
              </button>
            </>
          )}

          {/* Botões Utilitários (Não Poluem as Abas Principais) */}
          <button
            type="button"
            onClick={() => setShowProcessesModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-white/[0.06] transition cursor-pointer"
            title="Telemetria de Processos do SO"
          >
            <Cpu className="w-3.5 h-3.5 text-zinc-500" />
            <span className="hidden sm:inline">Processos</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-white/[0.06] transition cursor-pointer"
            title="Histórico de Sessões do Agente"
          >
            <HistoryIcon className="w-3.5 h-3.5 text-zinc-500" />
            <span className="hidden sm:inline">Histórico</span>
            {history.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.06] text-zinc-400">
                {history.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ================= CORPO PRINCIPAL ================= */}
      <main className="flex-1 overflow-hidden relative">
        {session ? (
          /* Se houver sessão, renderiza o AgentWorkspace com sua BARRA ÚNICA DE 4 SEÇÕES */
          <AgentWorkspace
            session={session}
            logs={logs}
            permissions={permissions}
            pendingPermissions={pendingPermissions}
            selectedArtifactId={selectedArtifactId}
            onReviewChange={resolveChangeReview}
            onResolvePermission={(reqId, decision) => resolvePermission(reqId, decision)}
            onRetryTask={retryTask}
          />
        ) : (
          /* Se não houver sessão ativa, renderiza o Cockpit de Partida */
          <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto space-y-6">
            <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100 font-mono uppercase tracking-wider">
                    Iniciar Missão Autônoma
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    O Charlie decompõe objetivos complexos em um DAG de tarefas verificáveis no seu computador.
                  </p>
                </div>
              </div>

              <form onSubmit={handleStartGoal} className="space-y-4">
                <div>
                  <label className="text-[11px] font-mono uppercase text-zinc-400 block mb-1.5">
                    Objetivo da Missão
                  </label>
                  <textarea
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    placeholder="Ex: Analisar completamente meu PC e gerar um relatório técnico com hardware, processos e espaço..."
                    rows={3}
                    className="w-full bg-[#090A0F] border border-white/[0.08] rounded-lg p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      value={projectInput}
                      onChange={(e) => setProjectInput(e.target.value)}
                      placeholder="Projeto / Pasta"
                      className="bg-[#090A0F] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!goalInput.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition disabled:opacity-40 cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <span>Lançar Missão</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              {/* Botão de Sugestão Rápida */}
              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    startGoal(
                      "Charlie, analise completamente meu PC e crie um relatório com arquitetura, processos e armazenamento",
                      "Charlie-Diagnostics"
                    );
                  }}
                  className="w-full text-left p-3 rounded-lg bg-[#090A0F]/60 border border-white/[0.04] hover:border-white/[0.12] transition group cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">🔍</span>
                    <div>
                      <div className="text-xs font-medium text-zinc-200 group-hover:text-white transition">
                        Charlie, analise completamente meu PC...
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Decompõe varredura de hardware, processos e armazenamento gerando relatório e artefatos.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-indigo-400 font-mono group-hover:translate-x-0.5 transition">
                    Executar →
                  </span>
                </button>
              </div>
            </div>

            {/* Histórico Recente de Missões */}
            {history.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-mono uppercase text-[11px]">Sessões Anteriores</span>
                  <button
                    type="button"
                    onClick={() => setShowHistoryModal(true)}
                    className="text-zinc-500 hover:text-zinc-300 transition"
                  >
                    Ver todas ({history.length})
                  </button>
                </div>

                <div className="space-y-2">
                  {history.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => loadSession(item)}
                      className="p-3 bg-[#12151C] border border-white/[0.06] hover:border-white/[0.12] rounded-xl flex items-center justify-between cursor-pointer transition"
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-200 truncate">{item.goal}</span>
                          {renderStatusBadge(item.status)}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5 flex items-center gap-2">
                          <span>{new Date(item.startedAt).toLocaleString("pt-BR")}</span>
                          <span>•</span>
                          <span>{item.tasks?.filter((t) => t.status === "success").length || 0} tarefas concluídas</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-2.5 py-1 rounded bg-white/[0.04] text-xs font-mono text-zinc-300 flex items-center gap-1 shrink-0"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Restaurar</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ================= MODAL DE PROCESSOS DO SO ================= */}
      {showProcessesModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#12151C] border border-white/[0.12] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-zinc-400" />
                <h3 className="text-xs font-semibold text-zinc-200 uppercase font-mono tracking-wider">
                  Processos Ativos do Sistema ({processes.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshProcesses()}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition"
                  title="Atualizar"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowProcessesModal(false)}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0C0D12] text-zinc-500 uppercase text-[10px] border-b border-white/[0.06]">
                  <tr>
                    <th className="py-2 px-3 font-normal">PID</th>
                    <th className="py-2 px-3 font-normal font-sans">Processo</th>
                    <th className="py-2 px-3 font-normal">CPU</th>
                    <th className="py-2 px-3 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {processes.slice(0, 50).map((proc) => (
                    <tr key={proc.pid} className="hover:bg-white/[0.02]">
                      <td className="py-1.5 px-3 text-zinc-500">{proc.pid}</td>
                      <td className="py-1.5 px-3 font-sans text-zinc-200">{proc.name}</td>
                      <td className="py-1.5 px-3 text-zinc-400">{proc.cpu}%</td>
                      <td className="py-1.5 px-3 text-zinc-500 text-[10px]">{proc.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE HISTÓRICO DE SESSÕES ================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#12151C] border border-white/[0.12] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HistoryIcon className="w-4 h-4 text-zinc-400" />
                <h3 className="text-xs font-semibold text-zinc-200 uppercase font-mono tracking-wider">
                  Histórico de Missões do Charlie ({history.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Deseja realmente limpar todo o histórico?")) {
                        clearHistory();
                      }
                    }}
                    className="text-xs text-zinc-500 hover:text-rose-400 transition flex items-center gap-1 mr-2"
                  >
                    <Trash2 className="w-3 h-3" /> Limpar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Métricas Agregadas */}
            <div className="grid grid-cols-3 gap-2 p-4 border-b border-white/[0.06] bg-[#0C0D12]">
              <div className="p-2 rounded bg-white/[0.02]">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block">Total</span>
                <span className="text-sm font-bold text-zinc-200 font-mono">{historyMetrics.totalSessions}</span>
              </div>
              <div className="p-2 rounded bg-white/[0.02]">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block">Sucesso</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">{historyMetrics.successRate}%</span>
              </div>
              <div className="p-2 rounded bg-white/[0.02]">
                <span className="text-[10px] text-zinc-500 font-mono uppercase block">Tarefas Validadas</span>
                <span className="text-sm font-bold text-zinc-200 font-mono">{historyMetrics.completedTasks}/{historyMetrics.totalTasks}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {history.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  Nenhuma sessão registrada no histórico.
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-[#090A0F] border border-white/[0.06] rounded-lg flex items-center justify-between hover:border-white/[0.12] transition"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-200 truncate">{item.goal}</span>
                        {renderStatusBadge(item.status)}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {new Date(item.startedAt).toLocaleString("pt-BR")} • {item.tasks?.length || 0} tarefas
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          loadSession(item);
                          setShowHistoryModal(false);
                        }}
                        className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-xs font-mono text-zinc-300 transition"
                      >
                        Carregar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteHistorySession(item.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
