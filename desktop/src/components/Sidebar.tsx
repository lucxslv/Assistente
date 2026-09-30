import React from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Settings as SettingsIcon,
  Sparkles,
  Cpu,
  Wrench,
  Search,
  Command,
  Cloud,
  Activity,
} from "lucide-react";
import { Thread } from "../types";
import { SystemStatus } from "../services/api";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
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
  onOpenCommandPalette,
  isConnected,
  systemStatus,
}) => {
  const getStatusBadge = () => {
    if (!isConnected) {
      return (
        <span className="text-[10px] text-rose-400 font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Offline
        </span>
      );
    }
    if (systemStatus?.status === "executing_tool") {
      return (
        <span className="text-[10px] text-blue-400 font-medium flex items-center gap-1 animate-pulse">
          <Wrench className="w-3 h-3" /> {systemStatus.active_tool || "Executando..."}
        </span>
      );
    }
    if (systemStatus?.status === "thinking") {
      return (
        <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1 animate-pulse">
          <Activity className="w-3 h-3" /> Pensando...
        </span>
      );
    }
    if (systemStatus?.status === "speaking") {
      return (
        <span className="text-[10px] text-purple-400 font-medium flex items-center gap-1 animate-pulse">
          Falando...
        </span>
      );
    }
    return (
      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
        Pronto
      </span>
    );
  };

  const cpuPercent = Math.min(100, Math.max(0, Math.round(systemStatus?.host?.cpu_percent ?? 0)));
  const ramPercent = Math.min(100, Math.max(0, Math.round(systemStatus?.host?.memory_percent ?? 0)));
  const ramUsedGb = ((systemStatus?.host?.memory_used_mb ?? 0) / 1024).toFixed(1);
  const ramTotalGb = ((systemStatus?.host?.memory_total_mb ?? 0) / 1024).toFixed(1);

  return (
    <aside className="w-72 bg-card/60 backdrop-blur-xl border-r border-border/50 flex flex-col h-full select-none">
      {/* Cabeçalho */}
      <div className="p-4 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5">
              Charlie
              <span className="text-[10px] font-mono font-normal px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                v2.0
              </span>
            </h1>
            <div className="flex items-center">{getStatusBadge()}</div>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-xl transition-all"
          title="Configurações (Ctrl+,)"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Ações Rápidas: Novo Chat + Paleta de Comandos */}
      <div className="p-3 space-y-2">
        <button
          onClick={onNewThread}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-[0.98] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nova Conversa
        </button>

        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 border border-border/50 text-muted-foreground hover:text-foreground text-xs transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-[11px]">Paleta de Comandos</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-muted/60 text-muted-foreground border border-border/60 rounded flex items-center gap-0.5">
            <Command className="w-2.5 h-2.5" /> K
          </kbd>
        </button>
      </div>

      {/* Lista de Conversas */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        <div className="px-2 pb-1.5 text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider flex items-center justify-between">
          <span>Conversas Recentes</span>
          <span className="text-[9px] font-mono text-muted-foreground/60">{threads.length}</span>
        </div>
        {threads.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground/70">
            Nenhuma conversa recente
          </div>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeThreadId;
            return (
              <div
                key={t.id}
                onClick={() => onSelectThread(t.id)}
                className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                  isActive
                    ? "bg-primary/15 text-primary font-medium border border-primary/25 shadow-sm shadow-primary/10"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground border border-transparent"
                }`}
              >
                <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "opacity-60"}`} />
                <span className="truncate flex-1 pr-6">{t.name || "Conversa sem título"}</span>

                {/* Botão Deletar */}
                <button
                  onClick={(e) => onDeleteThread(t.id, e)}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                  title="Excluir Conversa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Widget de Telemetria e Monitor de Hardware */}
      <div className="p-3 border-t border-border/40 bg-muted/15 flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-foreground/90">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            Telemetria do Host
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                systemStatus?.database_connected ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-amber-400"
              }`}
              title={systemStatus?.database_connected ? "Supabase Conectado" : "Banco Offline"}
            />
            <span className="text-[10px] font-mono text-muted-foreground">
              {systemStatus?.database_connected ? "Supabase" : "DB Off"}
            </span>
          </div>
        </div>

        {/* Barra de CPU */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Uso de CPU</span>
            <span className="font-mono text-foreground">{cpuPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted/80 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                cpuPercent > 80
                  ? "bg-rose-500"
                  : cpuPercent > 50
                  ? "bg-amber-500"
                  : "bg-gradient-to-r from-blue-500 to-indigo-500"
              }`}
              style={{ width: `${cpuPercent}%` }}
            />
          </div>
        </div>

        {/* Barra de RAM */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Memória RAM</span>
            <span className="font-mono text-foreground">
              {ramPercent > 0 ? `${ramPercent}% (${ramUsedGb}/${ramTotalGb} GB)` : "0%"}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted/80 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                ramPercent > 85
                  ? "bg-rose-500"
                  : ramPercent > 70
                  ? "bg-amber-500"
                  : "bg-gradient-to-r from-indigo-500 to-purple-500"
              }`}
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>

        {/* Rodapé do Widget */}
        <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 border-t border-border/20 pt-1.5">
          <span className="flex items-center gap-1">
            <Cloud className="w-2.5 h-2.5 text-primary" /> Cloud Brain Vercel
          </span>
          <span>{isConnected ? "Sincronizado" : "Desconectado"}</span>
        </div>
      </div>
    </aside>
  );
};
