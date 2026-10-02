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
  Plus,
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
  activeView: "chat" | "agent";
  onSelectView: (view: "chat" | "agent") => void;
  isAgentActive?: boolean;
  onNewAgentMission?: () => void;
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
  activeView,
  onSelectView,
  isAgentActive = false,
  onNewAgentMission,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const {
    session: agentSession,
    history: agentHistory,
    loadSession,
    deleteHistorySession,
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

  // Filtro de busca de conversas
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter((t) => (t.name || "Conversa sem título").toLowerCase().includes(q));
  }, [threads, searchQuery]);

  // Agrupamento temporal para Chat
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
    <aside className="w-[260px] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col p-4 select-none h-full shrink-0">
      {/* 1. Header do Logo e Status */}
      <div className="px-1 py-1 mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <img
              src="/charlie-logo.svg"
              alt="Charlie"
              className="w-5 h-5 object-contain drop-shadow-[0_0_10px_rgba(139,124,255,0.4)]"
            />
            <span className="text-[13px] font-mono font-bold tracking-wider text-zinc-100 uppercase">
              CHARLIE_OS
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] pl-7">
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

      {/* 2. NAVEGAÇÃO PRINCIPAL EM ABAS: CHAT vs AGENTE */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#12151C] border border-white/[0.08] mb-3">
        <button
          type="button"
          onClick={() => onSelectView("chat")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition cursor-pointer ${
            activeView === "chat"
              ? "bg-white/[0.12] text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          }`}
        >
          <span>💬 Chat</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView("agent")}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition cursor-pointer relative ${
            activeView === "agent"
              ? "bg-white/[0.12] text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          }`}
        >
          <span>⚡ Agente</span>
          {isAgentActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse ml-0.5" />
          )}
        </button>
      </div>

      {/* ================= 3. SEÇÃO CONDICIONAL CONFORME A ABA ATIVA ================= */}
      {activeView === "chat" ? (
        /* ABA CHAT: HISTÓRICO DE CONVERSAS PADRÃO */
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Botão Primário: Nova Conversa */}
          <button
            type="button"
            onClick={onNewThread}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/60 transition-colors shadow-sm cursor-pointer w-full mb-2.5 group"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
              <span>Nova Conversa</span>
            </span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 group-hover:text-zinc-200">
              N
            </kbd>
          </button>

          {/* Pesquisa e Paleta rápida */}
          <div className="flex flex-col gap-1 mb-2">
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
                className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent hover:bg-[var(--surface-hover)] transition-colors text-[12px] w-full text-left cursor-pointer"
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

          <div className="h-[1px] bg-[var(--border)] my-2" />

          {/* Lista de Conversas com Agrupamento Temporal */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 pr-1 -mr-2">
            {groupedThreads.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">
                {searchQuery ? "Nenhuma conversa encontrada" : "Nenhuma conversa ativa"}
              </div>
            ) : (
              groupedThreads.map((group) => (
                <div key={group.title} className="mb-2">
                  <div className="text-[11px] font-medium text-[var(--text-muted)] px-2 pt-1.5 pb-1 uppercase tracking-[0.5px]">
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
                              ? "bg-zinc-800/90 border-zinc-700/80 text-zinc-100 font-medium"
                              : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
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

                              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
                                {onRenameThread && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleStartRename(t, e)}
                                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded"
                                    title="Renomear"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => onDeleteThread(t.id, e)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-elevated)] rounded"
                                  title="Excluir"
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
      ) : (
        /* ABA AGENTE: HISTÓRICO DE MISSÕES / SESSÕES DO AGENTE (TOTALMENTE INDEPENDENTE) */
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Botão Primário: Nova Missão do Agente */}
          <button
            type="button"
            onClick={onNewAgentMission}
            className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/60 transition-colors shadow-sm cursor-pointer w-full mb-3 group"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
              <span>Nova Missão</span>
            </span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 group-hover:text-zinc-200">
              N
            </kbd>
          </button>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1 pb-1.5 uppercase tracking-wider">
            <span>Missões do Agente</span>
            <span className="text-[10px] bg-white/[0.06] text-zinc-400 px-1.5 py-0.2 rounded-full font-mono">
              {agentHistory.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 -mr-2">
            {agentHistory.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-zinc-500 space-y-1">
                <p>Nenhuma missão anterior</p>
                <p className="text-[11px] text-zinc-600">
                  Inicie uma conversa no chat do agente para planejar ou executar ações.
                </p>
              </div>
            ) : (
              agentHistory.map((sess) => {
                const isActive = agentSession?.id === sess.id;
                return (
                  <div
                    key={sess.id}
                    onClick={() => loadSession(sess)}
                    className={`group p-2.5 rounded-lg border transition cursor-pointer text-left ${
                      isActive
                        ? "bg-zinc-800/90 border-zinc-700/80 shadow-sm"
                        : "bg-[#12151C]/60 hover:bg-[#181C26] border-white/[0.04] hover:border-white/[0.08]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            sess.status === "running"
                              ? "bg-indigo-400 animate-pulse"
                              : sess.status === "completed"
                              ? "bg-emerald-400"
                              : "bg-zinc-500"
                          }`}
                        />
                        <span className="text-xs font-mono font-medium text-zinc-200 truncate">
                          {sess.goal || "Missão sem objetivo"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHistorySession(sess.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-0.5 rounded transition cursor-pointer"
                        title="Excluir missão"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>{sess.tasks?.length || 0} etapas</span>
                      <span>{sess.progress || 0}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 4. Telemetria de Hardware (Posicionada acima do perfil) */}
      <div className="mt-auto pt-2.5 pb-2 border-t border-white/[0.06] space-y-1.5">
        <div>
          <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono mb-0.5">
            <span>CPU</span>
            <span className="text-zinc-400">{cpuPercent}%</span>
          </div>
          <div className="w-full h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all duration-300"
              style={{ width: `${cpuPercent}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono mb-0.5">
            <span>RAM</span>
            <span className="text-zinc-400">{ramUsedGb} / {ramTotalGb} GB</span>
          </div>
          <div className="w-full h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all duration-300"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 5. Perfil do Usuário (Base fixa da barra lateral) */}
      <div className="pt-2 border-t border-white/[0.06]">
        {user ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2.5 w-full p-2 rounded-[var(--radius-md)] bg-[#12151C] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] transition-all text-left cursor-pointer group shadow-sm"
            title="Abrir Configurações e Perfil (Ctrl+,)"
          >
            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 flex items-center justify-center text-[12px] font-bold shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                {user.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">Conectado</span>
              </div>
            </div>
            <div className="p-1 rounded text-zinc-500 group-hover:text-zinc-300 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[var(--radius-md)] bg-zinc-900 border border-zinc-700/60 text-zinc-200 hover:bg-zinc-800 hover:text-white transition-all text-[12px] font-medium cursor-pointer shadow-sm group"
            title="Entrar na sua conta ou criar cadastro"
          >
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700 flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <span>Entrar / Criar Conta</span>
            </span>
            <span className="text-[13px] font-bold group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}
      </div>
    </aside>
  );
};
