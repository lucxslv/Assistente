import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  ArrowRight,
  Loader2,
  Copy,
  Check,
  PanelRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileCode,
} from "lucide-react";
import {
  AgentSession,
  PermissionRequest,
  Message,
  ToolCallInfo,
  StreamEvent,
} from "../../types";
import { AgentSidePanel } from "../workspace/AgentSidePanel";
import { sendChatMessageStream } from "../../services/api";
import { agentRuntimeStore } from "../../services/agentRuntimeStore";

interface AgentEnvironmentProps {
  session: AgentSession | null;
  pendingPermissions: PermissionRequest[];
  onResolvePermission: (
    reqId: string,
    decision: "allow_once" | "allow_for_task" | "deny"
  ) => void;
  onReviewChange?: (changeId: string, decision: "accept" | "revert") => void;
  onRetryTask?: (taskId: string) => void;
  onNewMission?: () => void;
  userName?: string;
}

// Code Block com Cópia
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2.5 rounded-lg overflow-hidden border border-white/[0.08] bg-[#0A0B0E] text-left">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#12151C] border-b border-white/[0.06] text-[11px] font-mono select-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-[12px] font-mono leading-relaxed text-[#E6E8ED]">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

// Tool Execution Badge em sanfona
const ToolExecutionBadge: React.FC<{ tool: ToolCallInfo }> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isExecuting = tool.status === "executing";
  const isError = tool.status === "error";

  return (
    <div className="my-1.5 border border-white/[0.08] rounded-lg bg-[#12151C]/80 overflow-hidden text-left font-mono">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] hover:bg-white/[0.02] transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {isExecuting ? (
            <div className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          ) : isError ? (
            <AlertCircle className="w-3 h-3 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          )}
          <span className="text-zinc-300 font-medium">{tool.name}</span>
          {tool.args && (
            <span className="text-zinc-500 text-[10px] truncate max-w-xs">
              {JSON.stringify(tool.args)}
            </span>
          )}
        </div>
        <span className="text-zinc-500 text-[10px]">{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div className="p-2.5 border-t border-white/[0.06] bg-[#0A0B0E] space-y-1.5 text-[10px]">
          {tool.args && (
            <div>
              <span className="text-zinc-500 block mb-0.5">Parâmetros:</span>
              <pre className="p-1.5 rounded bg-black/40 text-zinc-300 overflow-x-auto">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <span className="text-zinc-500 block mb-0.5">Retorno:</span>
              <pre className="p-1.5 rounded bg-black/40 text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap break-all">
                {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AgentEnvironment: React.FC<AgentEnvironmentProps> = ({
  session,
  pendingPermissions,
  onResolvePermission,
  onReviewChange,
  onRetryTask,
  onNewMission,
  userName = "Você",
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
  const [isSidePanelWide, setIsSidePanelWide] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Se carregar uma sessão prévia, mostra resumo inicial se vazio
  useEffect(() => {
    if (session?.summary && messages.length === 0) {
      setMessages([
        {
          id: `sess-${session.id}`,
          name: "Charlie",
          type: "assistant_message",
          content: `**Missão do Agente Ativa:** ${session.goal}\n\n${session.summary || "Pronto para continuar trabalhando nesta missão."}`,
          createdAt: session.startedAt,
        },
      ]);
    }
  }, [session?.id]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userText = text.trim();
    setInputPrompt("");

    // Garante sessão ativa no store
    agentRuntimeStore.ensureConversationalSession(userText, "Charlie");

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      name: userName,
      type: "user_message",
      content: userText,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      name: "Charlie",
      type: "assistant_message",
      content: "",
      createdAt: new Date().toISOString(),
      tools: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setIsLoading(true);

    try {
      await sendChatMessageStream(
        userText,
        session?.id || null,
        (event: StreamEvent) => {
          if (event.type === "token") {
            const token =
              typeof event.data === "string"
                ? event.data
                : event.data?.token || event.data?.text || "";
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: msg.content + token }
                  : msg
              )
            );
          } else if (event.type === "tool_start") {
            const toolCall: ToolCallInfo = {
              name: event.data?.name || "ferramenta",
              args: event.data?.args || {},
              status: "executing",
            };
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      tools: [...(msg.tools || []), toolCall],
                    }
                  : msg
              )
            );

            // Registra no Agent Runtime Store
            const toolName = event.data?.name || "";
            const toolArgs = event.data?.args || {};

            if (toolArgs?.path || toolArgs?.file_path) {
              const p = String(toolArgs.path || toolArgs.file_path);
              agentRuntimeStore.recordFile({
                path: p,
                name: p.split(/[/\\]/).pop() || p,
                category: toolName.includes("write") ? "modified" : "analyzed",
              });
            }
          } else if (event.type === "tool_end") {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMsgId) return msg;
                const tools = (msg.tools || []).map((tc) =>
                  tc.name === event.data?.name
                    ? { ...tc, status: "completed" as const, result: event.data?.result }
                    : tc
                );
                return { ...msg, tools };
              })
            );

            const toolName = event.data?.name || "";
            const toolResult = event.data?.result;
            if ((toolName === "exec_command" || toolName === "execute_command" || toolName === "run_command") && toolResult) {
              try {
                agentRuntimeStore.addTerminal({
                  name: `Comando concluído`,
                  shell: "powershell",
                  command: "PowerShell",
                  output: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
                  status: "completed",
                });
              } catch {}
            }
          } else if (event.type === "done") {
            const reply = event.data?.reply || "";
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      content: msg.content || reply || "Ação concluída com sucesso.",
                    }
                  : msg
              )
            );
            agentRuntimeStore.completeConversationalSession(reply || "Missão concluída pelo agente.");
            setStatusText("");
          } else if (event.type === "status") {
            const st =
              typeof event.data === "string"
                ? event.data
                : event.data?.text || event.data?.status || "";
            if (st) {
              setStatusText(st);
            }
          } else if (event.type === "error") {
            const errStr =
              typeof event.data === "string"
                ? event.data
                : event.data?.error || "Erro desconhecido";
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      content:
                        msg.content +
                        `\n\n> ⚠️ *Erro durante execução:* ${errStr}`,
                    }
                  : msg
              )
            );
          }
        },
        true // skip TTS no chat do agente
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content:
                  msg.content ||
                  `Não foi possível executar a ação no momento: ${err.message || err}`,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputPrompt);
    }
  };

  return (
    <div className="flex-1 flex h-full w-full overflow-hidden bg-[#090A0F] text-[#F2F3F5]">
      {/* ================= 1. CHAT PRINCIPAL DO AGENTE (Esquerda / Centro) ================= */}
      <section className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header do Chat do Agente */}
        <header className="px-6 py-2.5 border-b border-white/[0.08] bg-[#12151C]/70 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-200 font-bold text-xs">
              ⚡
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider font-mono">
                  Charlie Agente
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Modo Autônomo
                </span>
                {session?.status === "running" ? (
                  <span className="text-[10px] font-mono text-blue-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Trabalhando ao vivo
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Pronto
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                {session?.goal || "Converse diretamente com o agente para analisar, planejar e executar ações."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onNewMission && (
              <button
                type="button"
                onClick={onNewMission}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition cursor-pointer"
                title="Limpar e iniciar nova missão"
              >
                <Plus className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Nova Missão</span>
              </button>
            )}

            {!isSidePanelOpen && (
              <button
                type="button"
                onClick={() => setIsSidePanelOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition cursor-pointer"
                title="Abrir painel lateral de trabalho"
              >
                <PanelRight className="w-3.5 h-3.5" />
                <span>Painel Lateral</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Mission Card (Clean Technical - Padrão Imagem 2) */}
        {session && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-[#12151C] border border-white/[0.08] shadow-sm shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                  <FileCode className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-zinc-100 uppercase tracking-wide">
                      {session.goal || "Missão Operacional Ativa"}
                    </span>
                    <span
                      className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded ${
                        session.status === "running"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {session.status === "running" ? "EM EXECUÇÃO" : "PRONTO"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                    {session.tasks && session.tasks.length > 0
                      ? `Pipeline ${session.tasks.filter((t) => t.status === "success").length}/${session.tasks.length} etapas concluídas • ${session.files?.length || 0} arquivos inspecionados`
                      : "Sessão interativa do agente conectada ao workspace local"}
                  </p>
                </div>
              </div>
            </div>

            {/* SYSTEM LOGS com barra de destaque vertical azul à esquerda */}
            <div className="mt-2.5 pt-2 border-t border-white/[0.04]">
              <div className="flex items-center justify-between text-[9.5px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
                <span>SYSTEM LOGS</span>
                <span>{session.status === "running" ? "LIVE STREAM" : "IDLE"}</span>
              </div>
              <div className="border-l-2 border-blue-500 bg-[#0A0B0E] px-3 py-1.5 rounded-r font-mono text-[11px] text-zinc-300">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="truncate">
                    $ {session.terminals?.[session.terminals.length - 1]?.command || "charlie agent --status active"}
                  </span>
                  <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                    {new Date(session.startedAt || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Área de Mensagens do Chat */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {messages.length === 0 ? (
            /* Onboarding do Agente quando não há mensagens */
            <div className="max-w-2xl mx-auto py-12 space-y-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl mx-auto shadow-inner text-indigo-400">
                ⚡
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-zinc-100">
                  Como posso ajudar no seu projeto hoje?
                </h2>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Converse diretamente com o Charlie para analisar arquivos, planejar tarefas, debater soluções e executar ações no seu computador.
                </p>
              </div>

              {/* 4 Sugestões Rápidas de Ação */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-left">
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Analise a estrutura do projeto e sugira possíveis melhorias de arquitetura."
                    )
                  }
                  className="p-3 rounded-xl bg-[#12151C] border border-white/[0.08] hover:border-indigo-500/40 hover:bg-[#181C26] transition text-left cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 flex items-center gap-1.5 font-mono">
                    <span>🔍 Analisar Arquitetura</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                    Inspeciona pastas e módulos para identificar inconsistências e sugerir melhorias.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Inspecione os arquivos de autenticação e veja se há problemas de segurança ou token."
                    )
                  }
                  className="p-3 rounded-xl bg-[#12151C] border border-white/[0.08] hover:border-indigo-500/40 hover:bg-[#181C26] transition text-left cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 flex items-center gap-1.5 font-mono">
                    <span>🛡️ Inspecionar Autenticação</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                    Examina rotas de login, tokens JWT e middleware de sessão.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Quero refatorar essa parte do projeto. O que você acha que deveríamos fazer? Proponha um plano antes."
                    )
                  }
                  className="p-3 rounded-xl bg-[#12151C] border border-white/[0.08] hover:border-indigo-500/40 hover:bg-[#181C26] transition text-left cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 flex items-center gap-1.5 font-mono">
                    <span>💡 Propor Plano de Refatoração</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                    Debate trade-offs e define o checklist de etapas antes de tocar no código.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Analise meu computador e me devolve o status dos processos e recursos disponíveis."
                    )
                  }
                  className="p-3 rounded-xl bg-[#12151C] border border-white/[0.08] hover:border-indigo-500/40 hover:bg-[#181C26] transition text-left cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 flex items-center gap-1.5 font-mono">
                    <span>💻 Diagnóstico do Sistema</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                    Coleta métricas de hardware, processos ativos e status de ferramentas locais.
                  </p>
                </button>
              </div>
            </div>
          ) : (
            /* Fluxo de Mensagens do Chat */
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-left ${
                  msg.type === "user_message" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.type === "assistant_message" && (
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0 mt-1">
                    ⚡
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-xl p-3.5 space-y-2 text-xs leading-relaxed ${
                    msg.type === "user_message"
                      ? "bg-[#1C202A] text-zinc-100 border border-white/[0.08] rounded-tr-sm"
                      : "bg-[#12151C] text-zinc-200 border border-white/[0.06] rounded-tl-sm"
                  }`}
                >
                  {/* Tool execution badges */}
                  {msg.tools && msg.tools.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {msg.tools.map((tc, idx) => (
                        <ToolExecutionBadge key={idx} tool={tc} />
                      ))}
                    </div>
                  )}

                  {/* Conteúdo Markdown com Math e Code Blocks */}
                  {msg.content ? (
                    <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            const isInline = !match && !String(children).includes("\n");
                            if (isInline) {
                              return (
                                <code
                                  className="px-1.5 py-0.5 rounded bg-black/40 text-indigo-300 font-mono text-[11px] border border-white/[0.06]"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <CodeBlock
                                language={match ? match[1] : ""}
                                code={String(children).replace(/\n$/, "")}
                              />
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : isLoading && msg.type === "assistant_message" ? (
                    <div className="flex items-center gap-2 text-zinc-500 text-xs py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span>{statusText || "Raciocinando e preparando plano..."}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar do Chat do Agente */}
        <div className="p-4 border-t border-white/[0.08] bg-[#090A0F]">
          <div className="max-w-3xl mx-auto relative rounded-xl border border-white/[0.12] bg-[#12151C] focus-within:border-zinc-500/80 shadow-lg transition">
            <textarea
              ref={textareaRef}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={2}
              placeholder="Instrua o Charlie, debata um plano ou peça para executar ações..."
              className="w-full bg-transparent px-4 py-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none font-sans"
            />
            <div className="px-3 pb-2 flex items-center justify-between text-[11px] text-zinc-500">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                ENTER PARA ENVIAR • SHIFT+ENTER PARA QUEBRA DE LINHA
              </span>
              <button
                type="button"
                onClick={() => handleSendMessage(inputPrompt)}
                disabled={!inputPrompt.trim() || isLoading}
                className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white disabled:opacity-30 disabled:hover:bg-zinc-100 text-zinc-950 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Enviar</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= 2. PAINEL LATERAL ESTILO ANTIGRAVITY (Direita) ================= */}
      {isSidePanelOpen && (
        <div
          className={`${
            isSidePanelWide ? "w-[580px] xl:w-[680px]" : "w-[380px] lg:w-[420px]"
          } transition-all duration-200 h-full shrink-0`}
        >
          <AgentSidePanel
            session={session}
            pendingPermissions={pendingPermissions}
            onResolvePermission={onResolvePermission}
            onReviewChange={onReviewChange}
            onRetryTask={onRetryTask}
            onClose={() => setIsSidePanelOpen(false)}
            onToggleWidth={() => setIsSidePanelWide(!isSidePanelWide)}
            isWide={isSidePanelWide}
          />
        </div>
      )}
    </div>
  );
};
