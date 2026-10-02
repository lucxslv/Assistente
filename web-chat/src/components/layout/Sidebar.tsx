import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Sparkles,
  User as UserIcon,
  ChevronRight,
  LogOut,
  Check,
  Shield,
} from 'lucide-react';
import { Thread, ConnectionStatus } from '../../types/chat';
import { User } from '../../types/auth';
import { groupThreadsByPeriod, formatTimeOrDate } from '../../utils/formatters';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  threads: Thread[];
  activeThreadId: string | null;
  connectionStatus: ConnectionStatus;
  user: User | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onRenameThread: (threadId: string, newName: string) => void;
  onDeleteThread: (threadId: string) => void;
  onLogout: () => void;
  onOpenAudit?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  threads,
  activeThreadId,
  connectionStatus,
  user,
  onSelectThread,
  onNewThread,
  onRenameThread,
  onDeleteThread,
  onLogout,
  onOpenAudit,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus rename input
  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingThreadId]);

  // Global Keyboard Shortcut [N] for new thread when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;

      if ((e.key === 'n' || e.key === 'N') && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onNewThread();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewThread]);

  // Filtered threads based on search query
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.preview && t.preview.toLowerCase().includes(q))
    );
  }, [threads, searchQuery]);

  // Grouped threads by period
  const groupedThreads = useMemo(() => {
    return groupThreadsByPeriod(filteredThreads);
  }, [filteredThreads]);

  const handleStartRename = (e: React.MouseEvent, thread: Thread) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditingName(thread.name);
  };

  const handleSaveRename = (threadId: string) => {
    if (editingName.trim()) {
      onRenameThread(threadId, editingName.trim());
    }
    setEditingThreadId(null);
  };

  const handleConfirmDelete = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    onDeleteThread(threadId);
    setThreadToDelete(null);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed md:static top-0 bottom-0 left-0 z-40 w-72 md:w-64 lg:w-72 bg-[#0E0F12] border-r border-white/[0.06] flex flex-col transition-transform duration-200 ease-in-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header: Brand & Status & Close */}
        <div className="p-3.5 sm:p-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#13151D] border border-white/[0.08] flex items-center justify-center text-primary shadow-glow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-[#F3F4F6]">
                  Charlie Web
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/[0.06] text-[#9CA3AF] font-mono">
                  v2.0
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connectionStatus === 'online'
                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse'
                      : 'bg-red-400'
                  }`}
                />
                <span className="text-[10px] text-[#9CA3AF] uppercase font-mono tracking-wider">
                  {connectionStatus === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Close button on mobile (< 768px) */}
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl text-[#9CA3AF] hover:text-[#F3F4F6] active:bg-white/[0.08] md:hidden cursor-pointer flex items-center justify-center -mr-1"
            title="Fechar menu lateral"
            aria-label="Fechar menu lateral"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action: + Nova Conversa Button */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewThread();
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#151821] hover:bg-[#1C202B] active:bg-[#202533] text-[#F3F4F6] border border-white/[0.08] hover:border-white/[0.14] transition-all duration-150 shadow-sm group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-primary-soft text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold">Nova Conversa</span>
            </div>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/40 border border-white/[0.08] text-[10px] font-mono text-[#6B7280] group-hover:text-[#9CA3AF]">
              N
            </kbd>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-[#6B7280] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full bg-[#12141A] border border-white/[0.06] rounded-lg pl-8 pr-7 py-1.5 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 p-0.5 text-[#6B7280] hover:text-[#F3F4F6] cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation History Grouped by Period */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
          {Object.keys(groupedThreads).length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#6B7280]">
              {searchQuery ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
            </div>
          ) : (
            Object.entries(groupedThreads).map(([period, threadList]) => (
              <div key={period} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] font-mono">
                  {period}
                </div>
                {threadList.map((thread) => {
                  const isActive = activeThreadId === thread.id;
                  const isEditing = editingThreadId === thread.id;
                  const isDeleting = threadToDelete === thread.id;

                  return (
                    <div
                      key={thread.id}
                      onClick={() => {
                        if (!isEditing && !isDeleting) {
                          onSelectThread(thread.id);
                          if (window.innerWidth < 768) onClose();
                        }
                      }}
                      className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-[#181B22] text-[#F3F4F6] font-medium border border-white/[0.08] shadow-sm'
                          : 'text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      {/* Thread Icon & Title */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-1">
                        <MessageSquare
                          className={`w-3.5 h-3.5 flex-shrink-0 ${
                            isActive ? 'text-primary' : 'text-[#6B7280]'
                          }`}
                        />
                        {isEditing ? (
                          <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(thread.id);
                                if (e.key === 'Escape') setEditingThreadId(null);
                              }}
                              className="bg-[#101217] border border-primary/50 text-[#F3F4F6] text-xs px-2 py-0.5 rounded w-full focus:outline-none"
                            />
                            <button
                              onClick={() => handleSaveRename(thread.id)}
                              className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingThreadId(null)}
                              className="p-1 text-[#9CA3AF] hover:bg-white/[0.06] rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : isDeleting ? (
                          <div className="flex items-center gap-2 text-red-400 text-[11px]" onClick={(e) => e.stopPropagation()}>
                            <span>Excluir?</span>
                            <button
                              onClick={(e) => handleConfirmDelete(e, thread.id)}
                              className="px-1.5 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium cursor-pointer"
                            >
                              Sim
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setThreadToDelete(null);
                              }}
                              className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[#9CA3AF] hover:text-white cursor-pointer"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate">{thread.name || 'Nova Conversa'}</span>
                          </div>
                        )}
                      </div>

                      {/* Hover Actions: Rename & Delete */}
                      {!isEditing && !isDeleting && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleStartRename(e, thread)}
                            className="p-1 rounded text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] transition-colors cursor-pointer"
                            title="Renomear conversa"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setThreadToDelete(thread.id);
                            }}
                            className="p-1 rounded text-[#9CA3AF] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Excluir conversa"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Audit & Cost Dashboard Action */}
        {onOpenAudit && (
          <div className="px-3 pb-2 pt-1 border-t border-white/[0.04]">
            <button
              onClick={() => {
                onOpenAudit();
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-emerald-500/10 active:bg-emerald-500/20 border border-white/[0.06] hover:border-emerald-500/30 text-xs text-[#D1D5DB] hover:text-white transition-all cursor-pointer group"
              title="Painel de Auditoria & Custos USD"
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="font-medium">Auditoria & Custos</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                USD
              </span>
            </button>
          </div>
        )}

        {/* Footer: Logged User & Logout Action */}
        <div className="p-3 border-t border-white/[0.06] bg-[#0A0B0E]/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2 p-1 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-[#181B22] border border-white/[0.08] flex items-center justify-center text-primary text-xs font-semibold uppercase flex-shrink-0">
              {user?.name ? user.name.slice(0, 2) : <UserIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-[#F3F4F6] truncate">
                {user?.name || 'Usuário Autenticado'}
              </span>
              <span className="text-[10px] text-[#6B7280] truncate">
                {user?.email || '● Conectado'}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="min-h-[44px] min-w-[44px] text-[#9CA3AF] hover:text-red-400 active:bg-red-500/10 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
            title="Sair da conta"
            aria-label="Sair da conta"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
