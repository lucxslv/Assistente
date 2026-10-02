import React, { useState } from "react";
import {
  AgentSession,
  AgentLogEntry,
  AgentLogCategory,
  PermissionRequest,
  RiskLevel,
} from "../../types";
import { WorkspaceTerminals } from "./WorkspaceTerminals";
import { WorkspaceEvidence } from "./WorkspaceEvidence";
import {
  Terminal,
  FileText,
  FileCheck,
  Shield,
  Search,
  Copy,
  Check,
} from "lucide-react";

interface WorkspaceLogsAndTerminalProps {
  session: AgentSession;
  logs: AgentLogEntry[];
  permissions?: PermissionRequest[];
  pendingPermissions?: PermissionRequest[];
  onResolvePermission?: (
    reqId: string,
    decision: "allow_once" | "allow_for_task" | "deny"
  ) => void;
  defaultSubTab?: "terminals" | "logs" | "evidence" | "permissions";
}

export const WorkspaceLogsAndTerminal: React.FC<WorkspaceLogsAndTerminalProps> = ({
  session,
  logs,
  permissions = [],
  pendingPermissions = [],
  onResolvePermission,
  defaultSubTab = "terminals",
}) => {
  const terminalsCount = session.terminals?.length || 0;
  const evidenceCount = session.evidence?.length || 0;
  const pendingCount = pendingPermissions.length;

  const [subTab, setSubTab] = useState<"terminals" | "logs" | "evidence" | "permissions">(
    () => {
      if (pendingCount > 0) return "permissions";
      if (terminalsCount > 0) return "terminals";
      return defaultSubTab;
    }
  );

  const [logFilter, setLogFilter] = useState<AgentLogCategory | "ALL">("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesCategory = logFilter === "ALL" || log.category === logFilter;
    const matchesSearch =
      !logSearch ||
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.category.toLowerCase().includes(logSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCopyLog = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const renderRiskBadge = (risk: RiskLevel) => {
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
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5] select-none">
      {/* Sub-Header Compacto: Seletor de Categoria */}
      <div className="px-6 py-2.5 border-b border-white/[0.08] bg-[#12151C]/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab("terminals")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === "terminals"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminais Ativos</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
              {terminalsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("logs")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === "logs"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Console do Agente</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
              {logs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("evidence")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === "evidence"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Evidências</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-300">
              {evidenceCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("permissions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 relative ${
              subTab === "permissions"
                ? "bg-white/[0.12] text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Permissões</span>
            {pendingCount > 0 ? (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                {pendingCount}
              </span>
            ) : (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-zinc-400">
                0
              </span>
            )}
          </button>
        </div>

        <div className="text-[11px] font-mono text-zinc-500 hidden sm:block">
          {subTab === "terminals" && "Saída bruta PowerShell / CMD"}
          {subTab === "logs" && "Trilha operacional e decisões do Brain"}
          {subTab === "evidence" && "Validações empíricas do Verificador"}
          {subTab === "permissions" && "Supervisão Zero-Trust de ações de risco"}
        </div>
      </div>

      {/* Área de Visualização */}
      <div className="flex-1 overflow-hidden">
        {/* Visualizador de Terminais */}
        {subTab === "terminals" && (
          <WorkspaceTerminals terminals={session.terminals || []} />
        )}

        {/* Visualizador de Evidências */}
        {subTab === "evidence" && (
          <WorkspaceEvidence evidence={session.evidence || []} />
        )}

        {/* Visualizador de Console de Logs */}
        {subTab === "logs" && (
          <div className="flex flex-col h-full overflow-hidden p-6 space-y-4">
            {/* Filtros e Busca */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12151C] p-3 rounded-xl border border-white/[0.08]">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(["ALL", "SYSTEM", "AGENT", "TOOL", "PERMISSION", "VERIFIER", "REPLANNER", "ERROR"] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLogFilter(cat)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
                        logFilter === cat
                          ? "bg-white/[0.12] text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      {cat}
                    </button>
                  )
                )}
              </div>

              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filtrar saída..."
                  className="w-full bg-[#090A0F] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            {/* Lista Monospace de Logs */}
            <div className="flex-1 overflow-y-auto bg-[#0C0D12] border border-white/[0.06] rounded-xl p-4 font-mono text-xs space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="text-zinc-500 text-center py-10">
                  Nenhum registro encontrado com os filtros atuais.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded hover:bg-white/[0.02] flex items-start justify-between gap-3 group transition"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-[10px] text-zinc-600 flex-shrink-0 pt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded flex-shrink-0 ${
                          log.category === "ERROR"
                            ? "bg-rose-950/80 text-rose-300 border border-rose-800/50"
                            : log.category === "PERMISSION"
                            ? "bg-amber-950/80 text-amber-300 border border-amber-800/50"
                            : log.category === "VERIFIER"
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/50"
                            : "bg-white/[0.06] text-zinc-400"
                        }`}
                      >
                        {log.category}
                      </span>
                      <span className="text-zinc-300 break-words leading-relaxed">
                        {log.message}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyLog(log.id, log.message)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition p-1"
                      title="Copiar log"
                    >
                      {copiedLogId === log.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Visualizador de Permissões */}
        {subTab === "permissions" && (
          <div className="h-full overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 font-mono">
                  Controle de Permissões Zero-Trust
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Todas as ações arriscadas exigem autorização expressa antes da execução no SO.
                </p>
              </div>
            </div>

            {permissions.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 border border-dashed border-white/[0.08] rounded-xl bg-[#12151C]/60">
                <Shield className="w-6 h-6 mx-auto mb-2 opacity-30 text-zinc-400" />
                <p className="text-xs">Nenhuma solicitação de permissão pendente ou registrada.</p>
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
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(perm.requestedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-2">{perm.reason}</p>
                      </div>

                      {perm.status === "pending" && onResolvePermission && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onResolvePermission(perm.id, "allow_once")}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition cursor-pointer"
                          >
                            Permitir Uma Vez
                          </button>
                          <button
                            type="button"
                            onClick={() => onResolvePermission(perm.id, "allow_for_task")}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 transition cursor-pointer shadow-sm"
                          >
                            Permitir na Tarefa
                          </button>
                          <button
                            type="button"
                            onClick={() => onResolvePermission(perm.id, "deny")}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-900/40 transition cursor-pointer"
                          >
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>

                    {perm.command && (
                      <pre className="p-2.5 bg-[#0C0D12] border border-white/[0.06] rounded-lg font-mono text-[11px] text-zinc-300 overflow-x-auto">
                        {perm.command}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
