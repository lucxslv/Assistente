import React, { useState } from "react";
import {
  AgentSession,
  AgentLogEntry,
  PermissionRequest,
} from "../../types";
import { WorkspaceOverview } from "./WorkspaceOverview";
import { WorkspaceTimeline } from "./WorkspaceTimeline";
import { WorkspaceFilesAndArtifacts } from "./WorkspaceFilesAndArtifacts";
import { WorkspaceLogsAndTerminal } from "./WorkspaceLogsAndTerminal";
import {
  Activity,
  GitFork,
  Layers,
  Terminal,
} from "lucide-react";

export type WorkspaceTab =
  | "live"
  | "timeline"
  | "files_artifacts"
  | "logs_terminal";

interface AgentWorkspaceProps {
  session?: AgentSession | null;
  initialTab?: WorkspaceTab;
  initialSubTab?: string;
  selectedArtifactId?: string;
  logs?: AgentLogEntry[];
  permissions?: PermissionRequest[];
  pendingPermissions?: PermissionRequest[];
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
  onResolvePermission?: (
    reqId: string,
    decision: "allow_once" | "allow_for_task" | "deny"
  ) => void;
  onRetryTask?: (taskId: string) => void;
}

export const AgentWorkspace: React.FC<AgentWorkspaceProps> = ({
  session,
  initialTab,
  initialSubTab,
  selectedArtifactId,
  logs = [],
  permissions = [],
  pendingPermissions = [],
  onReviewChange,
  onResolvePermission,
  onRetryTask,
}) => {
  // Visualização de Co-piloto Pronto quando não há tarefas ativas
  if (!session) {
    return (
      <div className="flex flex-col h-full w-full bg-[#090A0F] text-[#F2F3F5] p-5 justify-between select-none overflow-y-auto">
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#12151C] border border-white/[0.08] shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div>
              <div className="text-xs font-semibold text-zinc-100 font-mono uppercase tracking-wider">
                Charlie Agent Runtime
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Co-piloto inteligente ativo e pronto para agir
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
              Como funciona o trabalho em tempo real
            </span>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Você não precisa preencher formulários ou disparar tarefas mecânicas. A conversa no chat é a interface primária.
            </p>
            <div className="p-3 bg-[#12151C] rounded-lg border border-white/[0.06] font-mono text-xs text-indigo-300 space-y-1">
              <div className="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider mb-1">
                Ciclo Contínuo:
              </div>
              <div>Chat → Contexto → Raciocínio → Decisão → Ação</div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
              Exemplos para experimentar no chat
            </span>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[#12151C] border border-white/[0.06] text-zinc-300 font-mono leading-relaxed">
                "Analisa esse sistema de autenticação e vê se tem algum problema de arquitetura."
              </div>
              <div className="p-2.5 rounded-lg bg-[#12151C] border border-white/[0.06] text-zinc-300 font-mono leading-relaxed">
                "Quero refatorar essa parte do projeto. O que você acha que deveríamos fazer?"
              </div>
              <div className="p-2.5 rounded-lg bg-[#12151C] border border-white/[0.06] text-zinc-300 font-mono leading-relaxed">
                "Analisa meu computador e me devolve o máximo de informações possível."
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>Zero-Trust: Ativo</span>
          <span>Painel Lateral: Conectado</span>
        </div>
      </div>
    );
  }

  // Se houver um artefato selecionado, ou artefatos recém gerados, inicializa em files_artifacts
  const defaultTab: WorkspaceTab =
    initialTab ||
    (selectedArtifactId || (session.artifacts?.length || 0) > 0
      ? "files_artifacts"
      : "live");

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(defaultTab);
  const [subTabHint, setSubTabHint] = useState<string | undefined>(
    initialSubTab || (selectedArtifactId ? "artifacts" : undefined)
  );

  const artifactsCount = session.artifacts?.length || 0;
  const filesCount = session.files?.length || 0;
  const changesCount = session.changes?.length || 0;
  const terminalsCount = session.terminals?.length || 0;
  const pendingCount = pendingPermissions.length;

  const handleNavigate = (
    tab: "live" | "timeline" | "files_artifacts" | "logs_terminal",
    subTab?: string
  ) => {
    setActiveTab(tab);
    if (subTab) {
      setSubTabHint(subTab);
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5] select-none">
      {/* ================= BARRA ÚNICA DE NAVEGAÇÃO PRINCIPAL (4 SEÇÕES) ================= */}
      <div className="px-6 border-b border-white/[0.08] bg-[#12151C]/60 backdrop-blur-md flex items-center justify-between overflow-x-auto text-xs">
        <nav className="flex space-x-1 py-1">
          {/* 1. Execução / Live */}
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer ${
              activeTab === "live"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>Execução / Live</span>
            {session.status === "running" && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            )}
          </button>

          {/* 2. Linha do Tempo / DAG */}
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer ${
              activeTab === "timeline"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <GitFork className="w-3.5 h-3.5 text-slate-400" />
            <span>Linha do Tempo / DAG</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
              {session.tasks.filter((t) => t.status === "success").length}/{session.tasks.length}
            </span>
          </button>

          {/* 3. Arquivos & Artefatos */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("files_artifacts");
              setSubTabHint(undefined);
            }}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer ${
              activeTab === "files_artifacts"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Arquivos & Artefatos</span>
            {(filesCount > 0 || artifactsCount > 0 || changesCount > 0) && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {filesCount + artifactsCount + changesCount}
              </span>
            )}
          </button>

          {/* 4. Logs & Terminal */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("logs_terminal");
              setSubTabHint(undefined);
            }}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-2 cursor-pointer relative ${
              activeTab === "logs_terminal"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>Logs & Terminal</span>
            {pendingCount > 0 ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />
            ) : terminalsCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {terminalsCount}
              </span>
            ) : null}
          </button>
        </nav>

        <div className="text-[11px] font-mono text-zinc-500 hidden md:block">
          Charlie Agent Workspace 1.2
        </div>
      </div>

      {/* ================= ÁREA DE CONTEÚDO ================= */}
      <div className="flex-1 overflow-hidden">
        {/* 1. Execução / Live */}
        {activeTab === "live" && (
          <WorkspaceOverview
            session={session}
            onNavigateTab={handleNavigate}
            pendingPermissions={pendingPermissions}
            onResolvePermission={onResolvePermission}
          />
        )}

        {/* 2. Linha do Tempo / DAG */}
        {activeTab === "timeline" && (
          <WorkspaceTimeline
            session={session}
            onRetryTask={onRetryTask}
          />
        )}

        {/* 3. Arquivos & Artefatos */}
        {activeTab === "files_artifacts" && (
          <WorkspaceFilesAndArtifacts
            session={session}
            onReviewChange={onReviewChange}
            defaultSubTab={subTabHint as any}
            selectedArtifactId={selectedArtifactId}
          />
        )}

        {/* 4. Logs & Terminal */}
        {activeTab === "logs_terminal" && (
          <WorkspaceLogsAndTerminal
            session={session}
            logs={logs}
            permissions={permissions}
            pendingPermissions={pendingPermissions}
            onResolvePermission={onResolvePermission}
            defaultSubTab={subTabHint as any}
          />
        )}
      </div>
    </div>
  );
};
