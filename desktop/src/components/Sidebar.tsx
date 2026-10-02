import React, { useState, useMemo } from "react";
import {
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  MoreHorizontal,
  Keyboard,
  User,
  MessageSquare,
  Cpu,
  Folder,
  Shield,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
} from "lucide-react";
import { Thread } from "../types";
import { SystemStatus, LocalSystemMetrics, UserProfile } from "../services/api";
import { useAgentRuntime } from "../services/agentRuntimeStore";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  onRenameThread?: (id: string, newName: string) => void;
  onOpenSettings: () => void;
  onOpenShortcuts?: () => void;
  onOpenCommandPalette?: () => void;
  user?: UserProfile | null;
  onOpenAuth?: () => void;
  isConnected: boolean;
  systemStatus: SystemStatus | null;
  localMetrics?: LocalSystemMetrics;
  activeView?: "chat" | "agent";
  onSelectView?: (view: "chat" | "agent") => void;
  isAgentActive?: boolean;
}

interface ThreadGroup {
  title: string;
  threads: Thread[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onRenameThread,
  onOpenSettings,
  onOpenShortcuts,
  onOpenCommandPalette,
  user,
  onOpenAuth,
  isConnected,
  systemStatus,
  localMetrics,
  activeView = "chat",
  onSelectView,
  isAgentActive = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const {
    session: agentSession,
    history: agentHistory,
    loadSession,
    clearSession,
    deleteHistorySession,
    pendingPermissions,
  } = useAgentRuntime();

  // Status de conexão e atividade
  const getStatusText = () => {
    if (!isConnected) return "Offline";
    if (systemStatus?.status === "executing_tool") return systemStatus.active_tool || "Executando...";
    if (systemStatus?.status === "thinking") return "Pensando...";
    if (systemStatus?.status === "speaking") return "Falando...";
    return "Online";
  };

  // Hardware Telemetry
  const cpuPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round(localMetrics?.cpu_percent ?? systemStatus?.host?.cpu_percent ?? 0)
    )
  );

  const ramUsedGb = (
    localMetrics?.memory_used_gb ?? (systemStatus?.host?.memory_used_mb ?? 0) / 1024
  ).toFixed(1);

  const ramTotalGb = (
    localMetrics?.memory_total_gb ?? (systemStatus?.host?.memory_total_mb ?? 0) / 1024
  ).toFixed(1);

  const ramPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        localMetrics?.memory_percent ?? systemStatus?.host?.memory_percent ?? 0
      )
    )
  );

  // Filtro de busca
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) => (t.name || "Conversa sem título").toLowerCase().includes(q));
  }, [threads, searchQuery]);

  // Agrupamento temporal: Hoje, Ontem, Últimos 7 dias, Anteriores
  const groupedThreads = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const last7DaysStart = todayStart - 7 * 86400000;

    const groups: { [key: string]: Thread[] } = {
      Hoje: [],
      Ontem: [],
      "Últimos 7 dias": [],
      Anteriores: [],
    };

    filteredThreads.forEach((t) => {
      const threadDate = t.createdAt ? new Date(t.createdAt).getTime() : now.getTime();
      if (threadDate >= todayStart) {
        groups["Hoje"].push(t);
      } else if (threadDate >= yesterdayStart) {
        groups["Ontem"].push(t);
      } else if (threadDate >= last7DaysStart) {
        groups["Últimos 7 dias"].push(t);
      } else {
        groups["Anteriores"].push(t);
      }
    });

    const result: ThreadGroup[] = [];
    if (groups["Hoje"].length > 0) result.push({ title: "Hoje", threads: groups["Hoje"] });
    if (groups["Ontem"].length > 0) result.push({ title: "Ontem", threads: groups["Ontem"] });
    if (groups["Últimos 7 dias"].length > 0)
      result.push({ title: "Últimos 7 dias", threads: groups["Últimos 7 dias"] });
    if (groups["Anteriores"].length > 0)
      result.push({ title: "Anteriores", threads: groups["Anteriores"] });

    return result;
  }, [filteredThreads]);

  const handleStartRename = (thread: Thread, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditingName(thread.name || "Nova conversa");
  };

  const handleSaveRename = (threadId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingName.trim() && onRenameThread) {
      onRenameThread(threadId, editingName.trim());
    }
    setEditingThreadId(null);
  };

  return (
    <aside className="w-[260px] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col p-5 select-none h-full shrink-0">
      {/* 1. Header do Logo e Status */}
      <div className="px-2 py-1 mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <img
              src="/charlie-logo.svg"
              alt="Charlie"
              className="w-5 h-5 object-contain drop-shadow-[0_0_10px_rgba(139,124,255,0.4)]"
            />
            <span className="text-[16px] font-semibold tracking-[-0.3px] text-[var(--text-primary)]">
              Charlie
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] pl-7">
            <div
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isConnected
                  ? "bg-[var(--success)] shadow-sm shadow-[var(--success)]/50"
                  : "bg-zinc-500"
              }`}
            />
            <span>{getStatusText()}</span>
          </div>
        </div>

        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
            title="Central de Atalhos (Ctrl+/)"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="h-[1px] bg-white/[0.06] my-2.5" />

      {/* 2. Navegação Principal: Chat vs Agent Command Center */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#12151C] border border-white/[0.08] rounded-lg mb-2.5">
        <button
          type="button"
          onClick={() => onSelectView?.("chat")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition cursor-pointer ${
            activeView === "chat"
              ? "bg-[#1C202A] text-zinc-200 shadow-sm border border-white/[0.08]"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
          <span>Chat</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView?.("agent")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition cursor-pointer relative ${
            activeView === "agent"
              ? "bg-[#1C202A] text-zinc-200 shadow-sm border border-white/[0.08]"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span>Agente</span>
          {isAgentActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse absolute top-1 right-1" />
          )}
        </button>
      </div>

      {activeView === "agent" ? (
        /* ================= SEÇÃO EXCLUSIVA DO AGENTE & AMBIENTE ================= */
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Botão de Nova Missão */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => clearSession()}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shadow-sm cursor-pointer w-full"
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-900" />
              <span>+ Novo Objetivo</span>
            </button>
          </div>

          {/* Card de Contexto do Ambiente Local */}
          <div className="bg-[#12151C] border border-white/[0.08] rounded-xl p-3 mb-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-slate-400" />
                Ambiente Local
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-zinc-200 truncate">assistente</div>
                  <div className="text-[9.5px] text-zinc-500 font-mono truncate">~/OneDrive/Documentos/assistente</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1.5 border-t border-white/[0.06]">
                <span className="flex items-center gap-1 text-[10.5px]">
                  <Shield className="w-3 h-3 text-zinc-500" />
                  Segurança
                </span>
                {pendingPermissions.length > 0 ? (
                  <span className="text-amber-400 font-medium font-mono text-[10px] bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                    {pendingPermissions.length} pendente(s)
                  </span>
                ) : (
                  <span className="text-zinc-500 font-mono text-[10px]">Zero-Trust</span>
                )}
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-white/[0.06] my-1.5" />

          {/* Lista de Missões do Agente (Independente do Chat) */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1 -mr-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 px-2 pt-1 pb-1 uppercase tracking-wider">
              <span>Missões do Agente</span>
              <span className="text-[10px] font-mono bg-white/[0.06] text-zinc-400 px-1.5 py-0.2 rounded-full">
                {agentHistory.length}
              </span>
            </div>

            {agentHistory.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-zinc-500 px-4">
                Nenhum objetivo registrado ainda.
              </div>
            ) : (
              agentHistory.map((m) => {
                const isSelected = agentSession?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => loadSession(m)}
                    className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors border ${
                      isSelected
                        ? "bg-[#1C202A] border-white/[0.12] text-zinc-100 font-medium"
                        : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1 pr-1">
                      <div className="mt-0.5 shrink-0">
                        {m.status === "completed" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : m.status === "failed" ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        ) : m.status === "running" ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-zinc-200 font-medium">
                          {m.goal}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                          <span>{m.progress}%</span>
                          <span>•</span>
                          <span>{m.tasks ? m.tasks.length : 0} etapas</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteHistorySession(m.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 rounded transition cursor-pointer"
                      title="Excluir missão do histórico"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ================= SEÇÃO EXCLUSIVA DO CHAT CONVERSACIONAL ================= */
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 3. Ações: + Nova conversa e ⌕ Pesquisar */}
          <div className="flex flex-col gap-1 mb-2">
            <button
              type="button"
              onClick={onNewThread}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-[var(--text-primary)] font-medium bg-transparent hover:bg-[var(--surface-hover)] transition-colors text-[13px] w-full text-left cursor-pointer"
            >
              <span>+</span> Nova conversa
            </button>

            {/* Campo de Pesquisa Expansível */}
            {isSearching ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] border border-[var(--border)]">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Pesquisar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsSearching(false);
                      setSearchQuery("");
                    }
                  }}
                  className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsSearching(false);
                    setSearchQuery("");
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSearching(true)}
                className="flex items-center justify-between px-2.5 py-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent hover:bg-[var(--surface-hover)] transition-colors text-[13px] w-full text-left cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>⌕</span> Pesquisar
                </span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
                  Ctrl+F
                </kbd>
              </button>
            )}

            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors text-[12px] w-full text-left cursor-pointer"
                title="Paleta de Comandos Rápidos (Ctrl+K)"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[11px]">⌘</span> Paleta rápida
                </span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-muted)]">
                  Ctrl+K
                </kbd>
              </button>
            )}
          </div>

          <div className="h-[1px] bg-[var(--border)] my-3" />

          {/* 3. Lista de Conversas com Agrupamento Temporal */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 pr-1 -mr-2">
            {groupedThreads.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">
                {searchQuery ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
              </div>
            ) : (
              groupedThreads.map((group) => (
                <div key={group.title} className="mb-2">
                  <div className="text-[11px] font-medium text-[var(--text-muted)] px-2.5 pt-2 pb-1.5 uppercase tracking-[0.5px]">
                    {group.title}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.threads.map((t) => {
                      const isActive = t.id === activeThreadId;
                      const isEditing = editingThreadId === t.id;

                      return (
                        <div
                          key={t.id}
                          onClick={() => !isEditing && onSelectThread(t.id)}
                          className={`group relative flex items-center justify-between px-2.5 py-2 rounded-[var(--radius-sm)] text-[13px] cursor-pointer transition-colors border ${
                            isActive
                              ? "bg-[var(--accent-soft-bg)] border-[var(--accent-soft-border)] text-[var(--accent-hover)] font-medium"
                              : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {isEditing ? (
                            <form
                              onSubmit={(e) => handleSaveRename(t.id, e)}
                              className="flex items-center gap-1.5 w-full"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => handleSaveRename(t.id)}
                                className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] px-1.5 py-0.5 rounded text-[12px] outline-none"
                              />
                              <button
                                type="submit"
                                className="p-1 hover:text-[var(--success)]"
                                title="Salvar"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </form>
                          ) : (
                            <>
                              <span className="truncate flex-1 pr-2">
                                {t.name || "Conversa sem título"}
                              </span>

                              {/* Ações de Hover (Renomear / Excluir) */}
                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                                {onRenameThread && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleStartRename(t, e)}
                                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded"
                                    title="Renomear conversa"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => onDeleteThread(t.id, e)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-elevated)] rounded"
                                  title="Excluir conversa"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. Perfil do Usuário com Indicador (···) e Borda Lilás (#8B7CFF) */}
      <div className="mt-auto pt-3 border-t border-[var(--border)] mb-3">
        {user ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2.5 w-full p-2 rounded-[var(--radius-md)] bg-[var(--surface-elevated)]/50 hover:bg-[var(--surface-hover)] border border-[var(--border)]/70 hover:border-[var(--accent)]/50 transition-all text-left cursor-pointer group shadow-sm"
            title="Abrir Configurações e Perfil (Ctrl+,)"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--accent-soft-bg)] border-2 border-[var(--accent)] text-[var(--accent)] flex items-center justify-center text-[13px] font-bold shrink-0 shadow-[0_0_12px_rgba(139,124,255,0.25)]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-hover)] transition-colors">
                {user.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-muted)] truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />
                <span className="truncate">Plano Pessoal • Conectado</span>
              </div>
            </div>
            <div className="p-1 rounded text-[var(--text-muted)] group-hover:text-[var(--text-primary)] group-hover:bg-[var(--surface-hover)] transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-all text-[12px] font-medium cursor-pointer shadow-sm group"
            title="Entrar na sua conta ou criar cadastro"
          >
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] group-hover:bg-white/20 group-hover:text-white flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <span>Entrar / Criar Conta</span>
            </span>
            <span className="text-[13px] font-bold group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}
      </div>

      {/* 5. Telemetria de Hardware Discreta */}
      <div className="pt-2.5 pb-0.5 border-t border-white/[0.06] space-y-2">
        <div>
          <div className="flex justify-between items-center text-[11px] text-zinc-500 font-mono mb-1">
            <span>CPU</span>
            <span className="text-zinc-400 font-medium">{cpuPercent}%</span>
          </div>
          <div className="w-full h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all duration-300"
              style={{ width: `${cpuPercent}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center text-[11px] text-zinc-500 font-mono mb-1">
            <span>RAM</span>
            <span className="text-zinc-400 font-medium">{ramUsedGb} / {ramTotalGb} GB</span>
          </div>
          <div className="w-full h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all duration-300"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};
