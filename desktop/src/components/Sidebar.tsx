import React from "react";
import { MessageSquare, Plus, Trash2, Settings as SettingsIcon, Sparkles, Cpu, Wrench } from "lucide-react";
import { Thread } from "../types";
import { SystemStatus } from "../services/api";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  isConnected: boolean;
  systemStatus: SystemStatus | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onOpenSettings,
  isConnected,
  systemStatus,
}) => {
  const getStatusBadge = () => {
    if (!isConnected) {
      return <span className="text-[10px] text-rose-400 font-medium">Offline</span>;
    }
    if (systemStatus?.status === "executing_tool") {
      return (
        <span className="text-[10px] text-blue-400 font-medium flex items-center gap-1 animate-pulse">
          <Wrench className="w-3 h-3" /> {systemStatus.active_tool || "Ferramenta"}
        </span>
      );
    }
    if (systemStatus?.status === "thinking") {
      return <span className="text-[10px] text-amber-400 font-medium animate-pulse">Pensando...</span>;
    }
    if (systemStatus?.status === "speaking") {
      return <span className="text-[10px] text-purple-400 font-medium animate-pulse">Falando...</span>;
    }
    return <span className="text-[10px] text-emerald-400 font-medium">Online e Pronto</span>;
  };

  return (
    <aside className="w-72 bg-card/60 backdrop-blur-md border-r border-border/50 flex flex-col h-full select-none">
      {/* Cabeçalho */}
      <div className="p-4 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5">
              Charlie
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-rose-500"
                }`}
              />
            </h1>
            <div className="flex items-center">{getStatusBadge()}</div>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          title="Configurações"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Botão Novo Chat */}
      <div className="p-3">
        <button
          onClick={onNewThread}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Nova Conversa
        </button>
      </div>

      {/* Lista de Conversas */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        <div className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Histórico
        </div>
        {threads.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhuma conversa recente
          </div>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                onClick={() => onSelectThread(t.id)}
                className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                  isActive
                    ? "bg-primary/15 text-primary font-medium border border-primary/20"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="truncate flex-1 pr-6">{t.name || "Conversa sem título"}</span>

                {/* Botão Deletar */}
                <button
                  onClick={(e) => onDeleteThread(t.id, e)}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 rounded transition-all"
                  title="Excluir"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé com Telemetria do Host */}
      <div className="p-3 border-t border-border/40 text-[10px] text-muted-foreground/70 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-primary/70" />
            CPU: {systemStatus?.host?.cpu_percent ?? 0}% | RAM: {systemStatus?.host?.memory_percent ?? 0}%
          </span>
          <span className="flex items-center gap-1 text-[9px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Supabase
          </span>
        </div>
        {systemStatus?.connected_devices_count !== undefined && (
          <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 border-t border-border/20 pt-1">
            <span>Dispositivos ativos: {systemStatus.connected_devices_count}</span>
            <span>Cloud Brain v2.0</span>
          </div>
        )}
      </div>
    </aside>
  );
};
