import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  Loader2,
  Minus,
  Square,
  X,
  Plus,
  Paperclip,
  Mic,
  ArrowUp,
  Terminal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Message, ToolCallInfo } from "../types";
import { invoke } from "@tauri-apps/api/core";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string, skipTts: boolean) => void;
  currentThreadName?: string;
  userName?: string;
}

// Componente para blocos de código com destaque e botão de cópia
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 rounded-[var(--radius-md)] overflow-hidden border border-[var(--border)] bg-[#0A0B0E] text-left">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-hover)] border-b border-[var(--border)] text-[11px] font-mono select-none">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--success)]" />
              <span className="text-[var(--success)] font-medium">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto text-[12px] font-mono leading-relaxed text-[#E6E8ED]">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

// Card discreto de feedback de ferramentas executadas
const ToolExecutionBadge: React.FC<{ tool: ToolCallInfo }> = ({ tool }) => {
  const isExecuting = tool.status === "executing";
  const isError = tool.status === "error";

  const getFriendlyToolName = (name: string) => {
    switch (name) {
      case "manage_application":
        return `Comando: ${tool.args?.app_name || "Aplicativo"}`;
      case "list_directory":
        return `Explorando pasta: ${tool.args?.path || "Diretório"}`;
      case "read_file":
        return `Lendo arquivo: ${tool.args?.path || "Arquivo"}`;
      case "write_file":
        return `Escrevendo arquivo: ${tool.args?.path || "Arquivo"}`;
      case "set_system_volume":
        return `Ajustando volume`;
      case "system_power_action":
        return `Ação do sistema: ${tool.args?.action || "Energia"}`;
      case "search_web":
        return `Pesquisa na Web: ${tool.args?.query || ""}`;
      default:
        return `Ferramenta: ${name}`;
    }
  };

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] border border-[var(--border)] text-[11.5px] text-[var(--text-secondary)] my-1 select-none">
      {isExecuting ? (
        <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)] shrink-0" />
      ) : isError ? (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />
      ) : (
        <Terminal className="w-3 h-3 text-[var(--success)] shrink-0" />
      )}
      <span className="font-medium text-[var(--text-primary)]">
        {getFriendlyToolName(tool.name)}
      </span>
      {isExecuting && <span className="text-[10px] text-[var(--text-muted)]">(executando...)</span>}
    </div>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  onSendMessage,
  currentThreadName,
  userName = "Lucas",
}) => {
  const [input, setInput] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Auto-resize do textarea
  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  const handleSend = (textToSend?: string) => {
    const finalMsg = (textToSend !== undefined ? textToSend : input).trim();
    if (!finalMsg || isLoading) return;

    onSendMessage(finalMsg, !voiceActive);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  // Controles de Janela Nativa (Tauri)
  const handleMinimize = async () => {
    try {
      await invoke("minimize_window");
    } catch {
      // Browser fallback
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await invoke("toggle_maximize_window");
    } catch {
      // Browser fallback
    }
  };

  const handleClose = async () => {
    try {
      await invoke("close_window");
    } catch {
      // Browser fallback
    }
  };

  // Upload/Anexo de arquivo
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const promptText = `Analise o arquivo '${file.name}':\n`;
      setInput((prev) => (prev ? `${prev}\n${promptText}` : promptText));
      textareaRef.current?.focus();
    }
    e.target.value = "";
  };

  const suggestions = [
    { label: "Analisa meu projeto", prompt: "Analise a estrutura do projeto atual e me dê um resumo." },
    { label: "Abre o Chrome", prompt: "Abre o Google Chrome para mim." },
    { label: "Pesquisa as notícias", prompt: "Pesquise as principais notícias e novidades em tecnologia de hoje." },
    { label: "Como está o desempenho?", prompt: "Como está o desempenho atual do processador e memória do meu computador?" },
  ];

  const isEmptyState = messages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--background)] relative overflow-hidden">
      {/* ================================================================
          1. HEADER NATIVO COM ÁREA DE ARRASTE E CONTROLES DE JANELA
          ================================================================ */}
      <header
        data-tauri-drag-region
        className="h-[52px] border-b border-[var(--border)] flex items-center justify-between px-6 select-none bg-[var(--background)] shrink-0 z-20"
      >
        <div data-tauri-drag-region className="flex items-center gap-2 text-[13px] text-[var(--text-muted)] cursor-default">
          <span className="text-[var(--accent)] font-semibold select-none">✦</span>
          <span className="font-medium text-[var(--text-secondary)]">
            {currentThreadName || "Charlie"}
          </span>
        </div>

        {/* Controles de Janela Sutis */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setVoiceActive(!voiceActive)}
            className={`p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer mr-2 ${
              voiceActive
                ? "text-[var(--accent)] bg-[var(--accent-soft-bg)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            }`}
            title={voiceActive ? "Resposta por voz ativada" : "Modo silencioso (apenas texto)"}
          >
            {voiceActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            title="Maximizar"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/15 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ================================================================
          2. ESTADO VAZIO (ASSISTANT-VIEW CENTRALIZADO)
          ================================================================ */}
      {isEmptyState ? (
        <section className="flex-1 flex flex-col justify-center items-center p-10 max-w-[700px] mx-auto w-full select-none animate-fade-in">
          <div className="text-[32px] text-[var(--accent)] drop-shadow-[0_0_30px_var(--accent-glow)] mb-6 opacity-80">
            ✦
          </div>
          <h1 className="text-[28px] font-light text-[var(--text-primary)] mb-2 text-center tracking-tight">
            E aí, {userName}.
          </h1>
          <h2 className="text-[16px] text-[var(--text-secondary)] mb-10 text-center font-normal">
            O que vamos fazer?
          </h2>

          {/* Composer Centralizado */}
          <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 transition-all focus-within:border-[rgba(139,124,255,0.55)] focus-within:shadow-[0_0_0_3px_rgba(139,124,255,0.08)] mb-6">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fala comigo..."
              disabled={isLoading}
              className="w-full bg-transparent border-none text-[var(--text-primary)] text-[15px] leading-relaxed resize-none outline-none min-h-[26px] max-h-[120px] placeholder:text-[var(--text-muted)]"
            />
            <div className="flex justify-between items-center mt-3">
              <div className="flex gap-1 relative">
                <button
                  type="button"
                  onClick={() => setShowPlusMenu(!showPlusMenu)}
                  className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-[16px]"
                  title="Ações rápidas"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                  title="Anexar arquivo"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceActive(!voiceActive)}
                  className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                    voiceActive
                      ? "text-[var(--accent)] bg-[var(--accent-soft-bg)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                  }`}
                  title={voiceActive ? "Resposta por voz ligada" : "Modo texto (silencioso)"}
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>

                {/* Menu popup do botão + */}
                {showPlusMenu && (
                  <div className="absolute left-0 bottom-10 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[var(--radius-md)] p-1 shadow-2xl z-30 min-w-[160px] text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        handleSend("Limpe o histórico desta conversa.");
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                    >
                      Limpar conversa
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:hover:bg-[var(--accent)] cursor-pointer"
                title="Enviar mensagem"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Sugestões Clicáveis */}
          <div className="flex gap-2 flex-wrap justify-center">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(s.prompt)}
                className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] text-[var(--text-secondary)] text-[13px] cursor-pointer hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-all font-sans"
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>
      ) : (
        /* ================================================================
            3. ESTADO ATIVO (LISTA DE MENSAGENS COM ROLAGEM VERTICAL)
            ================================================================ */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {messages.map((m, idx) => {
              const isUser = m.type === "user_message";
              const messageId = m.id || `msg-${idx}`;
              const isCopied = copiedMessageId === messageId;

              return (
                <div
                  key={messageId}
                  className={`flex gap-3.5 group ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5 select-none font-bold text-xs">
                      ✦
                    </div>
                  )}

                  <div
                    className={`max-w-[78%] px-4 py-3 rounded-[var(--radius-lg)] text-[14px] leading-relaxed transition-all ${
                      isUser
                        ? "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)]"
                        : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]"
                    }`}
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap select-text">{m.content}</div>
                    ) : (
                      <div className="space-y-2 select-text">
                        {/* Ferramentas executadas */}
                        {m.tools && m.tools.length > 0 && (
                          <div className="flex flex-col gap-1 mb-2">
                            {m.tools.map((t, tIdx) => (
                              <ToolExecutionBadge key={tIdx} tool={t} />
                            ))}
                          </div>
                        )}

                        {/* Conteúdo Markdown com Syntax Highlighting */}
                        <div className="prose prose-invert prose-sm max-w-none text-[var(--text-primary)]">
                          {m.content ? (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ node, inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || "");
                                  const codeString = String(children).replace(/\n$/, "");
                                  if (!inline && (match || codeString.includes("\n"))) {
                                    return (
                                      <CodeBlock
                                        language={match ? match[1] : "code"}
                                        code={codeString}
                                      />
                                    );
                                  }
                                  return (
                                    <code
                                      className="px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] text-[var(--accent)] font-mono text-[12px] border border-[var(--border)]"
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
                            <span className="text-[var(--text-muted)] flex items-center gap-2 italic py-0.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                              Charlie está raciocinando...
                            </span>
                          ) : null}

                          {m.streaming && m.content && (
                            <span className="inline-block w-1.5 h-3.5 ml-1 bg-[var(--accent)] animate-pulse align-middle rounded-full" />
                          )}
                        </div>

                        {/* Botão Copiar */}
                        {!m.streaming && m.content && (
                          <div className="flex items-center justify-end pt-1.5 border-t border-[var(--border)]/40 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(messageId, m.content)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                              title="Copiar resposta"
                            >
                              {isCopied ? (
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
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading &&
              (messages.length === 0 ||
                messages[messages.length - 1].type === "user_message") && (
                <div className="flex gap-3.5 justify-start animate-fade-in">
                  <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5 select-none font-bold text-xs">
                    ✦
                  </div>
                  <div className="bg-[var(--surface)] border border-[var(--border)] px-4 py-3 rounded-[var(--radius-lg)] flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                    <span>Charlie está pensando...</span>
                  </div>
                </div>
              )}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer Ancorado no Rodapé */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--background)]">
            <div className="max-w-[800px] mx-auto w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 transition-all focus-within:border-[rgba(139,124,255,0.55)] focus-within:shadow-[0_0_0_3px_rgba(139,124,255,0.08)]">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Fala comigo..."
                disabled={isLoading}
                className="w-full bg-transparent border-none text-[var(--text-primary)] text-[14px] leading-relaxed resize-none outline-none min-h-[24px] max-h-[120px] placeholder:text-[var(--text-muted)]"
              />
              <div className="flex justify-between items-center mt-2.5">
                <div className="flex gap-1 relative">
                  <button
                    type="button"
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-[16px]"
                    title="Ações rápidas"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    title="Anexar arquivo"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceActive(!voiceActive)}
                    className={`w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                      voiceActive
                        ? "text-[var(--accent)] bg-[var(--accent-soft-bg)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                    }`}
                    title={voiceActive ? "Resposta por voz ligada" : "Modo texto (silencioso)"}
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>

                  {/* Menu popup do botão + */}
                  {showPlusMenu && (
                    <div className="absolute left-0 bottom-10 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-[var(--radius-md)] p-1 shadow-2xl z-30 min-w-[160px] text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPlusMenu(false);
                          handleSend("Limpe o histórico desta conversa.");
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                      >
                        Limpar conversa
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                  className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:hover:bg-[var(--accent)] cursor-pointer"
                  title="Enviar mensagem"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input de Arquivo Oculto para o botão de clipe 📎 */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileAttach}
        className="hidden"
      />
    </div>
  );
};
