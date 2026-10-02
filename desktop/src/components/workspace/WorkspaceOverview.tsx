import React, { useState } from "react";
import { AgentSession, AgentSubagent, PermissionRequest } from "../../types";
import {
  CheckCircle2,
  AlertCircle,
  Pause,
  Folder,
  Terminal,
  FileCode,
  GitCommit,
  FileCheck,
  Shield,
  ArrowRight,
  X,
  Cpu,
} from "lucide-react";

interface WorkspaceOverviewProps {
  session: AgentSession;
  onNavigateTab: (tab: "live" | "timeline" | "files_artifacts" | "logs_terminal", subTab?: string) => void;
  pendingPermissions?: PermissionRequest[];
  onResolvePermission?: (reqId: string, decision: "allow_once" | "allow_for_task" | "deny") => void;
}

export const WorkspaceOverview: React.FC<WorkspaceOverviewProps> = ({
  session,
  onNavigateTab,
  pendingPermissions = [],
  onResolvePermission,
}) => {
  const [selectedSubagent, setSelectedSubagent] = useState<AgentSubagent | null>(null);

  const completedTasks = session.tasks.filter((t) => t.status === "success").length;
  const runningTask = session.tasks.find((t) => t.status === "running");

  const artifactsCount = session.artifacts?.length || 0;
  const filesCount = session.files?.length || 0;
  const changesCount = session.changes?.length || 0;
  const terminalsCount = session.terminals?.length || 0;
  const evidenceCount = session.evidence?.length || 0;

  // Último terminal ativo com saída
  const latestTerminal = session.terminals && session.terminals.length > 0
    ? session.terminals[session.terminals.length - 1]
    : null;

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
            Autorização pendente
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
            Falhou
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
    <div className="h-full w-full overflow-y-auto p-6 bg-[#090A0F] text-[#F2F3F5] space-y-4 select-none">
      {/* ================= 1. CABEÇALHO COMPACTO DA MISSÃO (Ponto 3) ================= */}
      <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-3.5 px-4 shadow-sm relative overflow-hidden">
        {/* Barra ultra-fina de 3px integrada ao topo */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/[0.04]">
          <div
            className={`h-full transition-all duration-500 ${
              session.status === "failed"
                ? "bg-rose-500"
                : session.status === "completed"
                ? "bg-emerald-400"
                : "bg-indigo-400"
            }`}
            style={{ width: `${session.progress}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          {/* Título e Metadados Discretos Inline */}
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                {session.goal}
              </h2>
              {renderStatusBadge(session.status)}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-zinc-500 font-mono mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-zinc-400">
                <Folder className="w-3 h-3 text-zinc-500" />
                <span className="truncate max-w-xs">{session.project || "Charlie"}</span>
              </span>
              <span className="text-zinc-600">•</span>
              <span>ID: {session.id.slice(-8)}</span>
              {session.currentTaskId && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400">
                    Ativa: <strong className="text-zinc-300 font-normal">{session.currentTaskId}</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Indicador de Progresso Compacto */}
          <div className="flex items-center gap-3 pl-4 border-l border-white/[0.06]">
            <div className="text-right">
              <div className="text-base font-mono font-bold text-zinc-100 flex items-center justify-end gap-1.5">
                <span>{session.progress}%</span>
                {session.status === "running" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                {completedTasks}/{session.tasks.length} tarefas
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= 2. EQUIPE DE SUBAGENTES COMPACTA (Ponto 4) ================= */}
      {session.subagents && session.subagents.length > 0 && (
        <div className="flex items-center justify-between gap-2 bg-[#12151C]/60 border border-white/[0.06] rounded-lg px-3 py-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-zinc-500" />
              Subagentes:
            </span>

            {session.subagents.map((sub) => {
              const isRunning = sub.status === "running";
              const isCompleted = sub.status === "completed";
              const isSelected = selectedSubagent?.id === sub.id;

              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedSubagent(isSelected ? null : sub)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono transition cursor-pointer border ${
                    isSelected
                      ? "bg-white/[0.12] border-white/20 text-zinc-100 shadow-sm"
                      : "bg-white/[0.03] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRunning
                        ? "bg-indigo-400 animate-pulse"
                        : isCompleted
                        ? "bg-emerald-400"
                        : "bg-zinc-600"
                    }`}
                  />
                  <span className="font-sans font-medium text-zinc-300">{sub.role}:</span>
                  <span className="text-[11px] text-zinc-400 capitalize">
                    {isRunning ? "Ativo" : isCompleted ? "Concluído" : "Aguardando"}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab("timeline")}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 font-mono transition flex items-center gap-1"
          >
            <span>Ver grafo completo</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Popover / Drawer do Subagente Selecionado */}
      {selectedSubagent && (
        <div className="bg-[#12151C] border border-white/[0.12] rounded-xl p-4 shadow-lg animate-fade-in space-y-3 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-mono text-xs font-bold text-zinc-300">
                {selectedSubagent.role[0]}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-zinc-200 font-mono">
                  {selectedSubagent.role}
                </h4>
                <span className="text-[10px] text-zinc-500 font-mono">
                  ID: {selectedSubagent.id.slice(-8)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400 capitalize">
                Status: <strong className="text-zinc-200">{selectedSubagent.status}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedSubagent(null)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="text-[11px] text-zinc-400">
              <strong className="text-zinc-500 uppercase font-mono text-[10px] block">Objetivo:</strong>
              {selectedSubagent.goal}
            </div>
            {selectedSubagent.currentTask && (
              <div className="text-[11px] text-zinc-300 bg-[#090A0F] p-2 rounded border border-white/[0.04] font-mono">
                <strong className="text-zinc-500 uppercase text-[10px] block font-sans">Tarefa em curso:</strong>
                {selectedSubagent.currentTask}
              </div>
            )}
            {selectedSubagent.toolsUsed && selectedSubagent.toolsUsed.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 pt-1 font-mono">
                <span className="text-zinc-500">Ferramentas:</span>
                {selectedSubagent.toolsUsed.map((t) => (
                  <span key={t} className="px-1.5 py-0.2 rounded bg-white/[0.04] border border-white/[0.06] text-zinc-300">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 3. BARRA DE MÉTRICAS COMPACTAS (SEM CARDS VAZIOS - Ponto 2) ================= */}
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        <button
          type="button"
          onClick={() => onNavigateTab("timeline")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12151C] border border-white/[0.06] hover:border-white/[0.12] transition text-xs cursor-pointer group"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-300 font-medium">Tarefas:</span>
          <span className="font-mono font-bold text-zinc-100">{completedTasks}/{session.tasks.length}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("files_artifacts", "files")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12151C] border border-white/[0.06] hover:border-white/[0.12] transition text-xs cursor-pointer group"
        >
          <Folder className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-zinc-300 font-medium">Arquivos:</span>
          <span className="font-mono font-bold text-zinc-100">{filesCount}</span>
        </button>

        {changesCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigateTab("files_artifacts", "changes")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/30 transition text-xs cursor-pointer group"
          >
            <GitCommit className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-amber-200 font-medium">Diffs:</span>
            <span className="font-mono font-bold text-amber-100">{changesCount}</span>
          </button>
        )}

        {artifactsCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigateTab("files_artifacts", "artifacts")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12151C] border border-white/[0.06] hover:border-white/[0.12] transition text-xs cursor-pointer group"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-zinc-300 font-medium">Artefatos:</span>
            <span className="font-mono font-bold text-zinc-100">{artifactsCount}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigateTab("logs_terminal", "terminals")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12151C] border border-white/[0.06] hover:border-white/[0.12] transition text-xs cursor-pointer group"
        >
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-300 font-medium">Terminais:</span>
          <span className="font-mono font-bold text-zinc-100">{terminalsCount}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab("logs_terminal", "evidence")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#12151C] border border-white/[0.06] hover:border-white/[0.12] transition text-xs cursor-pointer group"
        >
          <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-zinc-300 font-medium">Evidências:</span>
          <span className="font-mono font-bold text-zinc-100">{evidenceCount}</span>
        </button>
      </div>

      {/* ================= 4. COCKPIT OPERACIONAL AO VIVO ================= */}

      {/* Alerta de Autorização Pendente (Se Houver) */}
      {pendingPermissions.length > 0 && onResolvePermission && (
        <div className="bg-amber-950/20 border border-amber-900/50 rounded-xl p-4 space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Autorização Necessária para Ação de Risco ({pendingPermissions[0].risk})</span>
            </div>
            <span className="text-[10px] font-mono text-amber-400">Zero-Trust Guard</span>
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            {pendingPermissions[0].reason}
          </p>
          {pendingPermissions[0].command && (
            <pre className="p-2 bg-[#090A0F] border border-amber-900/40 rounded font-mono text-[11px] text-amber-300 overflow-x-auto">
              {pendingPermissions[0].command}
            </pre>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onResolvePermission(pendingPermissions[0].id, "allow_for_task")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-400 text-zinc-950 font-semibold hover:bg-amber-300 transition cursor-pointer shadow-sm"
            >
              Autorizar Execução
            </button>
            <button
              type="button"
              onClick={() => onResolvePermission(pendingPermissions[0].id, "deny")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/[0.08] transition cursor-pointer"
            >
              Recusar
            </button>
          </div>
        </div>
      )}

      {/* ================= 4. CHECKLIST DE ETAPAS / RACIOCÍNIO AO VIVO (ESTILO ANTIGRAVITY) ================= */}
      {session.tasks && session.tasks.length > 0 && (
        <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold text-zinc-300 uppercase tracking-wider">
                {session.status === "running" ? "Raciocínio & Ação ao Vivo" : "Etapas Executadas"}
              </span>
              {session.status === "running" && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </div>
            <span className="text-[11px] font-mono text-zinc-400">
              {completedTasks}/{session.tasks.length} concluídas
            </span>
          </div>

          <div className="space-y-1.5 pt-1 font-mono text-xs">
            {session.tasks.map((task) => {
              const isSuccess = task.status === "success";
              const isRunning = task.status === "running";

              return (
                <div
                  key={task.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg transition-all ${
                    isRunning
                      ? "bg-indigo-500/10 border border-indigo-500/30 text-indigo-200"
                      : isSuccess
                      ? "bg-white/[0.02] text-zinc-300"
                      : "text-zinc-500"
                  }`}
                >
                  {isSuccess ? (
                    <span className="text-emerald-400 font-bold select-none text-xs">✓</span>
                  ) : isRunning ? (
                    <span className="text-indigo-400 font-bold select-none text-xs animate-pulse">●</span>
                  ) : (
                    <span className="text-zinc-600 select-none text-xs">○</span>
                  )}
                  <span className={`flex-1 truncate ${isSuccess ? "text-zinc-400" : isRunning ? "font-semibold text-zinc-200" : ""}`}>
                    {task.title}
                  </span>
                  {task.tool && (
                    <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                      {task.tool}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card da Tarefa Ativa */}
      {runningTask && (
        <div className="bg-[#12151C] border border-indigo-500/30 rounded-xl p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 font-mono">
                Executando Agora: {runningTask.title}
              </h3>
            </div>
            <span className="text-[11px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {runningTask.tool || "lógica"}
            </span>
          </div>

          {runningTask.command && (
            <pre className="p-2.5 bg-[#0C0D12] border border-white/[0.06] rounded-lg font-mono text-[11px] text-zinc-300 overflow-x-auto">
              {runningTask.command}
            </pre>
          )}

          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono pt-1">
            <span>Tentativa {runningTask.attempts} de {runningTask.maxAttempts}</span>
            <button
              type="button"
              onClick={() => onNavigateTab("timeline")}
              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
            >
              <span>Ver no grafo</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Terminal Live Preview (Monospace limpo com output recente) */}
      {latestTerminal && (
        <div className="bg-[#12151C] border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-[#12151C] border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              <span>{latestTerminal.name} ({latestTerminal.shell})</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500 truncate max-w-sm">{latestTerminal.command}</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("logs_terminal", "terminals")}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono flex items-center gap-1 transition"
            >
              <span>Abrir terminal</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-3.5 bg-[#0C0D12] font-mono text-[11px] text-zinc-300 max-h-48 overflow-y-auto leading-relaxed">
            <pre className="whitespace-pre-wrap">{latestTerminal.output.slice(-800)}</pre>
          </div>
        </div>
      )}

      {/* ================= 5. RESULTADOS PERSISTENTES (SOMENTE SE HOUVER DADOS - Ponto 2) ================= */}
      {(artifactsCount > 0 || changesCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Artefatos Recentes (Aparece SOMENTE se artifactsCount > 0) */}
          {artifactsCount > 0 && (
            <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                    Artefatos Produzidos ({artifactsCount})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab("files_artifacts", "artifacts")}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  Ver todos
                </button>
              </div>

              <div className="space-y-1.5">
                {session.artifacts?.slice(0, 3).map((art) => (
                  <div
                    key={art.id}
                    onClick={() => onNavigateTab("files_artifacts", "artifacts")}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#090A0F] border border-white/[0.04] hover:border-white/[0.1] cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-xs">📄</span>
                      <span className="text-xs font-mono text-zinc-200 truncate">{art.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">{art.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mudanças Recentes (Aparece SOMENTE se changesCount > 0) */}
          {changesCount > 0 && (
            <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitCommit className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                    Alterações de Código ({changesCount})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab("files_artifacts", "changes")}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  Revisar diffs
                </button>
              </div>

              <div className="space-y-1.5">
                {session.changes?.slice(0, 3).map((chg) => (
                  <div
                    key={chg.id}
                    onClick={() => onNavigateTab("files_artifacts", "changes")}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#090A0F] border border-white/[0.04] hover:border-white/[0.1] cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                          chg.type === "A"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : chg.type === "D"
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-slate-500/10 text-slate-300"
                        }`}
                      >
                        {chg.type}
                      </span>
                      <span className="text-xs font-mono text-zinc-300 truncate">{chg.path}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">{chg.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
