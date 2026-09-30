import React, { useState } from "react";
import {
  X,
  Keyboard,
  Globe,
  MessageSquare,
  Zap,
  PenTool,
  Search,
} from "lucide-react";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  badge?: string;
  category: "global" | "navigation" | "composer" | "system";
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const [filter, setFilter] = useState("");

  if (!isOpen) return null;

  const shortcuts: ShortcutItem[] = [
    // 1. Globais do Sistema
    {
      keys: ["Ctrl", "Alt", "Espaço"],
      description: "Abrir / Ocultar Charlie Spotlight (Paleta Flutuante de qualquer lugar do PC)",
      badge: "Global Windows",
      category: "global",
    },

    // 2. Navegação & Janela
    {
      keys: ["Ctrl", "/"],
      description: "Abrir esta Central de Atalhos",
      category: "navigation",
    },
    {
      keys: ["Ctrl", "N"],
      description: "Criar uma Nova Conversa limpa",
      category: "navigation",
    },
    {
      keys: ["Ctrl", "F"],
      description: "Pesquisar conversas na barra lateral",
      category: "navigation",
    },
    {
      keys: ["Ctrl", ","],
      description: "Abrir Preferências e Configurações",
      category: "navigation",
    },
    {
      keys: ["Esc"],
      description: "Fechar janelas modais, buscas ou paletas ativas",
      category: "navigation",
    },

    // 3. Conversa & Composer
    {
      keys: ["Enter"],
      description: "Enviar a mensagem digitada imediatamente",
      category: "composer",
    },
    {
      keys: ["Shift", "Enter"],
      description: "Inserir nova linha no campo de texto",
      category: "composer",
    },
    {
      keys: ["Ctrl", "L"],
      description: "Limpar histórico da conversa ativa",
      category: "composer",
    },
    {
      keys: ["Ctrl", "M"],
      description: "Alternar modo de voz (Respostas faladas vs. Silencioso)",
      category: "composer",
    },
    {
      keys: ["Ctrl", "Shift", "C"],
      description: "Copiar o conteúdo da última resposta do Charlie",
      category: "composer",
    },

    // 4. Ações do Sistema Operacional
    {
      keys: ["Ctrl", "Shift", "S"],
      description: "Capturar tela atual (PrintScreen) e salvar",
      badge: "Automação",
      category: "system",
    },
    {
      keys: ["Ctrl", "Shift", "L"],
      description: "Bloquear sessão do Windows instantaneamente",
      badge: "Automação",
      category: "system",
    },
  ];

  const filteredShortcuts = shortcuts.filter(
    (s) =>
      s.description.toLowerCase().includes(filter.toLowerCase()) ||
      s.keys.some((k) => k.toLowerCase().includes(filter.toLowerCase()))
  );

  const categories = [
    { id: "global", label: "Atalhos Globais do Sistema", icon: Globe },
    { id: "navigation", label: "Navegação & Janelas", icon: MessageSquare },
    { id: "composer", label: "Conversa & Edição", icon: PenTool },
    { id: "system", label: "Controles Rápidos do Computador", icon: Zap },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[0_25px_70px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[85vh] ring-1 ring-[var(--accent)]/20 animate-scale-in text-[var(--text-primary)]"
      >
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent-soft-bg)] border border-[var(--accent-soft-border)] text-[var(--accent)] flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Central de Atalhos de Teclado
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Agilize sua rotina com comandos rápidos e práticos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Busca de Atalhos */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface-hover)] border border-[var(--border)] focus-within:border-[rgba(139,124,255,0.55)]">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="Buscar atalho por tecla ou ação (ex: voz, print, spotlight)..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
        </div>

        {/* Lista de Atalhos Categorizada */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {categories.map((cat) => {
            const items = filteredShortcuts.filter((s) => s.category === cat.id);
            if (items.length === 0) return null;
            const Icon = cat.icon;

            return (
              <div key={cat.id} className="space-y-2.5">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  <Icon className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{cat.label}</span>
                </div>

                <div className="divide-y divide-[var(--border)]/50 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-hover)]/30 overflow-hidden">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-4 hover:bg-[var(--surface-hover)]/60 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] text-[var(--text-primary)]">
                          {item.description}
                        </span>
                        {item.badge && (
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[var(--accent-soft-bg)] text-[var(--accent)] font-medium border border-[var(--accent-soft-border)]">
                            {item.badge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kIdx) => (
                          <React.Fragment key={kIdx}>
                            <kbd className="px-2 py-1 min-w-[24px] text-center font-mono text-[11px] font-medium bg-[var(--surface-elevated)] border border-[var(--border)] rounded text-[var(--accent)] shadow-sm">
                              {k}
                            </kbd>
                            {kIdx < item.keys.length - 1 && (
                              <span className="text-[var(--text-muted)] text-[10px]">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredShortcuts.length === 0 && (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              Nenhum atalho encontrado para "{filter}"
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--surface)]/40 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Pressione <kbd className="px-1.5 py-0.5 bg-[var(--surface-hover)] rounded border border-[var(--border)] font-mono text-[10px]">Esc</kbd> para fechar este guia</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors font-medium text-xs cursor-pointer"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};
