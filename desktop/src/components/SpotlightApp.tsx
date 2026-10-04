import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  MessageSquare,
  Music,
  Calculator,
  Lock,
  Globe,
  ArrowUp,
  Volume2,
  Camera,
  Loader2,
  ChevronDown,
  Check,
  Copy,
  Terminal,
} from "lucide-react";
import { Message, Thread, ToolCallInfo } from "../types";
import {
  fetchThreads,
  createThread,
  fetchThreadSteps,
  sendChatMessageStream,
  humanizeErrorMessage,
} from "../services/api";
import { executeDeviceTool } from "../services/deviceExecutor";
import { invoke } from "@tauri-apps/api/core";

// Componente para blocos de código com cópia
const SpotlightCodeBlock: React.FC<{ language: string; code: string }> = ({
  language,
  code,
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-[var(--radius-sm)] overflow-hidden border border-[var(--border)] bg-[#0A0B0E] text-[11px] font-mono">
      <div className="flex items-center justify-between px-2.5 py-1 bg-[var(--surface-hover)] border-b border-[var(--border)] text-[10px] text-[var(--text-muted)] select-none">
        <span className="uppercase font-semibold text-[var(--accent)]">{language || "código"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--success)]" />
              <span className="text-[var(--success)]">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-2.5 overflow-x-auto text-[#E6E8ED]">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export const SpotlightApp: React.FC = () => {
  const [input, setInput] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fecha a janela flutuante
  const handleClose = async () => {
    try {
      await invoke("hide_spotlight");
    } catch {
      // fallback
    }
  };

  // Carrega threads disponíveis
  const loadThreads = async () => {
    try {
      const data = await fetchThreads();
      setThreads(data);
      if (data.length > 0 && !activeThreadId) {
        setActiveThreadId(data[0].id);
      }
    } catch (err) {
      console.warn("Falha ao carregar conversas:", err);
    }
  };

  useEffect(() => {
    loadThreads();
  }, []);

  // Carrega mensagens ao alternar de conversa
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    fetchThreadSteps(activeThreadId)
      .then((data) => setMessages(data))
      .catch((err) => console.warn("Falha ao carregar mensagens:", err));
  }, [activeThreadId]);

  // Foco inicial no textarea
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  // Redimensionamento automático do textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [input]);

  // Enviar mensagem
  const handleSendMessage = async (textToSend?: string) => {
    const trimmed = (textToSend !== undefined ? textToSend : input).trim();
    if (!trimmed || isLoading) return;

    let targetThreadId = activeThreadId;
    if (!targetThreadId) {
      try {
        const newThread = await createThread("Conversa Rápida");
        targetThreadId = newThread.id;
        setThreads((prev) => [newThread, ...prev]);
        setActiveThreadId(newThread.id);
      } catch {
        // continua
      }
    }

    const tempUserMsg: Message = {
      id: "usr-" + Date.now(),
      name: "Usuário",
      type: "user_message",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const assistantId = "asst-" + Date.now();
    const tempAsstMsg: Message = {
      id: assistantId,
      name: "Charlie",
      type: "assistant_message",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      tools: [],
    };

    setMessages((prev) => [...prev, tempUserMsg, tempAsstMsg]);
    setInput("");
    setIsLoading(true);

    try {
      await sendChatMessageStream(
        trimmed,
        targetThreadId,
        (ev) => {
          if (ev.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + ev.data.token } : m
              )
            );
          } else if (ev.type === "reset_and_fallback") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: "", tools: [] } : m
              )
            );
          } else if (ev.type === "tool_start") {
            executeDeviceTool(ev.data.name, ev.data.args || {}).catch(() => {});
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const newTool: ToolCallInfo = {
                  name: ev.data.name,
                  args: ev.data.args,
                  status: "executing",
                };
                return { ...m, tools: [...(m.tools || []), newTool] };
              })
            );
          } else if (ev.type === "tool_end") {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const updatedTools = (m.tools || []).map((t) =>
                  t.name === ev.data.name && t.status === "executing"
                    ? { ...t, result: ev.data.result, status: "completed" as const }
                    : t
                );
                return { ...m, tools: updatedTools };
              })
            );
          } else if (ev.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: ev.data.reply || m.content,
                      streaming: false,
                    }
                  : m
              )
            );
            if (!activeThreadId || activeThreadId !== ev.data.thread_id) {
              setActiveThreadId(ev.data.thread_id);
            }
            loadThreads();
          } else if (ev.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: m.content
                        ? `${m.content}\n\n*(${humanizeErrorMessage(ev.data.error)})*`
                        : humanizeErrorMessage(ev.data.error),
                      streaming: false,
                    }
                  : m
              )
            );
          }
        },
        true
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: humanizeErrorMessage(err), streaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Ações rápidas de automação do sistema
  const quickActions = [
    {
      id: "act-spotify",
      title: "Abrir Spotify",
      icon: Music,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "spotify", action: "open" });
        handleClose();
      },
    },
    {
      id: "act-chrome",
      title: "Abrir Chrome",
      icon: Globe,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "chrome", action: "open" });
        handleClose();
      },
    },
    {
      id: "act-calc",
      title: "Calculadora",
      icon: Calculator,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "calc", action: "open" });
        handleClose();
      },
    },
    {
      id: "act-print",
      title: "PrintScreen",
      icon: Camera,
      run: () => {
        executeDeviceTool("take_screenshot", {});
        handleClose();
      },
    },
    {
      id: "act-vol",
      title: "Volume 75%",
      icon: Volume2,
      run: () => {
        executeDeviceTool("set_system_volume", { level: 75 });
        handleClose();
      },
    },
    {
      id: "act-lock",
      title: "Bloquear PC",
      icon: Lock,
      run: () => {
        executeDeviceTool("system_power_action", { action: "lock" });
        handleClose();
      },
    },
  ];

  const suggestions = [
    { label: "Analisa meu projeto", prompt: "Analise a estrutura do projeto atual." },
    { label: "Abre o Chrome", prompt: "Abre o Google Chrome para mim." },
    { label: "Pesquisa as notícias", prompt: "Quais as principais novidades em tecnologia de hoje?" },
    { label: "Como está o desempenho?", prompt: "Como está o uso de CPU e memória do meu computador?" },
  ];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setIsThreadDropdownOpen(false);
    textareaRef.current?.focus();
  };

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="w-screen h-screen flex items-center justify-center p-3 bg-transparent select-none">
      {/* Container Principal Flutuante sem bordas de janela de SO */}
      <div className="w-full max-w-[660px] max-h-[500px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden flex flex-col ring-1 ring-[var(--accent)]/20 animate-scale-in text-[var(--text-primary)]">
        {/* Topo Minimalista: Troca de Conversa e Botão Nova Conversa */}
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)]/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 relative">
            <span className="text-[var(--accent)] font-semibold text-sm">✦</span>
            <button
              type="button"
              onClick={() => setIsThreadDropdownOpen(!isThreadDropdownOpen)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <span className="font-medium truncate max-w-[180px]">
                {activeThread?.name || "Nova Conversa"}
              </span>
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            </button>

            {/* Dropdown de Conversas */}
            {isThreadDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-60 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] border border-[var(--border)] shadow-2xl p-1 z-50 max-h-48 overflow-y-auto space-y-0.5">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft-bg)] transition-colors text-left cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Nova Conversa</span>
                </button>
                {threads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveThreadId(t.id);
                      setIsThreadDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[12px] text-left transition-colors cursor-pointer truncate ${
                      t.id === activeThreadId
                        ? "bg-[var(--accent-soft-bg)] text-[var(--accent-hover)] font-medium"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 shrink-0 opacity-70" />
                    <span className="truncate">{t.name || "Conversa sem título"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-hover)] border border-[var(--border)] rounded">
            Esc para fechar
          </kbd>
        </div>

        {/* Campo de Entrada Inspirado no Composer */}
        <div className="p-3.5 bg-[var(--surface)]">
          <div className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-[var(--radius-md)] p-3 transition-all focus-within:border-[rgba(139,124,255,0.55)] focus-within:shadow-[0_0_0_2px_rgba(139,124,255,0.12)]">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fala comigo ou digite um comando..."
              disabled={isLoading}
              className="w-full bg-transparent border-none text-[var(--text-primary)] text-[14px] leading-relaxed resize-none outline-none min-h-[24px] max-h-[90px] placeholder:text-[var(--text-muted)] font-sans"
            />
            <div className="flex justify-between items-center mt-2 pt-1 border-t border-[var(--border)]/40">
              <span className="text-[11px] text-[var(--text-muted)]">
                {isLoading ? "Charlie está pensando..." : "Pressione Enter para enviar"}
              </span>
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-30 cursor-pointer"
                title="Enviar"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>

        {/* Conteúdo: Mini Chat (se houver mensagens) OU Ações Rápidas & Sugestões */}
        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
          {messages.length > 0 ? (
            /* Histórico do Mini Chat */
            <div className="space-y-3 pt-1">
              {messages.map((m, idx) => {
                const isUser = m.type === "user_message";
                return (
                  <div
                    key={m.id || idx}
                    className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <span className="text-[var(--accent)] font-semibold text-xs mt-1 shrink-0">
                        ✦
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-[var(--radius-md)] text-[12.5px] leading-relaxed select-text ${
                        isUser
                          ? "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)]"
                          : "bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)]"
                      }`}
                    >
                      {/* Badges de ferramentas */}
                      {m.tools && m.tools.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {m.tools.map((t, tIdx) => (
                            <div
                              key={tIdx}
                              className="text-[10.5px] font-mono text-[var(--accent)] flex items-center gap-1.5"
                            >
                              <Terminal className="w-3 h-3" />
                              <span>{t.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {isUser ? (
                        m.content
                      ) : (
                        <div className="prose prose-invert prose-xs max-w-none text-[var(--text-primary)]">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeString = String(children).replace(/\n$/, "");
                                if (!inline && (match || codeString.includes("\n"))) {
                                  return (
                                    <SpotlightCodeBlock
                                      language={match ? match[1] : "code"}
                                      code={codeString}
                                    />
                                  );
                                }
                                return (
                                  <code
                                    className="px-1 py-0.2 rounded bg-[var(--surface-elevated)] text-[var(--accent)] font-mono text-[11px]"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-1">
                  <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
                  <span>Charlie está digitando...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            /* Sugestões e Ações Rápidas quando vazio */
            <div className="space-y-3 pt-1">
              <div>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-2 px-1">
                  Ações Rápidas do Computador
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {quickActions.map((act) => {
                    const Icon = act.icon;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={act.run}
                        className="flex items-center gap-2 p-2 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] hover:bg-[var(--surface-elevated)] border border-[var(--border)] text-left transition-colors cursor-pointer group"
                      >
                        <Icon className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0" />
                        <span className="text-[12px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">
                          {act.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block mb-2 px-1">
                  Sugestões de Conversa
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(s.prompt)}
                      className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] hover:bg-[var(--surface-elevated)] border border-[var(--border)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
