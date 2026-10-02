import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
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
  Keyboard,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Message, ToolCallInfo, AgentArtifact } from "../types";
import { invoke } from "@tauri-apps/api/core";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string, skipTts: boolean) => void;
  onRegenerate?: (messageId: string) => void;
  currentThreadName?: string;
  userName?: string;
  onOpenShortcuts?: () => void;
  onToggleWorkspace?: () => void;
  isWorkspaceOpen?: boolean;
  hasActiveWorkspace?: boolean;
  activeArtifacts?: AgentArtifact[];
  onOpenArtifact?: (artifactId: string) => void;
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

// ReAct Tool Call Mini-Card interativo com sanfona/accordion expansível
const ToolExecutionBadge: React.FC<{ tool: ToolCallInfo }> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(false);
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
      case "take_screenshot":
        return "Captura de tela local";
      case "set_system_volume":
        return "Ajuste de volume";
      case "system_power_action":
        return `Ação do sistema: ${tool.args?.action || "Energia"}`;
      case "search_web":
        return `Pesquisa na Web: ${tool.args?.query || ""}`;
      default:
        return `Ferramenta: ${name}`;
    }
  };

  return (
    <div className="my-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[#101217] overflow-hidden text-left max-w-full select-none transition-all">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-[11.5px]"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {isExecuting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] shrink-0" />
          ) : isError ? (
            <span className="w-2 h-2 rounded-full bg-[var(--danger)] shrink-0" />
          ) : (
            <Terminal className="w-3.5 h-3.5 text-[var(--success)] shrink-0" />
          )}
          <span className="font-medium text-[var(--text-primary)] truncate">
            {getFriendlyToolName(tool.name)}
          </span>
          <span
            className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono font-medium ${
              isExecuting
                ? "bg-[var(--accent-soft-bg)] text-[var(--accent)] border border-[var(--accent-soft-border)]"
                : isError
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}
          >
            {isExecuting ? "Executando..." : isError ? "Falha" : "Concluído"}
          </span>
        </div>
        <div className="text-[var(--text-muted)] shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-[var(--border)] bg-[#0A0B0E] text-[11px] font-mono space-y-2 select-text overflow-x-auto">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div>
              <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] mb-1">
                Parâmetros (JSON)
              </div>
              <pre className="p-2 rounded bg-[var(--surface)] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.result !== undefined && (() => {
            const raw = typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2);
            const isSensitive = raw.includes("run_desktop.bat") || raw.includes("isolamento de rede") || raw.includes("servidor em nuvem (Vercel)");
            const displayResult = isSensitive
              ? "Operação restrita: por motivos de segurança e privacidade, o acesso a arquivos e pastas locais não está habilitado através da conexão em nuvem."
              : raw;

            return (
              <div>
                <div className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] mb-1">
                  Retorno / Resultado
                </div>
                <pre className="p-2 rounded bg-[var(--surface)] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                  {displayResult}
                </pre>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onRegenerate,
  currentThreadName,
  userName = "Lucas",
  onOpenShortcuts,
  onToggleWorkspace,
  isWorkspaceOpen,
  hasActiveWorkspace,
  activeArtifacts = [],
  onOpenArtifact,
}) => {
  const [input, setInput] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
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

  // Saudação dinâmica por período do dia
  const getGreeting = (name: string) => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return `Bom dia, ${name}.`;
    if (hour >= 12 && hour < 18) return `Boa tarde, ${name}.`;
    return `Boa noite, ${name}.`;
  };

  // Reproduzir áudio (TTS) com sintetizador nativo do navegador / WebView
  const handleSpeakMessage = (id: string, text: string) => {
    if (!("speechSynthesis" in window)) return;
    if (speakingMessageId === id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    setSpeakingMessageId(id);

    const cleanText = text.replace(/[*_`#]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "pt-BR";
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find((v) => v.lang.includes("pt") || v.lang.includes("BR"));
    if (ptVoice) utterance.voice = ptVoice;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    window.speechSynthesis.speak(utterance);
  };

  // Editar pergunta (preenche no composer e foca)
  const handleEditMessage = (text: string) => {
    setInput(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(adjustTextareaHeight, 20);
    }
  };

  // Regenerar resposta do Charlie
  const handleRegenerateMessage = (msgIdx: number) => {
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (messages[i].type === "user_message" && messages[i].content) {
        if (onRegenerate) {
          onRegenerate(messages[msgIdx].id);
        } else {
          onSendMessage(messages[i].content, !voiceActive);
        }
        return;
      }
    }
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
        <div data-tauri-drag-region className="flex items-center gap-2.5 text-[13px] text-[var(--text-muted)] cursor-default">
          <img
            src="/charlie-logo.svg"
            alt="Charlie"
            className="w-4 h-4 object-contain opacity-90 drop-shadow-[0_0_6px_rgba(139,124,255,0.4)]"
          />
          <span className="font-medium text-[var(--text-secondary)]">
            {currentThreadName || "Charlie"}
          </span>
        </div>

        {/* Controles de Janela Sutis */}
        <div className="flex items-center gap-1">
          {onToggleWorkspace && (
            <button
              type="button"
              onClick={onToggleWorkspace}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-mono transition cursor-pointer mr-1.5 border ${
                isWorkspaceOpen
                  ? "bg-white/[0.14] text-zinc-100 border-white/[0.24] shadow-sm"
                  : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200 border-white/[0.06] hover:bg-white/[0.08]"
              }`}
              title="Alternar visualização do Agent Workspace operacional"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Workspace</span>
              {hasActiveWorkspace && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </button>
          )}

          {onOpenShortcuts && (
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer mr-1"
              title="Central de Atalhos (Ctrl+/)"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>
          )}

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
          <div className="w-16 h-16 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center mb-6 shadow-[0_0_35px_rgba(139,124,255,0.25)]">
            <img
              src="/charlie-logo.svg"
              alt="Charlie"
              className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(139,124,255,0.6)]"
            />
          </div>
          <h1 className="greeting-title text-[28px] font-light text-[var(--text-primary)] mb-2 text-center tracking-tight">
            {getGreeting(userName)}
          </h1>
          <h2 className="text-[16px] text-[var(--text-secondary)] mb-10 text-center font-normal">
            O que vamos fazer agora?
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
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] bg-zinc-100 hover:bg-white text-zinc-950 transition-colors disabled:opacity-30 disabled:hover:bg-zinc-100 shadow-sm cursor-pointer"
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
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {messages.map((m, idx) => {
              const isUser = m.type === "user_message";
              const messageId = m.id || `msg-${idx}`;
              const isCopied = copiedMessageId === messageId;
              const isSpeaking = speakingMessageId === messageId;

              return (
                <div
                  key={messageId}
                  className={`group flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1.5`}
                >
                  <div
                    className={`flex gap-3.5 max-w-[85%] ${
                      isUser ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[#0A0B0E] border border-[var(--border)] flex items-center justify-center shrink-0 mt-0.5 select-none overflow-hidden p-1 shadow-sm">
                        <img
                          src="/charlie-logo.svg"
                          alt="Charlie"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}

                    <div
                      className={`px-4 py-3 rounded-[var(--radius-lg)] text-[14px] leading-relaxed transition-all ${
                        isUser
                          ? "bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)]"
                          : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]"
                      }`}
                    >
                      {isUser ? (
                        <div className="whitespace-pre-wrap select-text">{m.content}</div>
                      ) : (
                        <div className="space-y-2 select-text">
                          {/* Ferramentas executadas com accordion expansível */}
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
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                  p({ children }) {
                                    return (
                                      <p className="mb-3 leading-relaxed text-[13.5px] text-[var(--text-primary)] last:mb-0">
                                        {children}
                                      </p>
                                    );
                                  },
                                  h1({ children }) {
                                    return (
                                      <h1 className="text-[17px] font-bold text-white mt-4 mb-2 pb-1 border-b border-[var(--border)]">
                                        {children}
                                      </h1>
                                    );
                                  },
                                  h2({ children }) {
                                    return (
                                      <h2 className="text-[15px] font-bold text-white mt-3.5 mb-2">
                                        {children}
                                      </h2>
                                    );
                                  },
                                  h3({ children }) {
                                    return (
                                      <h3 className="text-[14px] font-semibold text-[var(--accent)] mt-3 mb-1.5">
                                        {children}
                                      </h3>
                                    );
                                  },
                                  ul({ children }) {
                                    return (
                                      <ul className="my-2.5 pl-5 list-disc space-y-1.5 text-[13.5px] text-[var(--text-secondary)] marker:text-[var(--accent)]">
                                        {children}
                                      </ul>
                                    );
                                  },
                                  ol({ children }) {
                                    return (
                                      <ol className="my-2.5 pl-5 list-decimal space-y-1.5 text-[13.5px] text-[var(--text-secondary)] marker:text-[var(--accent)] marker:font-semibold">
                                        {children}
                                      </ol>
                                    );
                                  },
                                  li({ children }) {
                                    return <li className="leading-relaxed pl-0.5">{children}</li>;
                                  },
                                  strong({ children }) {
                                    return <strong className="font-semibold text-white">{children}</strong>;
                                  },
                                  blockquote({ children }) {
                                    return (
                                      <blockquote className="my-3 pl-3.5 border-l-2 border-[var(--accent)] bg-[var(--surface-hover)]/70 py-2 px-3 rounded-r-[var(--radius-sm)] text-[13px] text-[var(--text-secondary)] italic">
                                        {children}
                                      </blockquote>
                                    );
                                  },
                                  hr() {
                                    return <hr className="my-3.5 border-[var(--border)]" />;
                                  },
                                  table({ children }) {
                                    return (
                                      <div className="my-3 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
                                        <table className="w-full text-left text-xs border-collapse">
                                          {children}
                                        </table>
                                      </div>
                                    );
                                  },
                                  th({ children }) {
                                    return (
                                      <th className="p-2 border-b border-[var(--border)] bg-[var(--surface-hover)] font-semibold text-[var(--text-primary)]">
                                        {children}
                                      </th>
                                    );
                                  },
                                  td({ children }) {
                                    return (
                                      <td className="p-2 border-b border-[var(--border)] text-[var(--text-secondary)]">
                                        {children}
                                      </td>
                                    );
                                  },
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
                            {/* Cartão de Artefato Conectado ao Workspace */}
                            {activeArtifacts && activeArtifacts.length > 0 && !isUser && (idx === messages.length - 1 || m.content?.toLowerCase().includes("workspace") || m.content?.toLowerCase().includes("relatório") || m.content?.toLowerCase().includes(".md")) && (
                              <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2">
                                <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Sparkles className="w-3 h-3 text-indigo-400" />
                                  <span>Trabalho Produzido no Workspace</span>
                                </div>
                                {activeArtifacts.slice(-2).map((art) => (
                                  <div
                                    key={art.id}
                                    onClick={() => {
                                      if (!isWorkspaceOpen && onToggleWorkspace) onToggleWorkspace();
                                      if (onOpenArtifact) onOpenArtifact(art.id);
                                    }}
                                    className="p-2.5 rounded-lg bg-[#0C0D12] border border-indigo-500/25 hover:border-indigo-400/50 flex items-center justify-between gap-3 cursor-pointer transition group shadow-sm"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <span className="text-base">📄</span>
                                      <div className="min-w-0">
                                        <div className="text-xs font-mono font-medium text-zinc-200 group-hover:text-white transition truncate">
                                          {art.name}
                                        </div>
                                        <div className="text-[10px] text-zinc-400">
                                          {Math.round((art.sizeBytes || 0) / 1024) || 1} KB • Disponível para consulta no painel lateral
                                        </div>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      className="px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 group-hover:bg-indigo-500 group-hover:text-white text-xs font-mono transition flex items-center gap-1 shrink-0"
                                    >
                                      <span>Abrir</span>
                                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de Ações Flutuante Externa (Hover Action Toolbar) */}
                  <div
                    className={`flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity select-none ${
                      isUser ? "pr-1" : "pl-10"
                    }`}
                  >
                    {isUser ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEditMessage(m.content)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                          title="Editar e reenviar pergunta"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(messageId, m.content)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                          title="Copiar pergunta"
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
                      </>
                    ) : (
                      !m.streaming &&
                      m.content && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(messageId, m.content)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
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

                          <button
                            type="button"
                            onClick={() => handleSpeakMessage(messageId, m.content)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] transition-colors cursor-pointer ${
                              isSpeaking
                                ? "text-[var(--accent)] bg-[var(--accent-soft-bg)] font-medium"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                            }`}
                            title={isSpeaking ? "Parar áudio" : "Ouvir resposta (TTS)"}
                          >
                            <Volume2
                              className={`w-3 h-3 ${isSpeaking ? "animate-pulse" : ""}`}
                            />
                            <span>{isSpeaking ? "Parar" : "Ouvir"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRegenerateMessage(idx)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                            title="Regenerar esta resposta"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Regenerar</span>
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading &&
              (messages.length === 0 ||
                messages[messages.length - 1].type === "user_message") && (
                <div className="flex gap-3.5 justify-start animate-fade-in">
                  <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[#0A0B0E] border border-[var(--border)] flex items-center justify-center shrink-0 mt-0.5 select-none overflow-hidden p-1 shadow-sm">
                    <img
                      src="/charlie-logo.svg"
                      alt="Charlie"
                      className="w-full h-full object-contain"
                    />
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
                  className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] bg-zinc-100 hover:bg-white text-zinc-950 transition-colors disabled:opacity-30 disabled:hover:bg-zinc-100 shadow-sm cursor-pointer"
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
