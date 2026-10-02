import React, { useState } from "react";
import {
  useAgentRuntime,
} from "../services/agentRuntimeStore";
import {
  AgentLogCategory,
  RiskLevel,
} from "../types";
import {
  Play,
  Pause,
  XCircle,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  ShieldAlert,
  Terminal,
  Cpu,
  FileCheck,
  Activity,
  Plus,
  ArrowRight,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
} from "lucide-react";

type AgentTab = "overview" | "tasks" | "permissions" | "evidence" | "logs" | "processes";

export const AgentCommandCenter: React.FC = () => {
  const {
    session,
    permissions,
    pendingPermissions,
    logs,
    processes,
    startGoal,
    pauseAgent,
    resumeAgent,
    cancelAgent,
    retryTask,
    completeTaskWithEvidence,
    resolvePermission,
    clearSession,
  } = useAgentRuntime();

  const [activeTab, setActiveTab] = useState<AgentTab>("overview");
  const [goalInput, setGoalInput] = useState("");
  const [projectInput, setProjectInput] = useState("Charlie");
  const [logFilter, setLogFilter] = useState<AgentLogCategory | "ALL">("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

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

  // Cores e rótulos de status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            RUNNING
          </span>
        );
      case "waiting_permission":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5" />
            PERMISSÃO NECESSÁRIA
          </span>
        );
      case "paused":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            <Pause className="w-3 h-3" />
            PAUSADO
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            CONCLUÍDO
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            FALHA
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            IDLE
          </span>
        );
    }
  };

  const getRiskBadge = (risk: RiskLevel) => {
    switch (risk) {
      case "CRITICAL":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">CRÍTICO</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-300 border border-orange-800">ALTO</span>;
      case "MEDIUM":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">MÉDIO</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">BAIXO</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0E0F12] text-[#F2F3F5] overflow-hidden select-none">
      {/* ================= Top Bar / Header Operacional ================= */}
      <header className="px-6 py-4 border-b border-[#23262D] bg-[#12141A]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono font-bold text-sm">
            ⚙️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wide text-zinc-100">
                CHARLIE AGENT RUNTIME
              </h1>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                v1.2
              </span>
              {session && getStatusBadge(session.status)}
            </div>
            <p className="text-xs text-zinc-400 max-w-xl truncate mt-0.5">
              {session ? session.goal : "Aguardando novo objetivo de execução."}
            </p>
          </div>
        </div>

        {/* Master Controls */}
        <div className="flex items-center gap-2">
          {session ? (
            <>
              {session.status === "running" && (
                <button
                  onClick={pauseAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                  title="Pausar execução sem cancelar"
                >
                  <Pause className="w-3.5 h-3.5" /> Pausar
                </button>
              )}
              {session.status === "paused" && (
                <button
                  onClick={resumeAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
                  title="Retomar execução"
                >
                  <Play className="w-3.5 h-3.5" /> Retomar
                </button>
              )}
              {["running", "paused", "waiting_permission"].includes(session.status) && (
                <button
                  onClick={cancelAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 transition"
                  title="Interromper agente"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancelar
                </button>
              )}
              {["completed", "failed"].includes(session.status) && (
                <button
                  onClick={clearSession}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Nova Sessão
                </button>
              )}
            </>
          ) : (
            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500/80"></span>
              Runtime Local Conectado
            </div>
          )}
        </div>
      </header>

      {/* Barra de Progresso Superior */}
      {session && (
        <div className="w-full bg-[#181A20] h-1.5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${session.progress}%` }}
          />
        </div>
      )}

      {/* ================= Sub-Navegação (Tabs Operacionais) ================= */}
      <div className="px-6 border-b border-[#23262D] bg-[#12141A]/40 flex items-center justify-between text-xs">
        <nav className="flex space-x-1">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 px-3.5 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "overview"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Overview
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={`py-3 px-3.5 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "tasks"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Task Graph
            {session && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {session.tasks.filter((t) => t.status === "success").length}/{session.tasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("permissions")}
            className={`py-3 px-3.5 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "permissions"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> Permissões
            {pendingPermissions.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-black animate-bounce">
                {pendingPermissions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("evidence")}
            className={`py-3 px-3.5 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "evidence"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" /> Verifier & Evidências
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`py-3 px-3.5 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "logs"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> Console & Logs
          </button>

          <button
            onClick={() => setActiveTab("processes")}
            className={`py-3 px-3.5 border-b-2 font-medium transition flex items-center gap-1.5 ${
              activeTab === "processes"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Processos
            {processes.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
                {processes.length}
              </span>
            )}
          </button>
        </nav>

        {session && (
          <div className="text-[11px] text-zinc-500 font-mono">
            Sessão: {session.id} | Progresso: {session.progress}%
          </div>
        )}
      </div>

      {/* ================= Conteúdo Principal ================= */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Caso não haja sessão ativa: Prompt de Inicialização de Objetivo */}
        {!session && (
          <div className="max-w-2xl mx-auto mt-12 bg-[#14161E] border border-[#23262D] rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl text-blue-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-100">Iniciar Novo Objetivo do Agente</h2>
                <p className="text-xs text-zinc-400">
                  Defina um objetivo real no computador. O Charlie irá decompor em tarefas, planejar, executar ferramentas e comprovar o resultado com o Verifier.
                </p>
              </div>
            </div>

            <form onSubmit={handleStartGoal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Objetivo / Missão do Agente
                </label>
                <textarea
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Ex: Inspecionar o sistema de autenticação, corrigir erros e rodar testes unitários até passar..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-[#0E0F12] border border-[#2A2E39] rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition resize-none"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Nome do Projeto / Escopo
                  </label>
                  <input
                    type="text"
                    value={projectInput}
                    onChange={(e) => setProjectInput(e.target.value)}
                    placeholder="Charlie"
                    className="w-full px-3.5 py-2 bg-[#0E0F12] border border-[#2A2E39] rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                  <span className="text-zinc-500">Sugestões:</span>
                  <button
                    type="button"
                    onClick={() => setGoalInput("Inspecionar pastas de Documentos e organizar arquivos de teste")}
                    className="hover:text-blue-400 underline underline-offset-2 transition"
                  >
                    Organizar pastas
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setGoalInput("Executar compilação do projeto e validar erros de TypeScript")}
                    className="hover:text-blue-400 underline underline-offset-2 transition"
                  >
                    Compilar & Validar
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!goalInput.trim()}
                  className="px-5 py-2.5 rounded-xl font-medium text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white flex items-center gap-2 shadow-lg shadow-blue-600/20 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" /> Iniciar Execução do Agente
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= TAB 1: OVERVIEW ================= */}
        {session && activeTab === "overview" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#14161E] border border-[#23262D] rounded-xl p-4">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Status Geral</div>
                <div className="mt-2 flex items-center gap-2">
                  {getStatusBadge(session.status)}
                </div>
                <div className="mt-2 text-xs text-zinc-500 font-mono">
                  {session.tasks.filter((t) => t.status === "success").length} de {session.tasks.length} tarefas concluídas
                </div>
              </div>

              <div className="bg-[#14161E] border border-[#23262D] rounded-xl p-4">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Progresso Verificado</div>
                <div className="mt-1 text-2xl font-bold font-mono text-zinc-100">{session.progress}%</div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${session.progress}%` }} />
                </div>
              </div>

              <div className="bg-[#14161E] border border-[#23262D] rounded-xl p-4">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Permissões Pendentes</div>
                <div className="mt-1 text-2xl font-bold font-mono text-zinc-100">{pendingPermissions.length}</div>
                <div className="mt-2 text-xs text-zinc-500">
                  {pendingPermissions.length > 0 ? "Aguardando sua autorização" : "Nenhum bloqueio de segurança"}
                </div>
              </div>

              <div className="bg-[#14161E] border border-[#23262D] rounded-xl p-4">
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Evidências do Verifier</div>
                <div className="mt-1 text-2xl font-bold font-mono text-emerald-400">
                  {session.tasks.filter((t) => t.evidence?.passed).length}
                </div>
                <div className="mt-2 text-xs text-zinc-500">Comprovações tangíveis</div>
              </div>
            </div>

            {/* Tarefa em Execução / Atual */}
            {session.currentTaskId && (
              <div className="bg-[#14161E] border border-blue-500/30 rounded-xl p-5 shadow-lg shadow-blue-950/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                    TAREFA EM EXECUÇÃO NO LOCAL RUNTIME
                  </span>
                  <span className="text-xs font-mono text-zinc-400">ID: {session.currentTaskId}</span>
                </div>
                {(() => {
                  const curr = session.tasks.find((t) => t.id === session.currentTaskId);
                  if (!curr) return null;
                  return (
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">{curr.title}</h3>
                      <p className="text-xs text-zinc-400 mt-1">{curr.description}</p>
                      {curr.tool && (
                        <div className="mt-3 flex items-center gap-2 text-xs font-mono bg-[#0E0F12] border border-zinc-800 rounded-lg p-2.5 text-zinc-300">
                          <Terminal className="w-4 h-4 text-zinc-500" />
                          <span>Ferramenta: <strong className="text-blue-300">{curr.tool}</strong></span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Alerta de Permissão Interativa se houver */}
            {pendingPermissions.length > 0 && (
              <div className="bg-amber-950/20 border border-amber-500/40 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    AUTORIZAÇÃO DO OPERADOR NECESSÁRIA
                  </div>
                  {getRiskBadge(pendingPermissions[0].risk)}
                </div>
                <p className="text-xs text-zinc-300 mb-2">
                  O Charlie quer executar: <code className="bg-black/50 px-2 py-0.5 rounded text-amber-300 font-mono">{pendingPermissions[0].tool}</code>
                </p>
                <p className="text-xs text-zinc-400 mb-4">
                  <strong>Justificativa:</strong> {pendingPermissions[0].reason}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => resolvePermission(pendingPermissions[0].id, "allow_once")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                  >
                    Permitir Uma Vez
                  </button>
                  <button
                    onClick={() => resolvePermission(pendingPermissions[0].id, "allow_for_task")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer"
                  >
                    Permitir Para Esta Tarefa
                  </button>
                  <button
                    onClick={() => resolvePermission(pendingPermissions[0].id, "trust_in_project")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition cursor-pointer"
                  >
                    Confiar no Projeto
                  </button>
                  <button
                    onClick={() => resolvePermission(pendingPermissions[0].id, "deny")}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 transition cursor-pointer"
                  >
                    Negar
                  </button>
                </div>
              </div>
            )}

            {/* Task Graph Simplificado na Overview */}
            <div className="bg-[#14161E] border border-[#23262D] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Sequência do Task Graph</h3>
                <button
                  onClick={() => setActiveTab("tasks")}
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Ver grafo completo <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-2">
                {session.tasks.map((task, idx) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                      task.status === "running"
                        ? "bg-blue-950/20 border-blue-500/30 text-zinc-100"
                        : task.status === "success"
                        ? "bg-[#0E0F12] border-emerald-900/30 text-zinc-300"
                        : "bg-[#0E0F12] border-zinc-800/60 text-zinc-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-zinc-500 w-4">{idx + 1}.</span>
                      {task.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {task.status === "running" && <span className="w-3.5 h-3.5 rounded-full bg-blue-400 animate-ping shrink-0" />}
                      {task.status === "pending" && <Clock className="w-4 h-4 text-zinc-600 shrink-0" />}
                      {task.status === "failure" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                      <span className="font-medium truncate">{task.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {task.evidence?.passed && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Verificado ✓
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-zinc-500 uppercase">{task.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: TASK GRAPH (DAG) ================= */}
        {session && activeTab === "tasks" && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-zinc-200">Grafo de Tarefas e Dependências (DAG)</h2>
              <span className="text-xs text-zinc-500">
                {session.tasks.length} nós no grafo de execução
              </span>
            </div>

            <div className="space-y-3">
              {session.tasks.map((task) => {
                const isExpanded = !!expandedTasks[task.id];
                return (
                  <div
                    key={task.id}
                    className={`border rounded-xl transition ${
                      task.status === "running"
                        ? "bg-[#141824] border-blue-500/40 shadow-lg shadow-blue-950/20"
                        : task.status === "success"
                        ? "bg-[#14161E] border-emerald-900/30"
                        : task.status === "failure"
                        ? "bg-[#1E1416] border-rose-900/40"
                        : "bg-[#14161E] border-[#23262D]"
                    }`}
                  >
                    <div
                      onClick={() => toggleTaskExpand(task.id)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/20"
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-zinc-500">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>

                        <div className="flex items-center gap-2">
                          {task.status === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                          {task.status === "running" && <span className="w-3 h-3 rounded-full bg-blue-400 animate-ping" />}
                          {task.status === "pending" && <Clock className="w-4 h-4 text-zinc-600" />}
                          {task.status === "failure" && <AlertCircle className="w-5 h-5 text-rose-400" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-zinc-500 font-bold">TASK_{task.id}</span>
                            <h4 className="text-sm font-semibold text-zinc-200">{task.title}</h4>
                          </div>
                          {task.description && (
                            <p className="text-xs text-zinc-400 mt-0.5">{task.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs">
                        {task.tool && (
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#0E0F12] border border-zinc-800 text-blue-300">
                            {task.tool}
                          </span>
                        )}
                        <span className="font-mono text-zinc-500 text-[11px]">
                          Tentativas: {task.attempts}/{task.maxAttempts}
                        </span>
                        {task.status === "running" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              completeTaskWithEvidence(task.id, "Operação executada com sucesso e comprovada no disco local.", "file");
                            }}
                            className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                          >
                            Simular Sucesso ✓
                          </button>
                        )}
                        {task.status === "failure" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              retryTask(task.id);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" /> Replanejar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Detalhes Expandidos da Tarefa */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 border-t border-zinc-800/60 bg-[#0E0F12]/50 text-xs space-y-3">
                        {task.dependencies.length > 0 && (
                          <div>
                            <span className="text-zinc-500 font-mono text-[11px]">DEPENDÊNCIAS:</span>
                            <div className="flex gap-1.5 mt-1">
                              {task.dependencies.map((dep) => (
                                <span key={dep} className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                                  {dep}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {task.evidence && (
                          <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg">
                            <div className="flex items-center justify-between text-emerald-400 font-bold text-[11px] mb-1">
                              <span>EVIDÊNCIA COMPROVADA (VERIFIER)</span>
                              <span className="font-mono text-zinc-500">{task.evidence.verifiedAt}</span>
                            </div>
                            <p className="text-zinc-300">{task.evidence.summary}</p>
                          </div>
                        )}

                        {task.error && (
                          <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-lg">
                            <div className="text-rose-400 font-bold text-[11px] mb-1">DIAGNÓSTICO DE FALHA</div>
                            <p className="text-zinc-300">{task.error}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: PERMISSIONS ================= */}
        {activeTab === "permissions" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-zinc-200">Permission Center & Controle de Acesso</h2>
              <span className="text-xs text-zinc-500">
                Princípio do Menor Privilégio & Supervisão Humana
              </span>
            </div>

            {permissions.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-[#14161E]">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Nenhuma solicitação de permissão ativa ou registrada.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Quando o agente tentar executar ações potencialmente perigosas (instalação de pacotes, escrita em diretórios raiz ou comandos do sistema), você poderá revisar aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {permissions.map((perm) => (
                  <div
                    key={perm.id}
                    className={`border rounded-xl p-5 ${
                      perm.status === "pending"
                        ? "bg-amber-950/15 border-amber-500/40 shadow-lg"
                        : "bg-[#14161E] border-[#23262D] opacity-80"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-400">{perm.id}</span>
                        <h4 className="text-sm font-semibold text-zinc-200">Ferramenta: {perm.tool}</h4>
                      </div>
                      {getRiskBadge(perm.risk)}
                    </div>

                    <p className="text-xs text-zinc-300 mb-2">
                      <strong>Motivo:</strong> {perm.reason}
                    </p>

                    {perm.command && (
                      <div className="mb-3 p-2 bg-[#0E0F12] border border-zinc-800 rounded font-mono text-xs text-amber-300">
                        {perm.command}
                      </div>
                    )}

                    {perm.status === "pending" ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          onClick={() => resolvePermission(perm.id, "allow_once")}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                        >
                          Permitir Uma Vez
                        </button>
                        <button
                          onClick={() => resolvePermission(perm.id, "allow_for_task")}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                        >
                          Permitir Para Esta Tarefa
                        </button>
                        <button
                          onClick={() => resolvePermission(perm.id, "trust_in_project")}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer"
                        >
                          Confiar no Projeto
                        </button>
                        <button
                          onClick={() => resolvePermission(perm.id, "deny")}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 cursor-pointer"
                        >
                          Negar
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500 font-mono pt-1">
                        Status da Decisão: <strong className="text-zinc-300 uppercase">{perm.status}</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 4: EVIDENCE & VERIFIER ================= */}
        {activeTab === "evidence" && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-zinc-200">Verifier — Evidências Comprovadas</h2>
              <span className="text-xs text-zinc-500 italic">«Conclusão exige evidência»</span>
            </div>

            {session && session.tasks.some((t) => t.evidence) ? (
              <div className="space-y-3">
                {session.tasks
                  .filter((t) => t.evidence)
                  .map((task) => (
                    <div key={task.id} className="bg-[#14161E] border border-emerald-900/40 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-sm font-semibold text-zinc-200">{task.title}</h4>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase">
                          {task.evidence?.type}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-2 bg-[#0E0F12] p-3 rounded-lg border border-zinc-800/60 font-mono">
                        {task.evidence?.summary}
                      </p>
                      <div className="mt-2 text-[10px] text-zinc-500 font-mono">
                        Validado em: {task.evidence?.verifiedAt}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-[#14161E]">
                <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Nenhuma evidência registrada ainda.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  O Verifier avaliará saídas de compilador, testes, hash de arquivos e códigos de saída para comprovar cada tarefa executada.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: LOGS ================= */}
        {activeTab === "logs" && (
          <div className="max-w-5xl mx-auto flex flex-col h-[calc(100vh-210px)]">
            {/* Filtros e Busca de Logs */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(["ALL", "SYSTEM", "AGENT", "TOOL", "PERMISSION", "VERIFIER", "REPLANNER", "ERROR"] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      onClick={() => setLogFilter(cat)}
                      className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition ${
                        logFilter === cat
                          ? "bg-blue-600 text-white font-bold"
                          : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filtrar logs..."
                  className="pl-8 pr-3 py-1 bg-[#14161E] border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-blue-500 transition w-48"
                />
              </div>
            </div>

            {/* Console de Logs */}
            <div className="flex-1 bg-[#0A0B0E] border border-[#23262D] rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-zinc-300">
              {filteredLogs.length === 0 ? (
                <div className="text-zinc-600 py-8 text-center">Nenhum log encontrado para o filtro selecionado.</div>
              ) : (
                filteredLogs.map((log) => {
                  let tagColor = "text-blue-400";
                  if (log.category === "ERROR") tagColor = "text-rose-400";
                  else if (log.category === "PERMISSION") tagColor = "text-amber-400";
                  else if (log.category === "VERIFIER") tagColor = "text-emerald-400";
                  else if (log.category === "REPLANNER") tagColor = "text-purple-400";
                  else if (log.category === "TOOL") tagColor = "text-cyan-400";

                  return (
                    <div key={log.id} className="flex items-start gap-2 hover:bg-white/[0.02] py-0.5 px-1 rounded">
                      <span className="text-zinc-600 select-none text-[11px]">{log.timestamp}</span>
                      <span className={`font-bold text-[11px] w-24 shrink-0 ${tagColor}`}>
                        [{log.category}]
                      </span>
                      <span className="text-zinc-300 break-all">{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 6: PROCESSES ================= */}
        {activeTab === "processes" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-zinc-200">Process Monitor — Subprocessos do Agente</h2>
              <span className="text-xs text-zinc-500">Monitoramento e isolamento operacional</span>
            </div>

            {processes.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-[#14161E]">
                <Cpu className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Nenhum subprocesso em execução no momento.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Processos de compilação, testes e terminais executados pelo agente aparecerão listados aqui.
                </p>
              </div>
            ) : (
              <div className="bg-[#14161E] border border-[#23262D] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#12141A] text-zinc-400 uppercase text-[10px] font-mono border-b border-[#23262D]">
                    <tr>
                      <th className="py-2.5 px-4">PID</th>
                      <th className="py-2.5 px-4">Processo</th>
                      <th className="py-2.5 px-4">CPU</th>
                      <th className="py-2.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {processes.map((proc) => (
                      <tr key={proc.pid} className="hover:bg-zinc-800/20">
                        <td className="py-2.5 px-4 text-zinc-400">{proc.pid}</td>
                        <td className="py-2.5 px-4 font-semibold text-zinc-200">{proc.name}</td>
                        <td className="py-2.5 px-4 text-blue-400">{proc.cpu}%</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
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
      </main>
    </div>
  );
};
