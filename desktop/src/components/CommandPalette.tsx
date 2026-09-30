import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Settings as SettingsIcon,
  MessageSquare,
  Music,
  Calculator,
  Lock,
  Cloud,
  Globe,
  Command,
  ArrowRight,
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
  category: "Ações" | "Conversas" | "Comandos Locais";
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

  // Lista estática de ações rápidas
  const baseActions: PaletteAction[] = [
    {
      id: "action-new-chat",
      title: "Nova Conversa",
      category: "Ações",
      icon: Plus,
      shortcut: "Ctrl+N",
      run: () => {
        onNewThread();
        onClose();
      },
    },
    {
      id: "action-settings",
      title: "Configurações do Cérebro na Nuvem",
      category: "Ações",
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
      category: "Comandos Locais",
      icon: Music,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "spotify", action: "open" });
        onClose();
      },
    },
    {
      id: "tool-calc",
      title: "Abrir Calculadora do Windows",
      category: "Comandos Locais",
      icon: Calculator,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "calc", action: "open" });
        onClose();
      },
    },
    {
      id: "tool-chrome",
      title: "Abrir Google Chrome",
      category: "Comandos Locais",
      icon: Globe,
      run: () => {
        executeDeviceTool("manage_application", { app_name: "chrome", action: "open" });
        onClose();
      },
    },
    {
      id: "tool-lock",
      title: "Bloquear Estação de Trabalho",
      category: "Comandos Locais",
      icon: Lock,
      run: () => {
        executeDeviceTool("system_power_action", { action: "lock" });
        onClose();
      },
    },
    {
      id: "prompt-weather",
      title: "Perguntar: 'Como está o clima hoje?'",
      category: "Ações",
      icon: Cloud,
      run: () => {
        onSendMessage("Como está o clima hoje?");
        onClose();
      },
    },
    {
      id: "prompt-news",
      title: "Pesquisar: 'Principais notícias de tecnologia hoje'",
      category: "Ações",
      icon: Globe,
      run: () => {
        onSendMessage("Pesquise as principais notícias de tecnologia de hoje.");
        onClose();
      },
    },
  ];

  // Adiciona as conversas do histórico como itens pesquisáveis
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

  const allItems = [...baseActions, ...threadActions];

  // Filtra itens com base na busca
  const filteredItems = query.trim()
    ? allItems.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  // Navegação por teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].run();
      }
    }
  };

  useEffect(() => {
    // Garante que o item ativo esteja visível
    const activeEl = listRef.current?.children[selectedIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center pt-24 p-4 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-card/90 border border-border/70 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col max-h-[70vh] animate-scale-in"
      >
        {/* Barra de Pesquisa */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-border/50 bg-muted/20">
          <Search className="w-4 h-4 text-muted-foreground mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Digite um comando, aplicativo ou pesquise conversas..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border/60 rounded">
              ESC
            </kbd>
          </div>
        </div>

        {/* Lista de Resultados */}
        <div ref={listRef} className="overflow-y-auto p-2 space-y-1 divide-y divide-border/20">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Nenhum comando ou conversa encontrada para &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.run}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all text-xs ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20"
                      : "text-foreground/90 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="truncate">{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-mono ${
                        isSelected ? "text-primary-foreground/70" : "text-muted-foreground/60"
                      }`}
                    >
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd
                        className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${
                          isSelected
                            ? "bg-primary-foreground/20 border-primary-foreground/30 text-primary-foreground"
                            : "bg-muted border-border/60 text-muted-foreground"
                        }`}
                      >
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Dicas de Atalho */}
        <div className="px-4 py-2 border-t border-border/40 bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono">↑↓</kbd> navegar
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> selecionar
            </span>
          </div>
          <span className="flex items-center gap-1 font-mono">
            <Command className="w-3 h-3 text-primary" /> Charlie Quick Commands
          </span>
        </div>
      </div>
    </div>
  );
};
