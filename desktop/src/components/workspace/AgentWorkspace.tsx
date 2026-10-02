import React, { useState } from "react";
import { AgentSession } from "../../types";
import { WorkspaceOverview } from "./WorkspaceOverview";
import { WorkspaceArtifacts } from "./WorkspaceArtifacts";
import { WorkspaceFiles } from "./WorkspaceFiles";
import { WorkspaceChanges } from "./WorkspaceChanges";
import { WorkspaceTerminals } from "./WorkspaceTerminals";
import { WorkspaceEvidence } from "./WorkspaceEvidence";
import { WorkspaceSubagents } from "./WorkspaceSubagents";
import { WorkspaceBackgroundTasks } from "./WorkspaceBackgroundTasks";
import { WorkspaceUploadsMedia } from "./WorkspaceUploadsMedia";
import {
  LayoutDashboard,
  FileCode,
  Folder,
  GitCommit,
  Terminal,
  FileCheck,
  Cpu,
  Layers,
  Image as ImageIcon,
} from "lucide-react";

export type WorkspaceTab =
  | "overview"
  | "artifacts"
  | "files"
  | "changes"
  | "terminals"
  | "evidence"
  | "subagents"
  | "background"
  | "media";

interface AgentWorkspaceProps {
  session: AgentSession;
  initialTab?: WorkspaceTab;
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
  onResolvePermission?: (reqId: string) => void;
}

export const AgentWorkspace: React.FC<AgentWorkspaceProps> = ({
  session,
  initialTab = "overview",
  onReviewChange,
  onResolvePermission,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);

  const artifactsCount = session.artifacts?.length || 0;
  const filesCount = session.files?.length || 0;
  const changesCount = session.changes?.length || 0;
  const terminalsCount = session.terminals?.length || 0;
  const evidenceCount = session.evidence?.length || 0;
  const bgCount = session.backgroundTasks?.length || 0;
  const mediaCount = (session.media?.length || 0) + (session.uploads?.length || 0);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5] select-none">
      {/* ================= Barra de Navegação Superior do Workspace ================= */}
      <div className="px-6 border-b border-white/[0.08] bg-[#12151C]/60 backdrop-blur-md flex items-center justify-between overflow-x-auto text-xs">
        <nav className="flex space-x-1 py-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "overview"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Visão Geral</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("artifacts")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "artifacts"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Artefatos</span>
            {artifactsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {artifactsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "files"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Arquivos</span>
            {filesCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {filesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("changes")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "changes"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Mudanças</span>
            {changesCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {changesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("terminals")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "terminals"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminais</span>
            {terminalsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {terminalsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("evidence")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "evidence"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Evidências</span>
            {evidenceCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                {evidenceCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("subagents")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "subagents"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Subagentes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("background")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "background"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Segundo Plano</span>
            {bgCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {bgCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("media")}
            className={`py-2 px-3 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "media"
                ? "bg-white/[0.12] text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Mídia & Uploads</span>
            {mediaCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
                {mediaCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* ================= Painel Operacional Renderizado ================= */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "overview" && (
          <WorkspaceOverview
            session={session}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}
        {activeTab === "artifacts" && (
          <WorkspaceArtifacts artifacts={session.artifacts || []} />
        )}
        {activeTab === "files" && (
          <WorkspaceFiles files={session.files || []} />
        )}
        {activeTab === "changes" && (
          <WorkspaceChanges
            changes={session.changes || []}
            onReviewChange={onReviewChange}
          />
        )}
        {activeTab === "terminals" && (
          <WorkspaceTerminals terminals={session.terminals || []} />
        )}
        {activeTab === "evidence" && (
          <WorkspaceEvidence evidence={session.evidence || []} />
        )}
        {activeTab === "subagents" && (
          <WorkspaceSubagents subagents={session.subagents || []} />
        )}
        {activeTab === "background" && (
          <WorkspaceBackgroundTasks
            tasks={session.backgroundTasks || []}
            onResolvePermission={onResolvePermission}
          />
        )}
        {activeTab === "media" && (
          <WorkspaceUploadsMedia
            uploads={session.uploads || []}
            media={session.media || []}
          />
        )}
      </div>
    </div>
  );
};
