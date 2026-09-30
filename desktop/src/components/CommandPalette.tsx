import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Settings as SettingsIcon,
  MessageSquare,
  Music,
  Calculator,
  Lock,
  Globe,
  ArrowRight,
  Sparkles,
  Volume2,
  VolumeX,
  Camera,
} from "lucide-react";
import { Thread } from "../types";
import { executeDeviceTool } from "../services/deviceExecutor";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  threads: Thread[];
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onOpenSettings: () => void;
  onSendMessage: (text: string) => void;
}

interface PaletteAction {
  id: string;
  title: string;
  category: "Ações Rápidas" | "Comandos do Computador" | "Conversas";
  icon: React.ElementType;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  threads,
  onSelectThread,
  onNewThread,
  onOpenSettings,
  onSendMessage,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Ações base do Charlie Spotlight
  const baseActions: PaletteAction[] = [
    {
      id: "action-new-chat",
      title: "Nova Conversa",
      category: "Ações Rápidas",
      icon: Plus,
      shortcut: "Ctrl+N",
      run: () => {
        onNewThread();
        onClose();
      },
    },
    {
      id: "action-settings",
      title: "Abrir Preferências",
      category: "Ações Rápidas",
      icon: SettingsIcon,
      shortcut: "Ctrl+,",
      run: () => {
        onOpenSettings();
        onClose();
      },
    },
    {
      id: "tool-spotify",
      title: "Abrir Spotify",
      category: "Comandos do Computador",
      icon: Music,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "spotify", action: "open" });
        onClose();
      },
    },
    {
      id: "tool-chrome",
      title: "Abrir Google Chrome",
      category: "Comandos do Computador",
      icon: Globe,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "chrome", action: "open" });
        onClose();
      },
    },
    {
      id: "tool-calc",
      title: "Abrir Calculadora",
      category: "Comandos do Computador",
      icon: Calculator,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "calc", action: "open" });
        onClose();
      },
    },
    {
      id: "tool-screenshot",
      title: "Capturar Tela (PrintScreen)",
      category: "Comandos do Computador",
      icon: Camera,
      run: () => {
        executeDeviceTool("take_screenshot", {});
        onClose();
      },
    },
    {
      id: "tool-volume-up",
      title: "Aumentar Volume do Sistema",
      category: "Comandos do Computador",
      icon: Volume2,
      run: () => {
        executeDeviceTool("set_system_volume", { level: 75 });
        onClose();
      },
    },
    {
      id: "tool-volume-mute",
      title: "Silenciar / Mutar Volume",
      category: "Comandos do Computador",
      icon: VolumeX,
      run: () => {
        executeDeviceTool("set_system_volume", { mute: true });
        onClose();
      },
    },
    {
      id: "tool-lock",
      title: "Bloquear Estação de Trabalho",
      category: "Comandos do Computador",
      icon: Lock,
      run: () => {
        executeDeviceTool("system_power_action", { action: "lock" });
        onClose();
      },
    },
  ];

  // Ações dinâmicas das conversas salvas
  const threadActions: PaletteAction[] = threads.map((t) => ({
    id: `thread-${t.id}`,
    title: t.name || "Conversa sem título",
    category: "Conversas",
    icon: MessageSquare,
    run: () => {
      onSelectThread(t.id);
      onClose();
    },
  }));

  // Ação dinâmica para perguntas diretas caso o usuário digite um prompt livre
  const askAction: PaletteAction | null = query.trim()
    ? {
        id: "ask-charlie",
        title: `Perguntar ao Charlie: "${query.trim()}"`,
        category: "Ações Rápidas",
        icon: Sparkles,
        run: () => {
          onSendMessage(query.trim());
          onClose();
        },
      }
    : null;

  // Filtra ações conforme o texto digitado
  const filteredBase = baseActions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase())
  );
  const filteredThreads = threadActions.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  );

  const allActions: PaletteAction[] = [
    ...(askAction ? [askAction] : []),
    ...filteredBase,
    ...filteredThreads,
  ];

  // Ajusta seleção se tamanho da lista mudar
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Teclado: Navegação pelas setas, Enter e Esc
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-24 px-4 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-card/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-2xl ring-1 ring-white/10 animate-scale-in"
      >
        {/* Barra de Busca Minimalista Estilo Raycast / Spotlight */}
        <div className="flex items-center px-4 py-3.5 border-b border-border/50 gap-3 bg-card/40">
          <div className="w-7 h-7 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden p-1 shadow-sm">
            <img src="/charlie-logo.svg" alt="Charlie" className="w-full h-full object-contain" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="O que você deseja fazer? (Ex: 'Tocar música', 'Abrir Chrome' ou faça uma pergunta...)"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-muted-foreground/80 bg-muted/50 border border-border/60 rounded-md">
            Esc para fechar
          </kbd>
        </div>

        {/* Lista de Resultados Agrupada */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2 space-y-1">
          {allActions.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Nenhuma ação encontrada para "{query}"
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
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-foreground hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? "bg-white/20 text-white" : "bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-medium truncate">{action.title}</div>
                      <div
                        className={`text-[10px] truncate ${
                          isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {action.category}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {action.shortcut && (
                      <kbd
                        className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-muted/60 text-muted-foreground border border-border/60"
                        }`}
                      >
                        {action.shortcut}
                      </kbd>
                    )}
                    <ArrowRight
                      className={`w-3.5 h-3.5 ${
                        isSelected ? "opacity-100" : "opacity-0"
                      } transition-opacity`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé Informativo */}
        <div className="px-4 py-2 bg-card/60 border-t border-border/40 flex items-center justify-between text-[10.5px] text-muted-foreground/70 select-none">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1 py-0.2 bg-muted/60 rounded text-[9px] font-mono">↑</kbd>
            <kbd className="px-1 py-0.2 bg-muted/60 rounded text-[9px] font-mono">↓</kbd>
            para navegar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1 py-0.2 bg-muted/60 rounded text-[9px] font-mono">Enter</kbd>
            para executar
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            Charlie Spotlight • Ctrl + Alt + Espaço
          </span>
        </div>
      </div>
    </div>
  );
};
