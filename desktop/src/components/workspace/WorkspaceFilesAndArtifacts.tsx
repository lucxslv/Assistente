import React, { useState } from "react";
import { AgentSession } from "../../types";
import { WorkspaceFiles } from "./WorkspaceFiles";
import { WorkspaceChanges } from "./WorkspaceChanges";
import { WorkspaceArtifacts } from "./WorkspaceArtifacts";
import { Folder, GitCommit, FileCode } from "lucide-react";

interface WorkspaceFilesAndArtifactsProps {
  session: AgentSession;
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
  defaultSubTab?: "files" | "changes" | "artifacts";
}

export const WorkspaceFilesAndArtifacts: React.FC<WorkspaceFilesAndArtifactsProps> = ({
  session,
  onReviewChange,
  defaultSubTab,
}) => {
  const filesCount = session.files?.length || 0;
  const changesCount = session.changes?.length || 0;
  const artifactsCount = session.artifacts?.length || 0;

  // Seleciona inteligentemente a sub-aba que tem conteúdo ou o default informado
  const [subTab, setSubTab] = useState<"files" | "changes" | "artifacts">(() => {
    if (defaultSubTab) return defaultSubTab;
    if (changesCount > 0) return "changes";
    if (artifactsCount > 0) return "artifacts";
    return "files";
  });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5] select-none">
      {/* Sub-Header Compacto: Filtro por Categoria */}
      <div className="px-6 py-2.5 border-b border-white/[0.08] bg-[#12151C]/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab("files")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === "files"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Arquivos</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
              {filesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("changes")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === "changes"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>Mudanças & Diffs</span>
            {changesCount > 0 ? (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {changesCount}
              </span>
            ) : (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-400">
                0
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab("artifacts")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === "artifacts"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Artefatos Gerados</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
              {artifactsCount}
            </span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-zinc-500 hidden sm:block">
          {subTab === "files" && "Explorador de arquivos catalogados no disco"}
          {subTab === "changes" && "Revisão atômica de alterações de código"}
          {subTab === "artifacts" && "Documentos, relatórios e saídas estruturadas"}
        </div>
      </div>

      {/* Área de Visualização */}
      <div className="flex-1 overflow-hidden">
        {subTab === "files" && <WorkspaceFiles files={session.files || []} />}
        {subTab === "changes" && (
          <WorkspaceChanges
            changes={session.changes || []}
            onReviewChange={onReviewChange}
          />
        )}
        {subTab === "artifacts" && (
          <WorkspaceArtifacts artifacts={session.artifacts || []} />
        )}
      </div>
    </div>
  );
};
