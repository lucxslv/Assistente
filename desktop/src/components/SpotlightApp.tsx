import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles,
  Plus,
  MessageSquare,
  Music,
  Calculator,
  Lock,
  Globe,
  ArrowRight,
  Volume2,
  VolumeX,
  Camera,
  Maximize2,
  X,
  Send,
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
    <div className="relative my-2 rounded-lg overflow-hidden border border-border/70 bg-[#090d16] text-[11px] font-mono">
      <div className="flex items-center justify-between px-2.5 py-1 bg-[#111726] border-b border-border/50 text-[10px] text-muted-foreground select-none">
        <span className="uppercase font-semibold text-primary/80">{language || "código"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
      <div className="p-2.5 overflow-x-auto text-zinc-100">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export const SpotlightApp: React.FC = () => {
  const [view, setView] = useState<"commands" | "chat">("commands");
  const [query, setQuery] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState(false);

  const commandInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fecha a janela do Spotlight chamando o backend nativo
  const handleClose = async () => {
    try {
      await invoke("hide_spotlight");
    } catch {
      // fallback
    }
  };

  // Abre a janela principal do Charlie e fecha o spotlight
  const handleOpenMainApp = async () => {
    try {
      await invoke("open_main_window");
      await invoke("hide_spotlight");
    } catch {
      // fallback
    }
  };

  // Carrega threads
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

  // Carrega mensagens ao mudar de conversa
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    fetchThreadSteps(activeThreadId)
      .then((data) => setMessages(data))
      .catch((err) => console.warn("Falha ao carregar mensagens:", err));
  }, [activeThreadId]);

  // Foco automático ao alternar telas
  useEffect(() => {
    if (view === "commands") {
      setTimeout(() => commandInputRef.current?.focus(), 50);
    } else {
      setTimeout(() => chatInputRef.current?.focus(), 50);
    }
  }, [view]);

  // Scroll suave nas mensagens
  useEffect(() => {
    if (view === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, view, isLoading]);

  // Enviar mensagem no mini chat
  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
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
    setIsLoading(true);
    setView("chat");
    setChatInput("");
    setQuery("");

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
          } else if (ev.type === "tool_start") {
            // Executa ferramenta local se aplicável
            if (
              ev.data.scope === "device" ||
              [
                "manage_application",
                "set_system_volume",
                "system_power_action",
                "take_screenshot",
              ].includes(ev.data.name)
            ) {
              executeDeviceTool(ev.data.name, ev.data.args || {}).catch(() => {});
            }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const newT: ToolCallInfo = {
                  name: ev.data.name,
                  args: ev.data.args,
                  status: "executing",
                };
                return { ...m, tools: [...(m.tools || []), newT] };
              })
            );
          } else if (ev.type === "tool_end") {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                return {
                  ...m,
                  tools: (m.tools || []).map((t) =>
                    t.name === ev.data.name ? { ...t, status: "completed" as const } : t
                  ),
                };
              })
            );
          } else if (ev.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: ev.data.reply || m.content, streaming: false }
                  : m
              )
            );
            loadThreads();
          } else if (ev.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: humanizeErrorMessage(ev.data.error),
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

  // Criar nova conversa
  const handleNewChat = async () => {
    try {
      const newT = await createThread("Nova Conversa");
      setThreads((prev) => [newT, ...prev]);
      setActiveThreadId(newT.id);
      setMessages([]);
      setIsThreadDropdownOpen(false);
      setView("chat");
    } catch (err) {
      console.warn("Erro ao criar nova conversa:", err);
    }
  };

  // Ações do Spotlight
  const baseActions = [
    {
      id: "tool-spotify",
      title: "Abrir Spotify",
      desc: "Música e podcasts",
      icon: Music,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "spotify", action: "open" });
        handleClose();
      },
    },
    {
      id: "tool-chrome",
      title: "Abrir Google Chrome",
      desc: "Navegador de internet",
      icon: Globe,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "chrome", action: "open" });
        handleClose();
      },
    },
    {
      id: "tool-calc",
      title: "Abrir Calculadora",
      desc: "Calculadora do Windows",
      icon: Calculator,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "calc", action: "open" });
        handleClose();
      },
    },
    {
      id: "tool-screenshot",
      title: "Capturar Tela",
      desc: "Salva print da tela atual",
      icon: Camera,
      run: () => {
        executeDeviceTool("take_screenshot", {});
        handleClose();
      },
    },
    {
      id: "tool-vol-up",
      title: "Aumentar Volume",
      desc: "Define áudio em 75%",
      icon: Volume2,
      run: () => {
        executeDeviceTool("set_system_volume", { level: 75 });
        handleClose();
      },
    },
    {
      id: "tool-vol-mute",
      title: "Silenciar Volume",
      desc: "Muta saída de áudio",
      icon: VolumeX,
      run: () => {
        executeDeviceTool("set_system_volume", { mute: true });
        handleClose();
      },
    },
    {
      id: "tool-lock",
      title: "Bloquear Computador",
      desc: "Trava a sessão do Windows",
      icon: Lock,
      run: () => {
        executeDeviceTool("system_power_action", { action: "lock" });
        handleClose();
      },
    },
  ];

  // Ações dinâmicas das conversas salvas
  const threadActions = threads.map((t) => ({
    id: `thread-${t.id}`,
    title: t.name || "Conversa sem título",
    desc: "Alternar para esta conversa no mini chat",
    icon: MessageSquare,
    run: () => {
      setActiveThreadId(t.id);
      setView("chat");
    },
  }));

  // Ação de perguntar livremente
  const askAction = query.trim()
    ? [
        {
          id: "ask-question",
          title: `Perguntar: "${query.trim()}"`,
          desc: "Conversar com o Charlie no mini chat",
          icon: Sparkles,
          run: () => handleSendMessage(query.trim()),
        },
      ]
    : [];

  const filteredBase = baseActions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.desc.toLowerCase().includes(query.toLowerCase())
  );

  const filteredThreads = threadActions.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  const allActions = [...askAction, ...filteredBase, ...filteredThreads];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Teclado na aba de comandos
  const handleCommandKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < allActions.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : allActions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allActions[selectedIndex]) {
        allActions[selectedIndex].run();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
    }
  };

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="w-screen h-screen flex items-center justify-center p-3 bg-transparent select-none">
      <div className="w-full max-w-[660px] h-[500px] rounded-2xl bg-card/90 border border-white/10 shadow-2xl backdrop-blur-3xl flex flex-col overflow-hidden text-foreground ring-1 ring-white/10 animate-scale-in">
        {/* Topo / Barra de Ferramentas e Navegação entre Chats */}
        <div className="px-4 py-2.5 border-b border-border/50 bg-card/60 flex items-center justify-between gap-3">
          {/* Seletor de Conversa Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsThreadDropdownOpen(!isThreadDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-muted/40 hover:bg-muted/70 border border-border/50 text-xs font-medium text-foreground transition-all cursor-pointer"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="truncate max-w-[150px]">
                {activeThread?.name || "Conversa Atual"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Menu Dropdown de Conversas */}
            {isThreadDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl bg-card/95 border border-border/70 shadow-2xl backdrop-blur-2xl z-50 p-1.5 space-y-1 animate-fade-in max-h-56 overflow-y-auto">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/15 transition-all text-left cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova Conversa</span>
                </button>
                <div className="border-t border-border/40 my-1" />
                {threads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveThreadId(t.id);
                      setIsThreadDropdownOpen(false);
                      setView("chat");
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left truncate transition-all cursor-pointer ${
                      t.id === activeThreadId
                        ? "bg-primary/20 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <MessageSquare className="w-3 h-3 shrink-0 opacity-70" />
                    <span className="truncate flex-1">{t.name || "Conversa sem título"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Abas: Comandos vs Mini Chat */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-xl border border-border/40 text-xs font-medium">
            <button
              type="button"
              onClick={() => setView("commands")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                view === "commands"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Comandos
            </button>
            <button
              type="button"
              onClick={() => setView("chat")}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                view === "chat"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Mini Chat</span>
              {messages.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                  {messages.length}
                </span>
              )}
            </button>
          </div>

          {/* Botões de Ação da Janela */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleOpenMainApp}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all cursor-pointer"
              title="Abrir no aplicativo completo"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
              title="Fechar (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Conteúdo Dinâmico */}
        {view === "commands" ? (
          /* Visualização de Comandos & Atalhos */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Campo de Busca Prominente */}
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2.5 bg-card/30">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <input
                ref={commandInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleCommandKeyDown}
                placeholder="Digite um comando, atalho ou faça uma pergunta ao Charlie..."
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground/80 bg-muted/60 border border-border/60 rounded">
                Esc
              </kbd>
            </div>

            {/* Lista de Ações e Resultados */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {allActions.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhum comando ou conversa encontrada para "{query}"
                </div>
              ) : (
                allActions.map((action, idx) => {
                  const Icon = action.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={action.id}
                      onClick={() => action.run()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "hover:bg-muted/40 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg shrink-0 ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-medium truncate">{action.title}</div>
                          <div
                            className={`text-[10px] truncate ${
                              isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                            }`}
                          >
                            {action.desc}
                          </div>
                        </div>
                      </div>

                      <ArrowRight
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? "opacity-100" : "opacity-0"
                        } transition-opacity`}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Visualização de Mini Chat Integrado */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Feed de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground select-none">
                  <Sparkles className="w-8 h-8 text-primary mb-2 opacity-80" />
                  <p className="text-xs font-semibold text-foreground">Mini Chat com o Charlie</p>
                  <p className="text-[11px] mt-1 max-w-xs">
                    Faça uma pergunta rápida, execute automações ou comande seu computador diretamente daqui.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isUser = m.type === "user_message";
                  return (
                    <div
                      key={m.id || idx}
                      className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser && (
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                          <Sparkles className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                          isUser
                            ? "bg-primary text-primary-foreground rounded-tr-xs"
                            : "bg-card/80 border border-border/60 text-foreground rounded-tl-xs backdrop-blur-md"
                        }`}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap select-text">{m.content}</div>
                        ) : (
                          <div className="space-y-1.5 select-text">
                            {/* Badges de Ferramentas */}
                            {m.tools && m.tools.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {m.tools.map((t, tIdx) => (
                                  <span
                                    key={tIdx}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-primary/10 border border-primary/20 text-primary"
                                  >
                                    <Terminal className="w-2.5 h-2.5" />
                                    <span>{t.name}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Markdown */}
                            <div className="prose prose-invert prose-xs max-w-none">
                              {m.content ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    code({ node, inline, className, children, ...props }: any) {
                                      const match = /language-(\w+)/.exec(className || "");
                                      const codeString = String(children).replace(/\n$/, "");
                                      if (!inline && (match || codeString.includes("\n"))) {
                                        return (
                                          <SpotlightCodeBlock
                                            language={match ? match[1] : "código"}
                                            code={codeString}
                                          />
                                        );
                                      }
                                      return (
                                        <code
                                          className="px-1 py-0.5 rounded bg-muted/60 text-amber-300 font-mono text-[10.5px]"
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
                              ) : m.streaming ? (
                                <span className="flex items-center gap-1.5 text-muted-foreground italic">
                                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                  Pensando...
                                </span>
                              ) : null}

                              {m.streaming && m.content && (
                                <span className="inline-block w-1.5 h-3 ml-1 bg-primary animate-pulse align-middle" />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Caixa de Entrada do Mini Chat */}
            <div className="p-2.5 border-t border-border/40 bg-card/40">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(chatInput);
                }}
                className="relative flex items-center"
              >
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      handleClose();
                    }
                  }}
                  disabled={isLoading}
                  placeholder="Envie uma mensagem para o Charlie... (Enter para enviar)"
                  className="w-full bg-input/40 border border-border/70 rounded-xl px-3 py-2 pr-9 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/60"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isLoading}
                  className="absolute right-1.5 p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 transition-all cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Rodapé Fixo */}
        <div className="px-4 py-1.5 bg-card/70 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground select-none">
          <div className="flex items-center gap-2">
            <span>
              Atalho: <kbd className="px-1 py-0.2 bg-muted/60 rounded font-mono">Ctrl+Alt+Espaço</kbd>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>Pressione <kbd className="px-1 py-0.2 bg-muted/60 rounded font-mono">Esc</kbd> para fechar</span>
          </div>
        </div>
      </div>
    </div>
  );
};
