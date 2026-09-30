import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Volume2,
  VolumeX,
  Sparkles,
  Music,
  Cloud,
  Search,
  AppWindow,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Message, ToolCallInfo } from "../types";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string, skipTts: boolean) => void;
  currentThreadName?: string;
}

// Componente para blocos de código com destaque e botão de copiar
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-border/70 bg-[#0a0e17] shadow-xl text-left">
      {/* Barra de cabeçalho do código */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#121826] border-b border-border/50 text-[11px] font-mono select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70 inline-block" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1.5">
            {language || "code"}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all text-[11px]"
          title="Copiar código"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>

      {/* Conteúdo do código */}
      <div className="p-3.5 overflow-x-auto text-[11.5px] font-mono leading-relaxed text-zinc-100 selection:bg-primary/30">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

// Componente para detalhes expansíveis de ferramentas executadas
const ToolCallCard: React.FC<{ tool: ToolCallInfo }> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isExecuting = tool.status === "executing";
  const isError = tool.status === "error";

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden transition-all text-xs mb-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors text-left font-mono"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExecuting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
          ) : isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold text-foreground/90 truncate text-[11.5px]">
            {tool.name}
          </span>
          <span
            className={`text-[9.5px] px-2 py-0.5 rounded-full font-sans tracking-wide uppercase font-semibold ${
              isExecuting
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                : isError
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {isExecuting ? "Executando..." : isError ? "Falha" : "Concluído"}
          </span>
        </div>

        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <span className="text-[10px] hidden sm:inline opacity-70">
            {isExpanded ? "Ocultar detalhes" : "Ver parâmetros"}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3.5 py-2.5 bg-black/40 border-t border-border/30 text-[11px] font-mono space-y-2.5">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div>
              <span className="text-[10px] text-muted-foreground font-sans block mb-1 font-semibold uppercase tracking-wider">
                Argumentos Enviados:
              </span>
              <pre className="p-2 rounded-lg bg-black/50 border border-border/40 text-blue-300 overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {tool.result !== undefined && (
            <div>
              <span className="text-[10px] text-muted-foreground font-sans block mb-1 font-semibold uppercase tracking-wider">
                Resultado da Execução:
              </span>
              <pre className="p-2 rounded-lg bg-black/50 border border-border/40 text-emerald-300 overflow-x-auto text-[11px] leading-relaxed max-h-40 overflow-y-auto">
                {typeof tool.result === "string"
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {(!tool.args || Object.keys(tool.args).length === 0) &&
            tool.result === undefined && (
              <span className="text-muted-foreground italic text-[11px] block">
                Nenhum argumento ou retorno registrado para esta ferramenta.
              </span>
            )}
        </div>
      )}
    </div>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  onSendMessage,
  currentThreadName,
}) => {
  const [input, setInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Redimensionamento automático do textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim(), !voiceEnabled);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const suggestions = [
    { icon: Music, label: "Tocar música", prompt: "Toca Imagine Dragons Believer" },
    { icon: Cloud, label: "Previsão do tempo", prompt: "Como está o tempo hoje?" },
    { icon: Search, label: "Pesquisar na Web", prompt: "Quais as principais novidades em IA hoje?" },
    { icon: AppWindow, label: "Abrir aplicativo", prompt: "Abre o Chrome pra mim" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Topo / Barra de Título */}
      <div className="h-14 border-b border-border/40 px-6 flex items-center justify-between bg-card/30 backdrop-blur-md z-10 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-primary/80 animate-pulse" />
          <span className="text-xs font-semibold text-foreground tracking-wide">
            {currentThreadName || "Conversa Atual"}
          </span>
        </div>

        {/* Botão de Voz / TTS */}
        <button
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            voiceEnabled
              ? "bg-primary/20 text-primary border border-primary/30 shadow-sm shadow-primary/10"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          }`}
          title={voiceEnabled ? "Voz ativada (Charlie vai falar)" : "Modo silencioso (apenas texto)"}
        >
          {voiceEnabled ? (
            <>
              <Volume2 className="w-3.5 h-3.5" />
              <span>Voz Ativada</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 opacity-70" />
              <span>Silencioso</span>
            </>
          )}
        </button>
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto select-none py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600/30 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center shadow-2xl shadow-blue-500/10 mb-4 animate-bounce-slow">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1.5">Como posso te ajudar hoje?</h2>
            <p className="text-xs text-muted-foreground mb-8 max-w-sm">
              Controle seu computador nativamente, pesquise informações, gerencie arquivos ou converse com raciocínio avançado.
            </p>

            <div className="grid grid-cols-2 gap-3 w-full">
              {suggestions.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(s.prompt);
                      inputRef.current?.focus();
                    }}
                    className="p-3.5 rounded-xl border border-border/50 bg-card/40 hover:bg-card/90 hover:border-primary/40 text-left transition-all group flex items-start gap-3 shadow-sm hover:shadow-md"
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground/90">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{s.prompt}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isUser = m.type === "user_message";
            const messageId = m.id || `msg-${idx}`;
            const isCopied = copiedMessageId === messageId;

            return (
              <div
                key={messageId}
                className={`flex gap-3 group ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] px-4 py-3 rounded-2xl text-xs leading-relaxed transition-all ${
                    isUser
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/15 rounded-tr-xs"
                      : "bg-card/75 border border-border/60 text-foreground shadow-md rounded-tl-xs backdrop-blur-md"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap select-text">{m.content}</div>
                  ) : (
                    <div className="space-y-2 select-text">
                      {/* Ferramentas executadas nesta mensagem */}
                      {m.tools && m.tools.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {m.tools.map((t, tIdx) => (
                            <ToolCallCard key={tIdx} tool={t} />
                          ))}
                        </div>
                      )}

                      {/* Conteúdo em Markdown com CodeBlocks e tabelas estilizadas */}
                      <div className="prose prose-invert prose-xs max-w-none text-foreground/95">
                        {m.content ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || "");
                                const codeString = String(children).replace(/\n$/, "");
                                const isMultiline = codeString.includes("\n");

                                if (!inline && (match || isMultiline)) {
                                  return (
                                    <CodeBlock
                                      language={match ? match[1] : "code"}
                                      code={codeString}
                                    />
                                  );
                                }
                                return (
                                  <code
                                    className="px-1.5 py-0.5 rounded-md bg-muted/60 text-amber-300 font-mono text-[11px] border border-border/40"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                              a({ node, href, children, ...props }: any) {
                                return (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                                    {...props}
                                  >
                                    {children}
                                  </a>
                                );
                              },
                              table({ children }: any) {
                                return (
                                  <div className="overflow-x-auto my-3 rounded-lg border border-border/50">
                                    <table className="min-w-full divide-y divide-border/40 text-left text-xs">
                                      {children}
                                    </table>
                                  </div>
                                );
                              },
                              th({ children }: any) {
                                return (
                                  <th className="px-3 py-2 bg-card/80 font-semibold text-foreground border-b border-border/40">
                                    {children}
                                  </th>
                                );
                              },
                              td({ children }: any) {
                                return (
                                  <td className="px-3 py-2 border-b border-border/20 text-muted-foreground">
                                    {children}
                                  </td>
                                );
                              },
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        ) : m.streaming ? (
                          <span className="text-muted-foreground flex items-center gap-2 italic py-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            Charlie está pensando...
                          </span>
                        ) : null}

                        {m.streaming && m.content && (
                          <span className="inline-block w-1.5 h-3.5 ml-1 bg-primary animate-pulse align-middle rounded-full" />
                        )}
                      </div>

                      {/* Barra de Ações do Charlie (Copiar Resposta) */}
                      {!m.streaming && m.content && (
                        <div className="flex items-center justify-end pt-2 border-t border-border/30 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(messageId, m.content)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-muted/50 text-[10.5px] text-muted-foreground hover:text-foreground transition-all"
                            title="Copiar resposta inteira"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copiado</span>
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
          })
        )}

        {/* Indicador de Carregamento Geral */}
        {isLoading &&
          (messages.length === 0 ||
            messages[messages.length - 1].type === "user_message") && (
            <div className="flex gap-3 justify-start animate-fade-in">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 mt-1 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-card/75 border border-border/60 px-4 py-3 rounded-2xl rounded-tl-xs flex items-center gap-2 text-xs text-muted-foreground shadow-md backdrop-blur-md">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Charlie está raciocinando...</span>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Caixa de Entrada com Auto-expand */}
      <div className="p-4 border-t border-border/40 bg-card/40 backdrop-blur-lg">
        <form onSubmit={handleSubmit} className="relative flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mande uma mensagem ou comando para o Charlie... (Enter para enviar, Shift+Enter para nova linha)"
            rows={1}
            disabled={isLoading}
            className="w-full bg-input/40 border border-border/70 rounded-xl px-4 py-3 pr-12 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all resize-none max-h-36 leading-relaxed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2.5 bottom-2.5 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:hover:bg-primary transition-all active:scale-95 shadow-md shadow-primary/20"
            title="Enviar mensagem"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
        <div className="text-[10px] text-muted-foreground/60 text-center mt-2 flex items-center justify-center gap-2 select-none">
          <span>
            Atalho rápido: <kbd className="px-1 py-0.5 bg-muted/40 rounded border border-border/50 text-[9px] font-mono">Ctrl</kbd> + <kbd className="px-1 py-0.5 bg-muted/40 rounded border border-border/50 text-[9px] font-mono">Alt</kbd> + <kbd className="px-1 py-0.5 bg-muted/40 rounded border border-border/50 text-[9px] font-mono">Espaço</kbd> para Charlie Spotlight
          </span>
        </div>
      </div>
    </div>
  );
};
