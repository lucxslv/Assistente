import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  User as UserIcon,
  LogOut,
  Shield,
  Pin,
  Archive,
  Settings,
} from 'lucide-react';
import { Thread, ConnectionStatus } from '../../types/chat';
import { User } from '../../types/auth';
import { groupThreadsByPeriod } from '../../utils/formatters';
import { hapticFeedback } from '../../utils/haptics';
import { RenameThreadModal } from './RenameThreadModal';

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
  onTogglePinThread?: (threadId: string) => void;
  onToggleArchiveThread?: (threadId: string) => void;
  onOpenProfile?: () => void;
  onLogout: () => void;
  onOpenAudit?: () => void;
  isAdmin?: boolean;
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
  onTogglePinThread,
  onToggleArchiveThread,
  onOpenProfile,
  onLogout,
  onOpenAudit,
  isAdmin = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [threadToRename, setThreadToRename] = useState<Thread | null>(null);
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);

  // Drawer Touch Drag State (< 768px)
  const [drawerDragX, setDrawerDragX] = useState<number | null>(null);
  const drawerTouchRef = useRef<{ startX: number; startY: number } | null>(null);
  const isDraggingDrawer = useRef(false);

  // Global Keyboard Shortcut [N] for new thread when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if ((e.key === 'n' || e.key === 'N') && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onNewThread();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewThread]);

  const archivedCount = useMemo(
    () => threads.filter((t) => Boolean(t.isArchived)).length,
    [threads]
  );

  // Filtered threads based on search query and archive mode
  const filteredThreads = useMemo(() => {
    const base = threads.filter((t) =>
      showArchived ? Boolean(t.isArchived) : !t.isArchived
    );
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.preview && t.preview.toLowerCase().includes(q))
    );
  }, [threads, searchQuery, showArchived]);

  const pinnedThreads = useMemo(
    () => (showArchived ? [] : filteredThreads.filter((t) => Boolean(t.isPinned))),
    [filteredThreads, showArchived]
  );

  const regularThreads = useMemo(
    () => (showArchived ? filteredThreads : filteredThreads.filter((t) => !t.isPinned)),
    [filteredThreads, showArchived]
  );

  // Grouped threads by period
  const groupedThreads = useMemo(() => {
    return groupThreadsByPeriod(regularThreads);
  }, [regularThreads]);

  // Drawer drag handlers for mobile swipe-to-close (< 768px)
  const handleDrawerTouchStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return;
    const touch = e.touches[0];
    drawerTouchRef.current = { startX: touch.clientX, startY: touch.clientY };
    isDraggingDrawer.current = false;
  };

  const handleDrawerTouchMove = (e: React.TouchEvent) => {
    if (!drawerTouchRef.current || window.innerWidth >= 768) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - drawerTouchRef.current.startX;
    const diffY = touch.clientY - drawerTouchRef.current.startY;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      isDraggingDrawer.current = true;
      if (diffX < 0) {
        setDrawerDragX(diffX);
      } else {
        setDrawerDragX(diffX * 0.15);
      }
    }
  };

  const handleDrawerTouchEnd = () => {
    if (drawerTouchRef.current && isDraggingDrawer.current) {
      if (drawerDragX !== null && drawerDragX < -60) {
        hapticFeedback.light();
        onClose();
      }
    }
    drawerTouchRef.current = null;
    isDraggingDrawer.current = false;
    setDrawerDragX(null);
  };

  const handleStartRename = (e: React.MouseEvent, thread: Thread) => {
    e.stopPropagation();
    setThreadToRename(thread);
  };

  const handleConfirmDelete = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    hapticFeedback.warning();
    onDeleteThread(threadId);
    setThreadToDelete(null);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 md:hidden transition-opacity"
          onClick={() => {
            hapticFeedback.light();
            onClose();
          }}
          aria-hidden="true"
          style={{
            opacity: drawerDragX !== null && drawerDragX < 0 ? Math.max(0, 1 + drawerDragX / 280) : 1,
          }}
        />
      )}

      {/* Sidebar Panel with Touch Drag Physics */}
      <aside
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
        style={{
          transform: drawerDragX !== null ? `translateX(${drawerDragX}px)` : undefined,
          transition: drawerDragX !== null ? 'none' : undefined,
        }}
        className={`fixed md:static top-0 bottom-0 left-0 z-40 w-72 md:w-64 lg:w-72 bg-[#0E0F12] border-r border-white/[0.06] flex flex-col transition-transform duration-200 ease-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header: Brand & Status & Close */}
        <div className="p-3.5 sm:p-4 pt-[max(0.875rem,env(safe-area-inset-top,0px))] border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center overflow-hidden shadow-glow-sm p-1 flex-shrink-0">
              <img src="/logo.png" alt="Charlie Logo" className="w-full h-full object-contain" />
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
            onClick={() => {
              hapticFeedback.light();
              onClose();
            }}
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
              hapticFeedback.select();
              setShowArchived(false);
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

        {/* Search Bar + Archive Toggle */}
        <div className="px-3 pb-2 space-y-1.5">
          <div className="relative flex items-center gap-1.5">
            <div className="relative flex-1 flex items-center">
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
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                showArchived
                  ? 'bg-primary/15 border-primary/40 text-primary font-medium'
                  : 'bg-[#12141A] border-white/[0.06] text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
              title={showArchived ? 'Voltar para conversas ativas' : `Ver conversas arquivadas (${archivedCount})`}
            >
              <Archive className="w-3.5 h-3.5" />
              {archivedCount > 0 && <span className="font-mono text-[10px]">{archivedCount}</span>}
            </button>
          </div>
        </div>

        {/* Conversation History Grouped by Period with Swipe Actions */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
          {showArchived && (
            <div className="px-3 py-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-amber-400/90 font-mono bg-amber-500/5 rounded-lg border border-amber-500/15 mx-1">
              <span>Conversas Arquivadas</span>
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className="text-[10px] text-[#9CA3AF] hover:text-white underline cursor-pointer"
              >
                Voltar
              </button>
            </div>
          )}

          {/* Pinned Section */}
          {pinnedThreads.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary font-mono">
                <Pin className="w-3 h-3" />
                <span>Fixadas</span>
              </div>
              {pinnedThreads.map((thread) => (
                <SidebarThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={activeThreadId === thread.id}
                  isDeleting={threadToDelete === thread.id}
                  onSelect={() => {
                    hapticFeedback.select();
                    onSelectThread(thread.id);
                    if (window.innerWidth < 768) onClose();
                  }}
                  onStartRename={(e) => handleStartRename(e, thread)}
                  onTogglePin={
                    onTogglePinThread
                      ? (e) => {
                          e.stopPropagation();
                          onTogglePinThread(thread.id);
                        }
                      : undefined
                  }
                  onToggleArchive={
                    onToggleArchiveThread
                      ? (e) => {
                          e.stopPropagation();
                          onToggleArchiveThread(thread.id);
                        }
                      : undefined
                  }
                  onStartDelete={(e) => {
                    e.stopPropagation();
                    setThreadToDelete(thread.id);
                  }}
                  onConfirmDelete={(e) => handleConfirmDelete(e, thread.id)}
                  onCancelDelete={() => setThreadToDelete(null)}
                />
              ))}
            </div>
          )}

          {Object.keys(groupedThreads).length === 0 && pinnedThreads.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#6B7280]">
              {searchQuery
                ? 'Nenhuma conversa encontrada.'
                : showArchived
                ? 'Nenhuma conversa arquivada.'
                : 'Nenhuma conversa ainda.'}
            </div>
          ) : (
            Object.entries(groupedThreads).map(([period, threadList]) => (
              <div key={period} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280] font-mono">
                  {period}
                </div>
                {threadList.map((thread) => {
                  const isActive = activeThreadId === thread.id;
                  const isDeleting = threadToDelete === thread.id;

                  return (
                    <SidebarThreadItem
                      key={thread.id}
                      thread={thread}
                      isActive={isActive}
                      isDeleting={isDeleting}
                      onSelect={() => {
                        hapticFeedback.select();
                        onSelectThread(thread.id);
                        if (window.innerWidth < 768) onClose();
                      }}
                      onStartRename={(e) => handleStartRename(e, thread)}
                      onTogglePin={
                        onTogglePinThread
                          ? (e) => {
                              e.stopPropagation();
                              onTogglePinThread(thread.id);
                            }
                          : undefined
                      }
                      onToggleArchive={
                        onToggleArchiveThread
                          ? (e) => {
                              e.stopPropagation();
                              onToggleArchiveThread(thread.id);
                            }
                          : undefined
                      }
                      onStartDelete={(e) => {
                        e.stopPropagation();
                        setThreadToDelete(thread.id);
                      }}
                      onConfirmDelete={(e) => handleConfirmDelete(e, thread.id)}
                      onCancelDelete={() => setThreadToDelete(null)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Audit & Cost Dashboard Action (Somente Administrador) */}
        {isAdmin && onOpenAudit && (
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

        {/* Footer: Logged User & Profile / Logout Actions */}
        <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-white/[0.06] bg-[#0A0B0E]/80 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              hapticFeedback.light();
              onOpenProfile?.();
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 mr-2 p-1.5 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors text-left cursor-pointer group"
            title="Editar perfil da conta"
          >
            <div className="w-8 h-8 rounded-full bg-[#181B22] border border-white/[0.08] flex items-center justify-center text-primary text-xs font-semibold uppercase flex-shrink-0 overflow-hidden">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
              ) : user?.name ? (
                user.name.slice(0, 2)
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-[#9CA3AF]" />
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-[#F3F4F6] truncate">
                  {user?.name || 'Usuário Autenticado'}
                </span>
                <Settings className="w-3 h-3 text-[#6B7280] group-hover:text-[#D1D5DB] transition-colors flex-shrink-0" />
              </div>
              <span className="text-[10px] text-[#6B7280] truncate">
                {user?.username ? `@${user.username}` : user?.email || '● Conectado'}
              </span>
            </div>
          </button>

          <button
            onClick={onLogout}
            className="min-h-[44px] min-w-[44px] text-[#9CA3AF] hover:text-red-400 active:bg-red-500/10 rounded-xl transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
            title="Sair da conta"
            aria-label="Sair da conta"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Modal de Renomeação Otimizado para Mobile e Touch */}
        <RenameThreadModal
          isOpen={Boolean(threadToRename)}
          initialName={threadToRename?.name || 'Nova Conversa'}
          onClose={() => setThreadToRename(null)}
          onSave={(newName) => {
            if (threadToRename && newName.trim()) {
              onRenameThread(threadToRename.id, newName.trim());
              hapticFeedback.light();
            }
            setThreadToRename(null);
          }}
        />
      </aside>
    </>
  );
};

interface SidebarThreadItemProps {
  thread: Thread;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onStartRename: (e: React.MouseEvent) => void;
  onTogglePin?: (e: React.MouseEvent) => void;
  onToggleArchive?: (e: React.MouseEvent) => void;
  onStartDelete: (e: React.MouseEvent) => void;
  onConfirmDelete: (e: React.MouseEvent) => void;
  onCancelDelete: () => void;
}

const SidebarThreadItem: React.FC<SidebarThreadItemProps> = ({
  thread,
  isActive,
  isDeleting,
  onSelect,
  onStartRename,
  onTogglePin,
  onToggleArchive,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSwiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDeleting) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    isSwiping.current = false;

    // Long press timer (450ms)
    longPressTimerRef.current = setTimeout(() => {
      hapticFeedback.select();
      setSwipeOffset(-120);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isDeleting) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartRef.current.x;
    const diffY = touch.clientY - touchStartRef.current.y;

    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    if (Math.abs(diffX) > Math.abs(diffY)) {
      isSwiping.current = true;
      if (diffX < 0) {
        setSwipeOffset(Math.max(-124, diffX));
      } else if (swipeOffset < 0) {
        setSwipeOffset(Math.min(0, -124 + diffX));
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isSwiping.current) {
      if (swipeOffset < -38) {
        setSwipeOffset(-120);
        hapticFeedback.light();
      } else {
        setSwipeOffset(0);
      }
    }
    touchStartRef.current = null;
    isSwiping.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swipeOffset !== 0) {
      e.stopPropagation();
      setSwipeOffset(0);
      return;
    }
    if (!isDeleting) {
      onSelect();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Background Action Buttons revealed on swipe (< 768px) */}
      <div className="absolute inset-y-0 right-0 flex items-center pr-1 gap-1 z-0">
        {onTogglePin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwipeOffset(0);
              onTogglePin(e);
            }}
            className="min-h-[36px] min-w-[36px] rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 flex items-center justify-center transition-colors cursor-pointer"
            title={thread.isPinned ? 'Desafixar conversa' : 'Fixar conversa'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSwipeOffset(0);
            onStartRename(e);
          }}
          className="min-h-[36px] min-w-[36px] rounded-lg bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center transition-colors cursor-pointer"
          title="Renomear conversa"
          aria-label="Renomear conversa"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSwipeOffset(0);
            onStartDelete(e);
          }}
          className="min-h-[36px] min-w-[36px] rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center transition-colors cursor-pointer"
          title="Excluir conversa"
          aria-label="Excluir conversa"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Foreground Item */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping.current ? 'none' : 'transform 0.18s ease-out',
        }}
        className={`group relative z-10 flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer select-none ${
          isActive
            ? 'bg-[#181B22] text-[#F3F4F6] font-medium border border-white/[0.08] shadow-sm'
            : 'bg-[#0E0F12] text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-white/[0.04] border border-transparent'
        }`}
      >
        {/* Thread Icon & Title */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-1">
          {thread.isPinned ? (
            <Pin className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
          ) : (
            <MessageSquare
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                isActive ? 'text-primary' : 'text-[#6B7280]'
              }`}
            />
          )}
          {isDeleting ? (
            <div className="flex items-center gap-2 text-red-400 text-[11px]" onClick={(e) => e.stopPropagation()}>
              <span>Excluir?</span>
              <button
                onClick={onConfirmDelete}
                className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium cursor-pointer"
              >
                Sim
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelDelete();
                }}
                className="px-2 py-1 rounded bg-white/[0.06] text-[#9CA3AF] hover:text-white cursor-pointer"
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

        {/* Hover Actions: Pin, Archive, Rename & Delete (Desktop) */}
        {!isDeleting && (
          <div className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onTogglePin && (
              <button
                type="button"
                onClick={onTogglePin}
                className={`p-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer ${
                  thread.isPinned ? 'text-primary' : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                }`}
                title={thread.isPinned ? 'Desafixar conversa' : 'Fixar conversa'}
              >
                <Pin className="w-3 h-3" />
              </button>
            )}
            {onToggleArchive && (
              <button
                type="button"
                onClick={onToggleArchive}
                className={`p-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer ${
                  thread.isArchived ? 'text-amber-400' : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                }`}
                title={thread.isArchived ? 'Desarquivar conversa' : 'Arquivar conversa'}
              >
                <Archive className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={onStartRename}
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Renomear conversa"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onStartDelete}
              className="p-1 rounded text-[#9CA3AF] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Excluir conversa"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
