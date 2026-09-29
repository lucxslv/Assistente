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
} from "lucide-react";
import { Message } from "../types";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string, skipTts: boolean) => void;
  currentThreadName?: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  onSendMessage,
  currentThreadName,
}) => {
  const [input, setInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim(), !voiceEnabled);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = [
    { icon: Music, label: "Tocar música", prompt: "Toca Imagine Dragons Believer" },
    { icon: Cloud, label: "Previsão do tempo", prompt: "Como está o tempo hoje?" },
    { icon: Search, label: "Pesquisar na Web", prompt: "Quais as principais notícias de tecnologia hoje?" },
    { icon: AppWindow, label: "Abrir aplicativo", prompt: "Abre o Chrome pra mim" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Topo / Barra de Título */}
      <div className="h-14 border-b border-border/40 px-6 flex items-center justify-between bg-card/20 backdrop-blur-sm z-10 select-none">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground/80 tracking-wide">
            {currentThreadName || "Conversa Atual"}
          </span>
        </div>

        {/* Botão de Voz / TTS */}
        <button
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            voiceEnabled
              ? "bg-primary/20 text-primary border border-primary/30"
              : "text-muted-foreground hover:bg-muted/40"
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
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto select-none py-12">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600/30 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center shadow-xl shadow-blue-500/10 mb-4 animate-bounce-slow">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">Como posso te ajudar hoje?</h2>
            <p className="text-xs text-muted-foreground mb-8">
              Controle seu computador, toque músicas, gerencie arquivos ou converse naturalmente.
            </p>

            <div className="grid grid-cols-2 gap-2.5 w-full">
              {suggestions.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(s.prompt);
                      inputRef.current?.focus();
                    }}
                    className="p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-card/90 hover:border-primary/40 text-left transition-all group flex items-start gap-3"
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
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
            return (
              <div
                key={m.id || idx}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[78%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/15 rounded-tr-sm"
                      : "bg-card/70 border border-border/60 text-foreground shadow-sm rounded-tl-sm backdrop-blur-md"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  ) : (
                    <div>
                      {/* Ferramentas executadas nesta mensagem */}
                      {m.tools && m.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2.5">
                          {m.tools.map((t, tIdx) => (
                            <div
                              key={tIdx}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border transition-all ${
                                t.status === "executing"
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
                                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              }`}
                            >
                              {t.status === "executing" ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              )}
                              <span>
                                {t.status === "executing" ? "Executando" : "Chamou"} {t.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Conteúdo em Markdown com Streaming */}
                      <div className="prose prose-invert prose-xs max-w-none space-y-2">
                        {m.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        ) : m.streaming ? (
                          <span className="text-muted-foreground flex items-center gap-1.5 italic">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            Charlie está pensando...
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

        {/* Indicador de Carregamento Geral (quando aguardando primeira resposta) */}
        {isLoading &&
          (messages.length === 0 ||
            messages[messages.length - 1].type === "user_message") && (
            <div className="flex gap-3 justify-start animate-fade-in">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20 mt-1 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-card/60 border border-border/60 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Charlie está raciocinando...</span>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Caixa de Entrada */}
      <div className="p-4 border-t border-border/40 bg-card/30 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Mande uma mensagem ou comando para o Charlie... (Enter para enviar)"
            rows={1}
            disabled={isLoading}
            className="w-full bg-input/40 border border-border/70 rounded-xl px-4 py-3 pr-12 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all resize-none max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary transition-all active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
