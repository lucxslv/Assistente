import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  RotateCcw,
  Sliders,
  Check,
  X,
  FileCode,
  Shield,
  SquarePen,
} from 'lucide-react';
import { ConnectionStatus, CharlieAIStatus, Thread, Message } from '../../types/chat';
import { Badge } from '../ui/Badge';
import { hapticFeedback } from '../../utils/haptics';

interface HeaderProps {
  activeThread: Thread | null;
  connectionStatus: ConnectionStatus;
  charlieStatus: CharlieAIStatus;
  messages: Message[];
  onToggleSidebar: () => void;
  onNewThread: () => void;
  onRenameThread: (newName: string) => void;
  onDeleteThread: () => void;
  onClearChat: () => void;
  onOpenAudit?: () => void;
  isAdmin?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeThread,
  connectionStatus,
  charlieStatus,
  messages,
  onToggleSidebar,
  onNewThread,
  onRenameThread,
  onDeleteThread,
  onClearChat,
  onOpenAudit,
  isAdmin = false,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(activeThread?.name || '');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditedTitle(activeThread?.name || 'Nova Conversa');
  }, [activeThread]);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  // Click outside menu listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleSaveTitle = () => {
    if (editedTitle.trim()) {
      onRenameThread(editedTitle.trim());
    } else {
      setEditedTitle(activeThread?.name || 'Nova Conversa');
    }
    setIsEditingTitle(false);
  };

  const exportAsMarkdown = () => {
    if (messages.length === 0) return;
    const content = messages
      .map((m) => `### ${m.role === 'user' ? 'Usuário' : 'Charlie'} (${m.createdAt})\n\n${m.content}\n\n---`)
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeThread?.name || 'conversa'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const exportAsJson = () => {
    if (messages.length === 0) return;
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeThread?.name || 'conversa'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 w-full min-h-14 pt-[env(safe-area-inset-top,0px)] border-b border-white/[0.06] bg-[#0A0B0E]/95 backdrop-blur-md px-2.5 sm:px-4 flex items-center justify-between select-none flex-shrink-0">
      {/* Left: Sidebar Toggle & Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <button
          onClick={() => {
            hapticFeedback.light();
            onToggleSidebar();
          }}
          className="md:hidden min-h-[44px] min-w-[44px] -ml-1 sm:ml-0 text-[#9CA3AF] hover:text-[#F3F4F6] active:bg-white/[0.08] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
          title="Alternar barra lateral"
          aria-label="Abrir menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Header: App Brand with Logo + Active Thread Title + Subtle Status Indicator */}
        <div className="flex md:hidden items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-black border border-white/[0.08] flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0 shadow-sm">
            <img src="/logo.png" alt="Charlie" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold tracking-tight text-[#F3F4F6] truncate max-w-[150px] sm:max-w-xs">
                {activeThread?.name || 'Nova Conversa'}
              </span>
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  connectionStatus === 'online'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'bg-red-400'
                }`}
                title={connectionStatus === 'online' ? 'Online' : 'Offline'}
              />
            </div>
            {charlieStatus !== 'idle' && (
              <span className="text-[10px] text-primary font-mono truncate animate-pulse leading-none mt-0.5">
                {charlieStatus === 'thinking' ? 'pensando...' : 'respondendo...'}
              </span>
            )}
          </div>
        </div>

        {/* Desktop Header: Renameable Thread Title */}
        <div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 max-w-md w-full">
              <input
                ref={inputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                className="bg-[#181B22] border border-primary/50 text-[#F3F4F6] text-sm px-2.5 py-1 rounded-md focus:outline-none w-full"
              />
              <button
                onClick={handleSaveTitle}
                className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditingTitle(false)}
                className="p-1 rounded text-[#9CA3AF] hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <h1
              onClick={() => setIsEditingTitle(true)}
              className="text-sm font-semibold text-[#F3F4F6] truncate max-w-md cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5 group"
              title="Clique para renomear"
            >
              <span>{activeThread?.name || 'Nova Conversa'}</span>
              <Pencil className="w-3 h-3 text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity" />
            </h1>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-0.5 sm:gap-2">
        {/* Mobile: Quick New Chat Button */}
        <button
          onClick={() => {
            hapticFeedback.light();
            onNewThread();
          }}
          className="md:hidden min-h-[44px] min-w-[44px] text-[#9CA3AF] hover:text-[#F3F4F6] active:bg-white/[0.08] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
          title="Nova Conversa"
          aria-label="Iniciar nova conversa"
        >
          <SquarePen className="w-4 h-4" />
        </button>

        {/* Charlie Status (Desktop) */}
        {charlieStatus === 'thinking' && (
          <Badge variant="info" dot className="hidden md:inline-flex text-[10px]">
            Pensando
          </Badge>
        )}
        {charlieStatus === 'speaking' && (
          <Badge variant="success" dot className="hidden md:inline-flex text-[10px]">
            Transmitindo
          </Badge>
        )}

        {/* Server Connection Indicator (Desktop) */}
        <Badge
          variant={connectionStatus === 'online' ? 'success' : 'danger'}
          dot
          className="hidden md:inline-flex text-[10px]"
        >
          {connectionStatus === 'online' ? 'Online' : 'Offline'}
        </Badge>

        {/* Context Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="min-h-[44px] min-w-[44px] text-[#9CA3AF] hover:text-[#F3F4F6] active:bg-white/[0.08] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
            title="Mais opções"
            aria-label="Mais opções"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#12141A] border border-white/[0.08] shadow-2xl py-1.5 z-50 animate-slide-up text-xs">
              {isAdmin && onOpenAudit && (
                <>
                  <button
                    onClick={() => {
                      onOpenAudit();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-emerald-500/10 text-left cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-medium text-emerald-400">Vault de Auditoria</span>
                  </button>
                  <div className="my-1 border-t border-white/[0.06]" />
                </>
              )}

              <button
                onClick={() => {
                  setIsEditingTitle(true);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] text-left cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Renomear conversa</span>
              </button>

              <button
                onClick={exportAsMarkdown}
                disabled={messages.length === 0}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Exportar como Markdown</span>
              </button>

              <button
                onClick={exportAsJson}
                disabled={messages.length === 0}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileCode className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Exportar como JSON</span>
              </button>

              <button
                onClick={() => {
                  hapticFeedback.warning();
                  onClearChat();
                  setIsMenuOpen(false);
                }}
                disabled={messages.length === 0}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Limpar mensagens</span>
              </button>

              {activeThread && (
                <>
                  <div className="my-1 border-t border-white/[0.06]" />
                  <button
                    onClick={() => {
                      hapticFeedback.warning();
                      onDeleteThread();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-left cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir conversa</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
