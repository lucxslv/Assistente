import React, { useState } from "react";
import {
  AgentSession,
  PermissionRequest,
  AgentTask,
} from "../../types";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  FileCode,
  Layers,
  ShieldAlert,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentSidePanelProps {
  session: AgentSession | null;
  pendingPermissions: PermissionRequest[];
  onResolvePermission: (
    reqId: string,
    decision: "allow_once" | "allow_for_task" | "deny"
  ) => void;
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
  onRetryTask?: (taskId: string) => void;
  onClose?: () => void;
  onToggleWidth?: () => void;
  isWide?: boolean;
}

export const AgentSidePanel: React.FC<AgentSidePanelProps> = ({
  session,
  pendingPermissions,
  onResolvePermission,
  onReviewChange,
  onRetryTask,
  onClose,
  onToggleWidth,
  isWide = false,
}) => {
  const [activeTab, setActiveTab] = useState<"steps" | "diffs" | "terminal" | "artifacts">("steps");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [copiedTerminal, setCopiedTerminal] = useState(false);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);

  const tasks = session?.tasks || [];
  const completedTasks = tasks.filter((t) => t.status === "success").length;
  const changes = session?.changes || [];
  const terminals = session?.terminals || [];
  const artifacts = session?.artifacts || [];

  const handleCopyTerminal = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTerminal(true);
    setTimeout(() => setCopiedTerminal(false), 2000);
  };

  const renderStatusBadge = () => {
    if (!session) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          Pronto
        </span>
      );
    }
    if (session.status === "running") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Executando
        </span>
      );
    }
    if (session.status === "waiting_permission") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Autorização pendente
        </span>
      );
    }
    if (session.status === "completed") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Concluído
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
        {session.status}
      </span>
    );
  };

  return (
    <aside className="h-full flex flex-col bg-[#090A0F] text-[#F2F3F5] border-l border-white/[0.08] select-none overflow-hidden">
      {/* 1. Header Minimalista do Painel Estilo Antigravity */}
      <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#12151C] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {renderStatusBadge()}
          <span className="text-xs font-mono font-medium text-zinc-300 truncate max-w-[200px]" title={session?.goal || "Sessão do Agente"}>
            {session?.goal || "Co-piloto Antigravity"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleWidth && (
            <button
              type="button"
              onClick={onToggleWidth}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition text-xs font-mono cursor-pointer"
              title={isWide ? "Reduzir largura" : "Expandir largura"}
            >
              {isWide ? "⇸" : "⇹"}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition text-xs cursor-pointer"
              title="Fechar painel lateral"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 2. Banner de Autorização Zero-Trust (se houver permissão pendente) */}
      {pendingPermissions.length > 0 && (
        <div className="p-3 bg-amber-950/30 border-b border-amber-500/30 shrink-0">
          {pendingPermissions.map((req) => (
            <div key={req.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-amber-300">
                    Autorização Necessária
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono mt-0.5 break-all">
                    {req.tool} {req.command ? `(${req.command})` : ""}
                  </div>
                  {req.reason && (
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {req.reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 pl-6">
                <button
                  type="button"
                  onClick={() => onResolvePermission(req.id, "allow_for_task")}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition cursor-pointer"
                >
                  Autorizar
                </button>
                <button
                  type="button"
                  onClick={() => onResolvePermission(req.id, "deny")}
                  className="px-2.5 py-1 rounded text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition cursor-pointer"
                >
                  Negar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Navegação das Abas do Painel */}
      <div className="px-3 py-1.5 border-b border-white/[0.08] bg-[#12151C]/60 flex items-center gap-1 shrink-0 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("steps")}
          className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === "steps"
              ? "bg-white/[0.12] text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          }`}
        >
          <span>Etapas</span>
          {tasks.length > 0 && (
            <span className="text-[10px] opacity-75 font-mono">
              ({completedTasks}/{tasks.length})
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("diffs")}
          className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === "diffs"
              ? "bg-white/[0.12] text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          }`}
        >
          <span>Diffs</span>
          {changes.length > 0 && (
            <span className="px-1 py-0.2 rounded-full text-[9px] bg-amber-500/20 text-amber-300">
              {changes.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("terminal")}
          className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === "terminal"
              ? "bg-white/[0.12] text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
          }`}
        >
          <Terminal className="w-3 h-3" />
          <span>Terminal</span>
          {terminals.some((t) => t.status === "running") && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          )}
        </button>

        {artifacts.length > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab("artifacts")}
            className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "artifacts"
                ? "bg-white/[0.12] text-zinc-100 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Artefatos</span>
            <span className="text-[10px] opacity-75 font-mono">
              ({artifacts.length})
            </span>
          </button>
        )}
      </div>

      {/* 4. Conteúdo das Abas (Compacto, sem poluição) */}
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {/* ABA: ETAPAS (Checklist Antigravity) */}
        {activeTab === "steps" && (
          <div className="space-y-3">
            {tasks.length > 0 ? (
              <>
                {/* Linha de Progresso Sutil */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                    <span>Progresso da Missão</span>
                    <span>{Math.round((completedTasks / Math.max(1, tasks.length)) * 100)}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round((completedTasks / Math.max(1, tasks.length)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Lista de Etapas */}
                <div className="space-y-1.5 pt-1">
                  {tasks.map((task: AgentTask, idx: number) => {
                    const isSuccess = task.status === "success";
                    const isRunning = task.status === "running" || task.status === "verifying";
                    const isFailed = task.status === "failure";
                    const isExpanded = expandedTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className={`rounded-lg border transition ${
                          isRunning
                            ? "bg-[#12151C] border-indigo-500/30"
                            : isSuccess
                            ? "bg-[#0C0D12] border-white/[0.04]"
                            : "bg-[#0C0D12] border-white/[0.04] opacity-75"
                        }`}
                      >
                        <div
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          className="p-2.5 flex items-start gap-2.5 cursor-pointer hover:bg-white/[0.02]"
                        >
                          <div className="shrink-0 mt-0.5">
                            {isSuccess ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : isRunning ? (
                              <div className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                            ) : isFailed ? (
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-zinc-600 flex items-center justify-center text-[9px] text-zinc-500 font-mono">
                                {idx + 1}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`font-mono text-xs ${
                                  isSuccess
                                    ? "text-zinc-400 line-through decoration-zinc-600"
                                    : isRunning
                                    ? "text-indigo-200 font-medium"
                                    : "text-zinc-300"
                                }`}
                              >
                                {task.title}
                              </span>
                              {task.tool && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-zinc-400 border border-white/[0.06] shrink-0">
                                  {task.tool}
                                </span>
                              )}
                            </div>

                            {task.description && !isSuccess && (
                              <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                                {task.description}
                              </p>
                            )}
                          </div>

                          <span className="text-zinc-600 text-xs">
                            {isExpanded ? "▾" : "▸"}
                          </span>
                        </div>

                        {/* Detalhes expansíveis */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] space-y-2 text-[11px] font-mono text-zinc-400 bg-black/20">
                            {task.command && (
                              <div>
                                <span className="text-zinc-500 block mb-0.5">Comando:</span>
                                <div className="p-1.5 rounded bg-[#090A0F] border border-white/[0.06] text-zinc-300 select-text overflow-x-auto">
                                  {task.command}
                                </div>
                              </div>
                            )}
                            {task.result && (
                              <div>
                                <span className="text-zinc-500 block mb-0.5">Resultado:</span>
                                <div className="p-1.5 rounded bg-[#090A0F] border border-white/[0.06] text-zinc-300 select-text max-h-32 overflow-y-auto">
                                  {task.result}
                                </div>
                              </div>
                            )}
                            {task.error && (
                              <div className="text-rose-400">
                                <span className="block mb-0.5 font-bold">Erro:</span>
                                <div>{task.error}</div>
                                {onRetryTask && (
                                  <button
                                    type="button"
                                    onClick={() => onRetryTask(task.id)}
                                    className="mt-2 px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition cursor-pointer"
                                  >
                                    Tentar novamente
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-zinc-500 space-y-1.5">
                <Clock className="w-5 h-5 mx-auto text-zinc-600" />
                <p className="text-xs">Nenhuma etapa ativa no momento.</p>
                <p className="text-[11px] text-zinc-600">
                  Converse com o Charlie no chat ao lado para planejar e executar ações.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ABA: DIFFS & ARQUIVOS */}
        {activeTab === "diffs" && (
          <div className="space-y-3">
            {changes.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                  <span>Alterações no Código ({changes.length})</span>
                </div>
                {changes.map((change) => {
                  const isSelected = selectedChangeId === change.id || (!selectedChangeId && change === changes[0]);
                  return (
                    <div
                      key={change.id}
                      className="rounded-lg border border-white/[0.08] bg-[#12151C] overflow-hidden"
                    >
                      <div
                        onClick={() => setSelectedChangeId(isSelected ? null : change.id)}
                        className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${
                              change.type === "A"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : change.type === "D"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-slate-500/20 text-slate-300"
                            }`}
                          >
                            {change.type}
                          </span>
                          <span className="font-mono text-xs text-zinc-200 truncate">
                            {change.path}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {change.status}
                        </span>
                      </div>

                      {/* Diff Viewer Simples */}
                      {isSelected && (
                        <div className="p-3 border-t border-white/[0.06] bg-[#0A0B0E] space-y-2">
                          <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto max-h-56 p-2 rounded bg-black/40 text-zinc-300">
                            {change.diff || change.newContent || "Nenhum diff detalhado disponível."}
                          </pre>
                          {onReviewChange && change.status === "pending_review" && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => onReviewChange(change.id, "accept")}
                                className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition cursor-pointer flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                <span>Aceitar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onReviewChange(change.id, "revert")}
                                className="px-2.5 py-1 rounded text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition cursor-pointer flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reverter</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-500 space-y-1">
                <FileCode className="w-5 h-5 mx-auto text-zinc-600" />
                <p className="text-xs">Nenhum arquivo modificado nesta sessão.</p>
              </div>
            )}
          </div>
        )}

        {/* ABA: TERMINAL */}
        {activeTab === "terminal" && (
          <div className="space-y-3">
            {terminals.length > 0 ? (
              <div className="space-y-2">
                {terminals.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-white/[0.08] bg-[#0C0D12] overflow-hidden"
                  >
                    <div className="px-3 py-1.5 bg-[#12151C] border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono">
                      <span className="text-zinc-300 truncate max-w-[200px]">
                        $ {t.command}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyTerminal(t.output)}
                        className="text-zinc-400 hover:text-zinc-200 transition p-0.5 cursor-pointer"
                        title="Copiar saída"
                      >
                        {copiedTerminal ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <pre className="p-3 text-[11px] font-mono text-zinc-300 max-h-56 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                      {t.output || "Comando executado sem saída de texto."}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-500 space-y-1">
                <Terminal className="w-5 h-5 mx-auto text-zinc-600" />
                <p className="text-xs">Nenhum comando de terminal executado ainda.</p>
              </div>
            )}
          </div>
        )}

        {/* ABA: ARTEFATOS */}
        {activeTab === "artifacts" && (
          <div className="space-y-3">
            {artifacts.map((art) => (
              <div
                key={art.id}
                className="rounded-lg border border-white/[0.08] bg-[#12151C] p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-zinc-200">
                    {art.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-zinc-400">
                    {art.type}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-[#090A0F] border border-white/[0.04] text-[11px] text-zinc-300 max-h-48 overflow-y-auto leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {art.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
