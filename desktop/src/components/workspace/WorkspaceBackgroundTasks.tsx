import React from "react";
import { AgentBackgroundTask } from "../../types";
import {
  Layers,
  CheckCircle2,
  Pause,
  ShieldAlert,
} from "lucide-react";

interface WorkspaceBackgroundTasksProps {
  tasks: AgentBackgroundTask[];
  onResolvePermission?: (reqId: string) => void;
}

export const WorkspaceBackgroundTasks: React.FC<WorkspaceBackgroundTasksProps> = ({
  tasks,
  onResolvePermission,
}) => {
  const renderStatus = (status: AgentBackgroundTask["status"]) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
            Em segundo plano
          </span>
        );
      case "permission_required":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            Autorização Necessária
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Concluída
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            <Pause className="w-3 h-3" />
            Pausada
          </span>
        );
      case "failed":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Falha
          </span>
        );
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-6 bg-[#090A0F] text-[#F2F3F5] space-y-6">
      {/* ================= Header da Seção ================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-slate-400" />
            <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider font-mono">
              Processos em Segundo Plano (Background Tasks)
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Tarefas autônomas não-bloqueantes. Você pode continuar usando o Charlie enquanto o trabalho prossegue.
          </p>
        </div>
      </div>

      {/* ================= Lista de Tarefas em Background ================= */}
      {tasks.length === 0 ? (
        <div className="text-center py-20 px-4 text-xs text-zinc-500 border border-dashed border-white/[0.06] rounded-xl max-w-xl mx-auto space-y-2">
          <Layers className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="font-medium text-zinc-400">Nenhuma tarefa rodando em segundo plano</p>
          <p className="text-[11px] text-zinc-500">
            Varreduras assíncronas, auditorias de dependências e pipelines longos aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-[#12151C] border border-white/[0.08] rounded-xl p-4 space-y-3 hover:border-white/[0.14] transition"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold font-mono text-zinc-100 truncate">
                    {task.name}
                  </h3>
                  {task.description && (
                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                      {task.description}
                    </p>
                  )}
                </div>
                <div>{renderStatus(task.status)}</div>
              </div>

              {/* Barra de Progresso */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span>Progresso</span>
                  <span>{task.progress}%</span>
                </div>
                <div className="w-full bg-white/[0.06] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-slate-300 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>

              {/* Botão de Resolução se exigir autorização */}
              {task.status === "permission_required" && task.permissionReqId && (
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-center justify-between">
                  <span className="text-xs text-amber-300">
                    A tarefa requer autorização para acessar recursos locais do sistema.
                  </span>
                  <button
                    type="button"
                    onClick={() => onResolvePermission?.(task.permissionReqId!)}
                    className="px-3 py-1 rounded text-xs font-medium bg-amber-500 hover:bg-amber-400 text-zinc-950 transition cursor-pointer"
                  >
                    Autorizar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
