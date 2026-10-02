import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  Plus,
  RotateCcw,
  Sliders,
  Check,
  X,
  FileCode,
} from 'lucide-react';
import { ConnectionStatus, CharlieAIStatus, Thread, Message } from '../../types/chat';
import { Badge } from '../ui/Badge';

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
  onOpenSettings: () => void;
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
  onOpenSettings,
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
    <header className="h-14 border-b border-white/[0.06] bg-[#0A0B0E]/90 backdrop-blur-md px-4 flex items-center justify-between z-10 select-none">
      {/* Left: Sidebar Toggle & Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-1 text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer"
          title="Alternar barra lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        {isEditingTitle ? (
          <div className="flex items-center gap-1.5 max-w-xs sm:max-w-md w-full">
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
          <div className="flex items-center gap-2 min-w-0">
            <h1
              onClick={() => setIsEditingTitle(true)}
              className="text-sm font-semibold text-[#F3F4F6] truncate max-w-[200px] sm:max-w-md cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5 group"
              title="Clique para renomear"
            >
              <span>{activeThread?.name || 'Nova Conversa'}</span>
              <Pencil className="w-3 h-3 text-[#6B7280] opacity-0 group-hover:opacity-100 transition-opacity" />
            </h1>
          </div>
        )}
      </div>

      {/* Right: Status Badges & Context Menu */}
      <div className="flex items-center gap-2">
        {/* Charlie Status */}
        {charlieStatus === 'thinking' && (
          <Badge variant="info" dot className="hidden sm:inline-flex">
            Pensando
          </Badge>
        )}
        {charlieStatus === 'speaking' && (
          <Badge variant="success" dot className="hidden sm:inline-flex">
            Transmitindo
          </Badge>
        )}

        {/* Server Connection Indicator */}
        <Badge
          variant={connectionStatus === 'online' ? 'success' : 'danger'}
          dot
          className="text-[10px]"
        >
          {connectionStatus === 'online' ? 'Online' : 'Offline'}
        </Badge>

        {/* Action: New Chat Quick Button */}
        <button
          onClick={onNewThread}
          className="p-2 text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer hidden sm:flex"
          title="Nova Conversa [N]"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Context Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="p-2 text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer"
            title="Menu de contexto"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#12141A] border border-white/[0.08] shadow-2xl py-1.5 z-50 animate-slide-up text-xs">
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
                  onClearChat();
                  setIsMenuOpen(false);
                }}
                disabled={messages.length === 0}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Limpar mensagens</span>
              </button>

              <div className="my-1 border-t border-white/[0.06]" />

              <button
                onClick={() => {
                  onOpenSettings();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[#D1D5DB] hover:text-white hover:bg-white/[0.06] text-left cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Configurações</span>
              </button>

              {activeThread && (
                <>
                  <div className="my-1 border-t border-white/[0.06]" />
                  <button
                    onClick={() => {
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
