import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  RotateCcw,
  FileCode,
  Shield,
  SquarePen,
  PanelLeftClose,
  PanelLeft,
  Search,
  ChevronRight,
} from 'lucide-react';
import { ConnectionStatus, CharlieAIStatus, Thread, Message } from '../../types/chat';
import { User } from '../../types/auth';
import { Badge } from '../ui/Badge';
import { RenameThreadModal } from './RenameThreadModal';
import { hapticFeedback } from '../../utils/haptics';

interface HeaderProps {
  activeThread: Thread | null;
  connectionStatus: ConnectionStatus;
  charlieStatus: CharlieAIStatus;
  messages: Message[];
  user: User | null;
  isSidebarCollapsed: boolean;
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
  user,
  isSidebarCollapsed,
  onToggleSidebar,
  onNewThread,
  onRenameThread,
  onDeleteThread,
  onClearChat,
  onOpenAudit,
  isAdmin = false,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleSaveTitle = (newName: string) => onRenameThread(newName);

  const exportAsMarkdown = () => {
    if (messages.length === 0) return;
    const content = messages.map((m) => `### ${m.role === 'user' ? 'Usuário' : 'Charlie'} (${m.createdAt})\n\n${m.content}\n\n---`).join('\n\n');
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
    <header className="relative z-30 w-full min-h-[56px] border-b border-white/[0.06] bg-[#161618] px-3 sm:px-5 flex items-center justify-between gap-3 select-none shrink-0">
      {/* Left: collapse icon + breadcrumbs */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          onClick={() => { hapticFeedback.light(); onToggleSidebar(); }}
          className="hidden md:flex w-8 h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06] items-center justify-center shrink-0 transition-colors cursor-pointer"
          title={isSidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-label="Alternar barra lateral"
        >
          {isSidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <button
          onClick={() => { hapticFeedback.light(); onToggleSidebar(); }}
          className="md:hidden w-8 h-8 rounded-lg text-white/50 hover:text-white flex items-center justify-center cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumbs — flat, slash separator, low-contrast trail */}
        <nav className="hidden sm:flex items-center gap-1.5 min-w-0 text-[13px]" aria-label="Navegação">
          <span className="text-white/35">Workspace</span>
          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
          <span className="text-white/35">Conversas</span>
          <span className="text-white/20 mx-1">/</span>
          <button
            onClick={() => { hapticFeedback.light(); setIsRenameModalOpen(true); }}
            className="text-white font-[550] truncate max-w-[220px] hover:text-white/90 text-left cursor-pointer"
            title="Clique para renomear"
          >
            {activeThread?.name || 'Nova conversa'}
          </button>
          <Pencil className="w-3 h-3 text-white/25 shrink-0 hidden lg:block" />
        </nav>

        {/* Mobile title fallback */}
        <div className="flex sm:hidden items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={() => { hapticFeedback.light(); setIsRenameModalOpen(true); }}
            className="text-[13px] font-semibold text-white truncate text-left cursor-pointer"
          >
            {activeThread?.name || 'Nova conversa'}
          </button>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connectionStatus === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
        </div>

        {(charlieStatus === 'thinking' || charlieStatus === 'speaking') && (
          <span className="hidden lg:inline-flex text-[11px] font-mono text-white/40 animate-pulse ml-1">
            {charlieStatus === 'thinking' ? 'pensando…' : 'respondendo…'}
          </span>
        )}
      </div>

      {/* Right: pill search + circular avatar */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => { hapticFeedback.light(); onNewThread(); }}
          className="md:hidden w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-pointer"
          title="Nova conversa"
          aria-label="Nova conversa"
        >
          <SquarePen className="w-4 h-4" />
        </button>

        {charlieStatus === 'thinking' && <Badge variant="info" dot className="hidden lg:inline-flex text-[11px]">Pensando</Badge>}
        {charlieStatus === 'speaking' && <Badge variant="success" dot className="hidden lg:inline-flex text-[11px]">Transmitindo</Badge>}
        {charlieStatus === 'error' && <Badge variant="danger" dot className="hidden lg:inline-flex text-[11px]">Erro</Badge>}

        {/* Pill search — flat, no shadow, subtle border */}
        <div className="hidden sm:flex items-center gap-2 h-9 px-3.5 rounded-full bg-[#1E1E20] border border-white/[0.06] text-[13px] text-white/40 min-w-[180px] max-w-[260px]">
          <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <input
            type="text"
            placeholder="Buscar"
            className="bg-transparent outline-none text-white placeholder:text-white/30 w-full text-[13px]"
            aria-label="Buscar"
          />
        </div>

        {/* Circular avatar */}
        <div className="w-8 h-8 rounded-full bg-white border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.name || 'Perfil'} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] font-bold text-black">{(user?.name || 'CH').slice(0, 2).toUpperCase()}</span>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen((v) => !v)}
            className="w-8 h-8 rounded-full border border-white/[0.07] bg-white/[0.03] text-white/50 hover:text-white hover:bg-white/[0.06] flex items-center justify-center cursor-pointer"
            title="Mais opções"
            aria-label="Mais opções"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#1A1A1E] border border-white/[0.08] shadow-2xl py-1.5 z-50 animate-slide-up text-[13px]">
              {isAdmin && onOpenAudit && (
                <>
                  <button onClick={() => { onOpenAudit(); setIsMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-white hover:bg-white/[0.06] text-left cursor-pointer">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-medium text-emerald-300">Vault de Auditoria</span>
                  </button>
                  <div className="my-1 border-t border-white/[0.06]" />
                </>
              )}
              <button onClick={() => { hapticFeedback.light(); setIsRenameModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-white/70 hover:text-white hover:bg-white/[0.06] text-left cursor-pointer">
                <Pencil className="w-3.5 h-3.5" /><span>Renomear conversa</span>
              </button>
              <button onClick={exportAsMarkdown} disabled={messages.length === 0} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-white/70 hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /><span>Exportar Markdown</span>
              </button>
              <button onClick={exportAsJson} disabled={messages.length === 0} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-white/70 hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40">
                <FileCode className="w-3.5 h-3.5" /><span>Exportar JSON</span>
              </button>
              <button onClick={() => { hapticFeedback.warning(); onClearChat(); setIsMenuOpen(false); }} disabled={messages.length === 0} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-white/70 hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40">
                <RotateCcw className="w-3.5 h-3.5" /><span>Limpar mensagens</span>
              </button>
              {activeThread && (
                <>
                  <div className="my-1 border-t border-white/[0.06]" />
                  <button onClick={() => { hapticFeedback.warning(); onDeleteThread(); setIsMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-red-300 hover:text-red-200 hover:bg-red-500/10 text-left cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /><span>Excluir conversa</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <RenameThreadModal isOpen={isRenameModalOpen} initialName={activeThread?.name || 'Nova Conversa'} onClose={() => setIsRenameModalOpen(false)} onSave={handleSaveTitle} />
    </header>
  );
};
