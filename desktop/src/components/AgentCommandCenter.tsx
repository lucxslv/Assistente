import React, { useState, useEffect } from "react";
import { useAgentRuntime } from "../services/agentRuntimeStore";
import { AgentLogCategory, RiskLevel } from "../types";
import {
  Play,
  Pause,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  ShieldAlert,
  Terminal,
  Cpu,
  FileCheck,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Trash2,
  FolderOpen,
  ArrowRight,
  Search,
} from "lucide-react";

type AgentTab = "overview" | "tasks" | "permissions" | "evidence" | "logs" | "processes" | "history";

export const AgentCommandCenter: React.FC = () => {
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
    refreshProcesses,
    loadSession,
    deleteHistorySession,
    clearHistory,
    clearSession,
  } = useAgentRuntime();

  const [activeTab, setActiveTab] = useState<AgentTab>("overview");
  const [goalInput, setGoalInput] = useState("");
  const [projectInput, setProjectInput] = useState("Charlie");
  const [logFilter, setLogFilter] = useState<AgentLogCategory | "ALL">("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [historyFilter, setHistoryFilter] = useState<"ALL" | "completed" | "failed">("ALL");

  useEffect(() => {
    if (activeTab === "processes") {
      refreshProcesses();
    }
  }, [activeTab]);

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleStartGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) return;
    startGoal(goalInput.trim(), projectInput.trim() || "Charlie");
    setGoalInput("");
  };

  const filteredLogs = logs.filter((log) => {
    const matchesCategory = logFilter === "ALL" || log.category === logFilter;
    const matchesSearch =
      !logSearch ||
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.category.toLowerCase().includes(logSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Indicador de status pontual e sutil
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

  const renderRiskBadge = (risk: RiskLevel) => {
    switch (risk) {
      case "CRITICAL":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60">
            Crítico
          </span>
        );
      case "HIGH":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60">
            Alto
          </span>
        );
      case "MEDIUM":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
            Médio
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800/60 text-zinc-400 border border-zinc-700/50">
            Baixo
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090A0F] text-[#F2F3F5] overflow-hidden select-none">
      {/* ================= Header Superior Discreto ================= */}
      <header className="px-6 py-3.5 border-b border-white/[0.08] bg-[#12151C]/70 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
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
              {session && renderStatusBadge(session.status)}
            </div>
            <p className="text-xs text-zinc-400 max-w-xl truncate mt-0.5 font-normal">
              {session ? session.goal : "Aguardando definição de objetivo."}
            </p>
          </div>
        </div>

        {/* Master Controls */}
        <div className="flex items-center gap-2">
          {session ? (
            <>
              {session.status === "running" && (
                <button
                  type="button"
                  onClick={pauseAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Pausar</span>
                </button>
              )}

              {session.status === "paused" && (
                <button
                  type="button"
                  onClick={resumeAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 transition cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Retomar</span>
                </button>
              )}

              {session.status === "running" && (
                <button
                  type="button"
                  onClick={cancelAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-900/40 transition cursor-pointer"
                >
                  <span>Cancelar</span>
                </button>
              )}

              <button
                type="button"
                onClick={clearSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.08] transition cursor-pointer"
              >
                <span>Nova Missão</span>
              </button>
            </>
          ) : (
            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
              Runtime local pronto
            </div>
          )}
        </div>
      </header>

      {/* ================= Sub-Navegação (Tabs Operacionais) ================= */}
      <div className="px-6 border-b border-white/[0.08] bg-[#12151C]/40 flex items-center justify-between text-xs">
        <nav className="flex space-x-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "overview"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span>Visão Geral</span>
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "tasks"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span>Linha do Tempo</span>
            {session && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/[0.06] text-zinc-400 font-mono">
                {session.tasks.filter((t) => t.status === "success").length}/{session.tasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("permissions")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 relative ${
              activeTab === "permissions"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-zinc-400" />
            <span>Permissões</span>
            {pendingPermissions.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("evidence")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "evidence"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 text-zinc-400" />
            <span>Evidências</span>
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "logs"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-zinc-400" />
            <span>Console</span>
          </button>

          <button
            onClick={() => setActiveTab("processes")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "processes"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            <span>Processos</span>
            {processes.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/[0.06] text-zinc-400 font-mono">
                {processes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-3 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-zinc-300 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>Histórico</span>
            {history.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/[0.06] text-zinc-400 font-mono">
                {history.length}
              </span>
            )}
          </button>
        </nav>

        {session && (
          <div className="text-[11px] text-zinc-500 font-mono">
            {session.progress}% concluído
          </div>
        )}
      </div>

      {/* ================= Conteúdo Principal ================= */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Caso não haja sessão ativa: Prompt de Inicialização de Objetivo */}
        {!session && (
          <div className="max-w-2xl mx-auto mt-8 bg-[#12151C] border border-white/[0.08] rounded-2xl p-7 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-zinc-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-medium text-zinc-100">Iniciar Novo Objetivo do Agente</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  O Charlie planeja a sequência em grafo (DAG), executa ferramentas locais com autorização e comprova o resultado com o Verifier.
                </p>
              </div>
            </div>

            <form onSubmit={handleStartGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Objetivo ou Instrução de Execução
                </label>
                <textarea
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Ex: Criar pasta Teste no Desktop e criar arquivo notas.txt com Olá Mundo..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-[#0C0D12] border border-white/[0.08] rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition resize-none font-normal"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Projeto / Contexto
                  </label>
                  <input
                    type="text"
                    value={projectInput}
                    onChange={(e) => setProjectInput(e.target.value)}
                    placeholder="Charlie"
                    className="w-full px-3 py-2 bg-[#0C0D12] border border-white/[0.08] rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition"
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                  <span className="text-zinc-500">Sugestões:</span>
                  <button
                    type="button"
                    onClick={() => setGoalInput("Criar pasta Teste no Desktop e criar arquivo notas.txt com Olá Mundo")}
                    className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition cursor-pointer"
                  >
                    📁 Criar pasta & arquivo
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setGoalInput("Inspecionar processos ativos do Windows e uso de recursos")}
                    className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition cursor-pointer"
                  >
                    ⚡ Monitorar processos
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setGoalInput("Executar verificação de status do Git no repositório")}
                    className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition cursor-pointer"
                  >
                    💻 Verificar Git
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!goalInput.trim()}
                  className="px-4 py-2 rounded-lg font-medium text-xs bg-zinc-100 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-100 text-zinc-950 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" /> Iniciar Missão
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= TAB 1: OVERVIEW ================= */}
        {session && activeTab === "overview" && (
          <div className="space-y-5 max-w-4xl mx-auto">
            {/* 1. Barra de Resumo Horizontal Contínua (Substitui os 4 cards verticais) */}
            <div className="bg-[#12151C] border border-white/[0.08] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 text-[11px]">Status</span>
                {renderStatusBadge(session.status)}
              </div>

              <div className="h-4 w-[1px] bg-white/[0.08] hidden sm:block" />

              <div className="flex items-center gap-3">
                <span className="text-zinc-500 text-[11px]">Progresso</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-zinc-200">{session.progress}%</span>
                  <div className="w-20 bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-zinc-300 h-full rounded-full transition-all duration-300"
                      style={{ width: `${session.progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="h-4 w-[1px] bg-white/[0.08] hidden sm:block" />

              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-[11px]">Permissões</span>
                <span className="font-medium text-zinc-300">
                  {pendingPermissions.length === 0 ? "Nenhuma pendente" : `${pendingPermissions.length} pendente(s)`}
                </span>
              </div>

              <div className="h-4 w-[1px] bg-white/[0.08] hidden sm:block" />

              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-[11px]">Evidências</span>
                <span className="font-medium text-zinc-300 font-mono">
                  {session.tasks.filter((t) => t.evidence?.passed).length} / {session.tasks.length}
                </span>
              </div>
            </div>

            {/* 2. Bloco Inteligente: Resultado Final Concluído OU Tarefa Atual em Execução */}
            {session.status === "completed" ? (
              <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Objetivo concluído com evidências validadas</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {session.updatedAt ? new Date(session.updatedAt).toLocaleTimeString("pt-BR") : ""}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 bg-[#0C0D12] p-3 rounded-lg border border-white/[0.06]">
                  {session.summary || "Todas as tarefas foram executadas com sucesso no Local Runtime e validadas."}
                </p>
              </div>
            ) : session.status === "running" && session.currentTaskId ? (
              <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                    Passo atual em execução
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">{session.currentTaskId}</span>
                </div>
                {(() => {
                  const curr = session.tasks.find((t) => t.id === session.currentTaskId);
                  if (!curr) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-medium text-zinc-100">{curr.title}</h3>
                      {curr.tool && (
                        <div className="mt-2 text-xs font-mono text-zinc-400 bg-[#0C0D12] px-2.5 py-1.5 rounded border border-white/[0.06] inline-block">
                          ferramenta: <span className="text-zinc-200">{curr.tool}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : null}

            {/* 3. Autorização Pendente (se houver) */}
            {pendingPermissions.length > 0 && (
              <div className="bg-[#161412] border border-amber-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Autorização de Operação Requerida</span>
                  </div>
                  {renderRiskBadge(pendingPermissions[0].risk)}
                </div>
                <p className="text-xs text-zinc-300">
                  Comando: <code className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-zinc-200">{pendingPermissions[0].tool}</code>
                </p>
                <p className="text-xs text-zinc-400">{pendingPermissions[0].reason}</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => resolvePermission(pendingPermissions[0].id, "allow_once")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-200 hover:bg-white text-zinc-950 transition cursor-pointer"
                  >
                    Permitir Uma Vez
                  </button>
                  <button
                    onClick={() => resolvePermission(pendingPermissions[0].id, "deny")}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition cursor-pointer"
                  >
                    Negar
                  </button>
                </div>
              </div>
            )}

            {/* 4. Linha do Tempo Vertical Compacta (Task Graph) */}
            <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-zinc-300">Linha do Tempo de Execução</h3>
                <button
                  onClick={() => setActiveTab("tasks")}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition flex items-center gap-1 cursor-pointer"
                >
                  Ver detalhes <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Vertical Timeline */}
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.08]">
                {session.tasks.map((task, idx) => (
                  <div key={task.id} className="relative flex items-start gap-3">
                    {/* Marcador da timeline */}
                    <div className="absolute -left-6 mt-0.5">
                      {task.status === "success" ? (
                        <div className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        </div>
                      ) : task.status === "running" ? (
                        <div className="w-4 h-4 rounded-full bg-slate-400/20 border border-slate-400 text-slate-300 flex items-center justify-center animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        </div>
                      ) : task.status === "failure" ? (
                        <div className="w-4 h-4 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                          <AlertCircle className="w-2.5 h-2.5" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 flex items-center justify-center text-[9px] font-mono">
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    {/* Conteúdo do passo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-200 truncate">{task.title}</span>
                        {task.evidence?.passed && (
                          <span className="text-[11px] text-zinc-500 font-normal shrink-0">
                            comprovado
                          </span>
                        )}
                      </div>
                      {task.tool && (
                        <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{task.tool}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: TASK GRAPH (DAG COMPLETO COM ACCORDION) ================= */}
        {session && activeTab === "tasks" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Grafo de Tarefas e Dependências</h2>
                <span className="text-xs text-zinc-500">{session.tasks.length} etapas no plano operacional</span>
              </div>
            </div>

            {/* Vertical Timeline com Accordion Interativo */}
            <div className="relative pl-7 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-[1px] before:bg-white/[0.08]">
              {session.tasks.map((task) => {
                const isExpanded = !!expandedTasks[task.id];
                return (
                  <div key={task.id} className="relative">
                    {/* Marcador na linha */}
                    <div className="absolute -left-7 mt-3">
                      {task.status === "success" ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      ) : task.status === "running" ? (
                        <div className="w-5 h-5 rounded-full bg-slate-400/20 border border-slate-400 text-slate-300 flex items-center justify-center animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        </div>
                      ) : task.status === "failure" ? (
                        <div className="w-5 h-5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                          <AlertCircle className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 flex items-center justify-center text-[10px] font-mono">
                          •
                        </div>
                      )}
                    </div>

                    {/* Card Accordion */}
                    <div className="bg-[#12151C] border border-white/[0.08] rounded-xl overflow-hidden transition-all">
                      <div
                        onClick={() => toggleTaskExpand(task.id)}
                        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button className="text-zinc-500 hover:text-zinc-300 transition">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <div className="min-w-0">
                            <h4 className="text-xs font-medium text-zinc-200 truncate">{task.title}</h4>
                            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                              {task.tool || "etapa lógica"} {task.dependencies.length > 0 && `• depende de: ${task.dependencies.join(", ")}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          {task.evidence?.passed && (
                            <span className="text-[11px] text-zinc-500 font-normal">verificado</span>
                          )}
                          {task.attempts > 1 && (
                            <span className="text-[10px] font-mono text-zinc-500">
                              tentativa {task.attempts}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Accordion Expandido com Saída e Evidências */}
                      {isExpanded && (
                        <div className="p-4 border-t border-white/[0.06] bg-[#0C0D12] space-y-3 text-xs">
                          {task.description && (
                            <p className="text-zinc-400 text-xs">{task.description}</p>
                          )}

                          {task.args && (
                            <div>
                              <span className="text-[11px] font-mono text-zinc-500 block mb-1">Parâmetros:</span>
                              <pre className="p-2.5 bg-[#08090C] border border-white/[0.06] rounded-lg font-mono text-[11px] text-zinc-300 overflow-x-auto">
                                {JSON.stringify(task.args, null, 2)}
                              </pre>
                            </div>
                          )}

                          {task.evidence && (
                            <div>
                              <span className="text-[11px] font-mono text-zinc-500 block mb-1">Evidência Comprovada:</span>
                              <div className="p-2.5 bg-[#08090C] border border-emerald-950/40 rounded-lg text-emerald-400 font-mono text-[11px]">
                                {task.evidence.summary}
                              </div>
                            </div>
                          )}

                          {task.error && (
                            <div className="p-2.5 bg-rose-950/20 border border-rose-900/30 rounded-lg text-rose-300 font-mono text-[11px]">
                              {task.error}
                            </div>
                          )}

                          {task.status === "failure" && (
                            <button
                              onClick={() => retryTask(task.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
                            >
                              Tentar Novamente
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: PERMISSIONS ================= */}
        {activeTab === "permissions" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Controle de Acesso e Permissões</h2>
                <span className="text-xs text-zinc-500">Supervisão de segurança do Local Runtime</span>
              </div>
            </div>

            {permissions.length === 0 ? (
              <div className="p-10 text-center text-zinc-500 border border-dashed border-white/[0.08] rounded-xl bg-[#12151C]">
                <Shield className="w-6 h-6 mx-auto mb-2 opacity-30 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-400">Nenhuma solicitação de permissão pendente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className="p-4 bg-[#12151C] border border-white/[0.08] rounded-xl space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-zinc-200 bg-[#0C0D12] px-2 py-0.5 rounded border border-white/[0.06]">
                            {perm.tool}
                          </code>
                          {renderRiskBadge(perm.risk)}
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">{perm.reason}</p>
                      </div>

                      <span className="text-[11px] font-mono text-zinc-500">
                        {new Date(perm.requestedAt).toLocaleTimeString("pt-BR")}
                      </span>
                    </div>

                    {perm.status === "pending" ? (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-white/[0.06]">
                        <button
                          onClick={() => resolvePermission(perm.id, "allow_once")}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-200 hover:bg-white text-zinc-950 transition cursor-pointer"
                        >
                          Permitir Uma Vez
                        </button>
                        <button
                          onClick={() => resolvePermission(perm.id, "trust_in_project")}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
                        >
                          Confiar no Projeto
                        </button>
                        <button
                          onClick={() => resolvePermission(perm.id, "deny")}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 transition cursor-pointer"
                        >
                          Negar
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500 font-mono">
                        Decisão: {perm.status}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: EVIDENCE ================= */}
        {activeTab === "evidence" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Evidências do Verifier</h2>
                <span className="text-xs text-zinc-500">Comprovações tangíveis coletadas em disco e comandos</span>
              </div>
            </div>

            {(!session || session.tasks.filter((t) => t.evidence).length === 0) ? (
              <div className="p-10 text-center text-zinc-500 border border-dashed border-white/[0.08] rounded-xl bg-[#12151C]">
                <FileCheck className="w-6 h-6 mx-auto mb-2 opacity-30 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-400">Nenhuma evidência registrada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {session.tasks
                  .filter((t) => t.evidence)
                  .map((task) => (
                    <div
                      key={task.id}
                      className="p-4 bg-[#12151C] border border-white/[0.08] rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-zinc-200">{task.title}</span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {task.evidence?.verifiedAt ? new Date(task.evidence.verifiedAt).toLocaleTimeString("pt-BR") : ""}
                        </span>
                      </div>
                      <p className="text-emerald-400 font-mono text-[11px] bg-[#0C0D12] p-2.5 rounded-lg border border-white/[0.06]">
                        {task.evidence?.summary}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: LOGS ================= */}
        {activeTab === "logs" && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {(["ALL", "SYSTEM", "AGENT", "TOOL", "PERMISSION", "VERIFIER", "ERROR"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setLogFilter(cat)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                      logFilter === cat
                        ? "bg-zinc-200 text-zinc-950 font-semibold"
                        : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Pesquisar nos registros..."
                  className="pl-8 pr-3 py-1.5 bg-[#0C0D12] border border-white/[0.08] rounded-lg text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>

            {/* Fundo de terminal limpo em tom carvão */}
            <div className="p-4 bg-[#0B0C10] border border-white/[0.06] rounded-xl font-mono text-[11px] space-y-1.5 max-h-[500px] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="text-zinc-600">Nenhum registro para exibir.</div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="leading-relaxed flex items-start gap-2">
                    <span className="text-zinc-600 shrink-0 select-none">[{log.timestamp}]</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] shrink-0 font-bold ${
                        log.category === "ERROR"
                          ? "bg-rose-950/60 text-rose-400"
                          : log.category === "TOOL"
                          ? "bg-slate-900 text-slate-300"
                          : log.category === "VERIFIER"
                          ? "bg-emerald-950/60 text-emerald-400"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {log.category}
                    </span>
                    <span className="text-zinc-300 whitespace-pre-wrap break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 6: PROCESSES ================= */}
        {activeTab === "processes" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Processos Ativos do Sistema</h2>
                <span className="text-xs text-zinc-500">Telemetria de processos do Windows em tempo real</span>
              </div>
              <button
                type="button"
                onClick={() => refreshProcesses()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.08] transition cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" /> Atualizar
              </button>
            </div>

            {processes.length === 0 ? (
              <div className="p-10 text-center text-zinc-500 border border-dashed border-white/[0.08] rounded-xl bg-[#12151C]">
                <Cpu className="w-6 h-6 mx-auto mb-2 opacity-30 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-400">Nenhum processo capturado.</p>
              </div>
            ) : (
              <div className="bg-[#12151C] border border-white/[0.08] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0C0D12] text-zinc-500 uppercase text-[10px] font-mono border-b border-white/[0.06]">
                    <tr>
                      <th className="py-2.5 px-4 font-normal">PID</th>
                      <th className="py-2.5 px-4 font-normal">Processo</th>
                      <th className="py-2.5 px-4 font-normal">CPU</th>
                      <th className="py-2.5 px-4 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono">
                    {processes.map((proc) => (
                      <tr key={proc.pid} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-4 text-zinc-500">{proc.pid}</td>
                        <td className="py-2 px-4 font-sans text-zinc-200">{proc.name}</td>
                        <td className="py-2 px-4 text-zinc-400">{proc.cpu}%</td>
                        <td className="py-2 px-4">
                          <span className="text-[10px] text-zinc-500">
                            {proc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 7: HISTORY ================= */}
        {activeTab === "history" && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">Histórico de Missões do Agente</h2>
                <span className="text-xs text-zinc-500">Registro persistente em disco de todas as sessões executadas</span>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Deseja realmente limpar todo o histórico?")) {
                      clearHistory();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
            </div>

            {/* Cartões de Métricas Agregadas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-[#12151C] border border-white/[0.08] rounded-xl">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">Total de Missões</span>
                <p className="text-lg font-medium text-zinc-100 mt-0.5">{historyMetrics.totalSessions}</p>
              </div>

              <div className="p-3 bg-[#12151C] border border-white/[0.08] rounded-xl">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">Taxa de Sucesso</span>
                <p className="text-lg font-medium text-zinc-100 mt-0.5">{historyMetrics.successRate}%</p>
              </div>

              <div className="p-3 bg-[#12151C] border border-white/[0.08] rounded-xl">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">Concluídas</span>
                <p className="text-lg font-medium text-zinc-100 mt-0.5">{historyMetrics.completedSessions}</p>
              </div>

              <div className="p-3 bg-[#12151C] border border-white/[0.08] rounded-xl">
                <span className="text-[10px] font-mono text-zinc-500 uppercase">Tarefas Validadas</span>
                <p className="text-lg font-medium text-zinc-100 mt-0.5 font-mono">
                  {historyMetrics.completedTasks} / {historyMetrics.totalTasks}
                </p>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHistoryFilter("ALL")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  historyFilter === "ALL"
                    ? "bg-zinc-200 text-zinc-950 font-semibold"
                    : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Todas ({history.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("completed")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  historyFilter === "completed"
                    ? "bg-zinc-200 text-zinc-950 font-semibold"
                    : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Concluídas ({history.filter((s) => s.status === "completed").length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter("failed")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  historyFilter === "failed"
                    ? "bg-zinc-200 text-zinc-950 font-semibold"
                    : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Falhas ({history.filter((s) => s.status === "failed").length})
              </button>
            </div>

            {/* Lista de Sessões */}
            {history.filter((s) => historyFilter === "ALL" || s.status === historyFilter).length === 0 ? (
              <div className="p-10 text-center text-zinc-500 border border-dashed border-white/[0.08] rounded-xl bg-[#12151C]">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-30 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-400">Nenhuma missão no histórico.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history
                  .filter((s) => historyFilter === "ALL" || s.status === historyFilter)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-[#12151C] border border-white/[0.08] rounded-xl space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs text-zinc-100">{item.goal}</span>
                            {renderStatusBadge(item.status)}
                          </div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-2 font-mono">
                            <span>{new Date(item.startedAt).toLocaleString("pt-BR")}</span>
                            <span>•</span>
                            <span>{item.tasks?.filter((t) => t.status === "success").length || 0} de {item.tasks?.length || 0} tarefas</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              loadSession(item);
                              setActiveTab("overview");
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 transition cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" /> Carregar
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHistorySession(item.id)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.summary && (
                        <p className="text-xs text-zinc-400 bg-[#0C0D12] p-2 rounded border border-white/[0.04]">
                          {item.summary}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
