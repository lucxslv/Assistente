import React, { useState, useMemo } from "react";
import {
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { Thread } from "../types";
import { SystemStatus, LocalSystemMetrics } from "../services/api";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  onRenameThread?: (id: string, newName: string) => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  isConnected: boolean;
  systemStatus: SystemStatus | null;
  localMetrics?: LocalSystemMetrics;
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
  isConnected,
  systemStatus,
  localMetrics,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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
            <span className="text-[18px] text-[var(--accent)] drop-shadow-[0_0_25px_var(--accent-glow)] select-none">
              ✦
            </span>
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

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors cursor-pointer"
          title="Preferências (Ctrl+,)"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-[1px] bg-[var(--border)] my-3" />

      {/* 2. Ações: + Nova conversa e ⌕ Pesquisar */}
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
            className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-transparent hover:bg-[var(--surface-hover)] transition-colors text-[13px] w-full text-left cursor-pointer"
          >
            <span>⌕</span> Pesquisar
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

      {/* 4. Estatísticas de Hardware Discretas (.system-stats) */}
      <div className="mt-auto pt-3 border-t border-[var(--border)]">
        <div className="flex justify-between items-center text-[12px] text-[var(--text-muted)] mb-1">
          <span>CPU</span>
          <span className="font-mono">{cpuPercent}%</span>
        </div>
        <div className="w-full h-[3px] bg-[var(--border)] rounded-[2px] overflow-hidden">
          <div
            className={`h-full rounded-[2px] transition-all duration-300 ${
              cpuPercent > 85
                ? "bg-[var(--danger)]"
                : cpuPercent > 65
                ? "bg-[var(--warning)]"
                : "bg-[var(--text-muted)]"
            }`}
            style={{ width: `${cpuPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[12px] text-[var(--text-muted)] mt-3 mb-1">
          <span>RAM</span>
          <span className="font-mono">
            {ramUsedGb} / {ramTotalGb} GB
          </span>
        </div>
        <div className="w-full h-[3px] bg-[var(--border)] rounded-[2px] overflow-hidden">
          <div
            className={`h-full rounded-[2px] transition-all duration-300 ${
              ramPercent > 85
                ? "bg-[var(--danger)]"
                : ramPercent > 70
                ? "bg-[var(--warning)]"
                : "bg-[var(--text-muted)]"
            }`}
            style={{ width: `${ramPercent}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
