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
  ChevronRight,
  ChevronDown,




} from 'lucide-react';
import { Thread, ConnectionStatus } from '../../types/chat';
import { User } from '../../types/auth';
import { groupThreadsByPeriod } from '../../utils/formatters';
import { hapticFeedback } from '../../utils/haptics';
import { RenameThreadModal } from './RenameThreadModal';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  chevron?: boolean;
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isCollapsed,
  onToggleCollapse: _onToggleCollapse,
  onClose,
  threads,
  activeThreadId,
  connectionStatus: _connectionStatus,
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
  const [drawerDragX, setDrawerDragX] = useState<number | null>(null);
  const drawerTouchRef = useRef<{ startX: number; startY: number } | null>(null);
  const isDraggingDrawer = useRef(false);
  const [activeNav, setActiveNav] = useState<string>('chats');

  // Keyboard shortcut N — guard when modal/input is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const isInput =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
      const modalOpen = !!document.querySelector('[role="dialog"]');
      if ((e.key === 'n' || e.key === 'N') && !isInput && !modalOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onNewThread();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewThread]);

  const archivedCount = useMemo(() => threads.filter((t) => Boolean(t.isArchived)).length, [threads]);

  const filteredThreads = useMemo(() => {
    const base = threads.filter((t) => (showArchived ? Boolean(t.isArchived) : !t.isArchived));
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((t) => t.name.toLowerCase().includes(q) || (t.preview && t.preview.toLowerCase().includes(q)));
  }, [threads, searchQuery, showArchived]);

  const pinnedThreads = useMemo(
    () => (showArchived ? [] : filteredThreads.filter((t) => Boolean(t.isPinned))),
    [filteredThreads, showArchived]
  );
  const regularThreads = useMemo(
    () => (showArchived ? filteredThreads : filteredThreads.filter((t) => !t.isPinned)),
    [filteredThreads, showArchived]
  );
  const pinnedViewActive = activeNav === 'pinned';
  const filteredForList = useMemo(() => {
    if (pinnedViewActive) return filteredThreads.filter(t => Boolean(t.isPinned));
    return regularThreads;
  }, [filteredThreads, regularThreads, pinnedViewActive]);
  const groupedThreads = useMemo(() => groupThreadsByPeriod(filteredForList), [filteredForList]);

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
      if (diffX < 0) setDrawerDragX(diffX);
      else setDrawerDragX(diffX * 0.15);
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

  // Flat geometric nav — functional filters (coherent with thread actions)
  const primaryNav: NavItem[] = [
    { id: 'chats', label: 'Conversas', icon: MessageSquare, badge: threads.filter(t => !t.isArchived).length || undefined },
    { id: 'pinned', label: 'Fixadas', icon: Pin, badge: threads.filter(t => t.isPinned && !t.isArchived).length || undefined },
    { id: 'archived', label: 'Arquivadas', icon: Archive, badge: archivedCount || undefined, chevron: true },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => {
            hapticFeedback.light();
            onClose();
          }}
          aria-hidden="true"
          style={{ opacity: drawerDragX !== null && drawerDragX < 0 ? Math.max(0, 1 + drawerDragX / 280) : 1 }}
        />
      )}

      <aside
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
        style={{
          transform: drawerDragX !== null ? `translateX(${drawerDragX}px)` : undefined,
          transition: drawerDragX !== null ? 'none' : undefined,
        }}
        className={`fixed md:static top-0 bottom-0 left-0 z-40 flex flex-col select-none border-r border-white/[0.06] bg-[#121214] transition-all duration-200 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed ? 'md:w-[72px]' : 'w-[300px] md:w-[280px] lg:w-[320px] md:min-w-[280px] lg:min-w-[320px]'}
          md:rounded-l-[18px] overflow-hidden`}
      >
        {/* Header — white solid square avatar + two-level text + chevron down */}
        <div className="px-4 pt-[max(14px,env(safe-area-inset-top,0px))] pb-3 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenProfile?.()}
            className="flex items-center gap-3 min-w-0 text-left group flex-1 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-[10px] bg-white flex items-center justify-center shrink-0 overflow-hidden p-1.5">
              <img src="/logo-dark.png" alt="Charlie" className="w-full h-full object-contain object-center" width="36" height="36" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold tracking-tight text-white leading-none truncate">
                    Charlie
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-white/40 group-hover:text-white/70 transition-colors shrink-0" />
                </div>
                <span className="text-[11px] text-white/45 leading-none truncate block mt-0.5">
                  {user?.name || 'Workspace'}
                </span>
              </div>
            )}
          </button>
          <button
            onClick={() => {
              hapticFeedback.light();
              onClose();
            }}
            className="md:hidden min-h-[36px] min-w-[36px] rounded-lg text-white/50 hover:text-white flex items-center justify-center cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isCollapsed && (
          <>
            {/* Nova Conversa */}
            <div className="px-3 pb-3">
              <button
                onClick={() => {
                  hapticFeedback.select();
                  setShowArchived(false);
                  setActiveNav('chats');
                  onNewThread();
                  if (window.innerWidth < 768) onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <Plus className="w-4 h-4" />
                  Nova conversa
                </span>
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-black/10 text-[10px] font-mono">N</kbd>
              </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar"
                  className="w-full bg-[#1A1A1E] border border-white/[0.06] rounded-full pl-9 pr-8 py-2 text-[13px] text-white placeholder:text-white/35 focus:outline-none focus:border-white/15 transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className={`px-2.5 py-2 rounded-full border text-xs flex items-center gap-1 cursor-pointer transition-colors ${showArchived ? 'bg-white text-black border-white' : 'bg-[#1A1A1E] border-white/[0.06] text-white/60 hover:text-white'}`}
                title={showArchived ? 'Voltar' : `Arquivadas (${archivedCount})`}
              >
                <Archive className="w-3.5 h-3.5" />
                {archivedCount > 0 && <span className="text-[11px] font-mono">{archivedCount}</span>}
              </button>
            </div>

            {/* Flat navigation — strict left, thin stroke icons, section titles uppercase */}
            <div className="px-3 pb-2">
              <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">Navegação</p>
              <div className="space-y-0.5">
                {primaryNav.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        hapticFeedback.light();
                        setActiveNav(item.id);
                        if (item.id === 'chats') setShowArchived(false);
                        if (item.id === 'pinned') { setShowArchived(false); setActiveNav('pinned'); }
                        if (item.id === 'archived') { setShowArchived(true); }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors cursor-pointer text-left ${
                        isActive
                          ? 'bg-white/[0.08] text-white'
                          : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 stroke-[1.7]" />
                      <span className="flex-1 truncate font-[450]">{item.label}</span>
                      {item.badge !== undefined && (
                        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#1E1E20] border border-white/[0.06] text-[11px] font-medium text-white/70 flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                      {item.chevron && <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mx-3 my-2 h-px bg-white/[0.06]" />

            {/* Threads grouped — preserves existing pin/search/archive behavior */}
            <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4 min-h-0">
              {showArchived && (
                <div className="mx-1 px-3 py-2 flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/15">
                  <span className="text-[11px] font-semibold tracking-wide text-amber-300 uppercase">Arquivadas</span>
                  <button type="button" onClick={() => setShowArchived(false)} className="text-[11px] text-white/50 hover:text-white underline cursor-pointer">
                    Voltar
                  </button>
                </div>
              )}

              {!pinnedViewActive && pinnedThreads.length > 0 && (
                <div className="space-y-1">
                  <p className="px-3 py-1 text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase flex items-center gap-1.5">
                    <Pin className="w-3 h-3" /> Fixadas
                  </p>
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
                      onTogglePin={onTogglePinThread ? (e) => { e.stopPropagation(); onTogglePinThread(thread.id); } : undefined}
                      onToggleArchive={onToggleArchiveThread ? (e) => { e.stopPropagation(); onToggleArchiveThread(thread.id); } : undefined}
                      onStartDelete={(e) => { e.stopPropagation(); setThreadToDelete(thread.id); }}
                      onConfirmDelete={(e) => handleConfirmDelete(e, thread.id)}
                      onCancelDelete={() => setThreadToDelete(null)}
                    />
                  ))}
                </div>
              )}

              {Object.keys(groupedThreads).length === 0 && pinnedThreads.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-white/25">
                  {searchQuery ? 'Nenhuma conversa encontrada.' : showArchived ? 'Nenhuma conversa arquivada.' : pinnedViewActive ? 'Nenhuma conversa fixada.' : 'Nenhuma conversa ainda.'}
                </div>
              ) : (
                Object.entries(groupedThreads).map(([period, list]) => (
                  <div key={period} className="space-y-1">
                    <p className="px-3 py-1 text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">{period}</p>
                    {list.map((thread) => (
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
                        onTogglePin={onTogglePinThread ? (e) => { e.stopPropagation(); onTogglePinThread(thread.id); } : undefined}
                        onToggleArchive={onToggleArchiveThread ? (e) => { e.stopPropagation(); onToggleArchiveThread(thread.id); } : undefined}
                        onStartDelete={(e) => { e.stopPropagation(); setThreadToDelete(thread.id); }}
                        onConfirmDelete={(e) => handleConfirmDelete(e, thread.id)}
                        onCancelDelete={() => setThreadToDelete(null)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {isAdmin && onOpenAudit && (
              <div className="px-3 pb-2">
                <button
                  onClick={() => { onOpenAudit(); onClose(); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] text-[13px] text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /> Auditoria</span>
                  <span className="text-[10px] font-mono bg-white text-black px-1.5 py-0.5 rounded-full">USD</span>
                </button>
              </div>
            )}

            {/* Footer — two nav items at bottom, same thin-stroke pattern */}
            <div className="px-3 py-3 border-t border-white/[0.06] space-y-1 shrink-0">
              <button
                type="button"
                onClick={() => onOpenProfile?.()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 stroke-[1.7]" />
                <span className="flex-1 truncate">Configurações</span>
                <ChevronRight className="w-3.5 h-3.5 text-white/30" />
              </button>
              <div className="flex items-center gap-2 px-1 pt-1">
                <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                  {user?.avatar_url ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" /> : user?.name ? <span className="text-[11px] font-bold text-black">{user.name.slice(0, 2).toUpperCase()}</span> : <UserIcon className="w-3.5 h-3.5 text-black" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-white truncate leading-none">{user?.name || 'Usuário'}</p>
                  <p className="text-[11px] text-white/40 truncate">{user?.email || ''}</p>
                </div>
                <button onClick={onLogout} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] cursor-pointer" title="Sair" aria-label="Sair">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Collapsed rail — icon-only */}
        {isCollapsed && (
          <div className="flex flex-col items-center gap-2 p-2 pt-2 flex-1">
            <button onClick={onNewThread} className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center hover:bg-white/90 cursor-pointer" title="Nova conversa">
              <Plus className="w-5 h-5" />
            </button>
            <div className="w-8 h-px bg-white/[0.06] my-1" />
            {primaryNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer ${activeNav === item.id ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white hover:bg-white/[0.04]'}`}
                  title={item.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
            <div className="flex-1" />
            <button onClick={onLogout} className="w-10 h-10 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06] flex items-center justify-center cursor-pointer" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}

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
  thread, isActive, isDeleting, onSelect, onStartRename, onTogglePin, onToggleArchive, onStartDelete, onConfirmDelete, onCancelDelete,
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
    longPressTimerRef.current = setTimeout(() => { hapticFeedback.select(); setSwipeOffset(-120); }, 450);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isDeleting) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartRef.current.x;
    const diffY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    }
    if (Math.abs(diffX) > Math.abs(diffY)) {
      isSwiping.current = true;
      if (diffX < 0) setSwipeOffset(Math.max(-124, diffX));
      else if (swipeOffset < 0) setSwipeOffset(Math.min(0, -124 + diffX));
    }
  };
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (isSwiping.current) {
      if (swipeOffset < -38) { setSwipeOffset(-120); hapticFeedback.light(); }
      else setSwipeOffset(0);
    }
    touchStartRef.current = null;
    isSwiping.current = false;
  };
  const handleClick = (e: React.MouseEvent) => {
    if (swipeOffset !== 0) { e.stopPropagation(); setSwipeOffset(0); return; }
    if (!isDeleting) onSelect();
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{ transform: `translateX(${swipeOffset}px)`, transition: isSwiping.current ? 'none' : 'transform 0.18s ease-out' }}
        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] cursor-pointer select-none border ${
          isActive ? 'bg-white/[0.08] text-white border-white/[0.08]' : 'bg-transparent text-white/55 hover:text-white hover:bg-white/[0.04] border-transparent'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-1">
          {thread.isPinned ? <Pin className="w-3.5 h-3.5 shrink-0 text-white/70" /> : <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white/70' : 'text-white/30'}`} />}
          {isDeleting ? (
            <div className="flex items-center gap-2 text-red-300 text-xs" onClick={(e) => e.stopPropagation()}>
              <span>Excluir?</span>
              <button onClick={onConfirmDelete} className="px-2.5 py-1 rounded-full bg-white text-black font-medium cursor-pointer">Sim</button>
              <button onClick={(e) => { e.stopPropagation(); onCancelDelete(); }} className="px-2.5 py-1 rounded-full bg-white/10 text-white cursor-pointer">Não</button>
            </div>
          ) : (
            <span className="truncate font-[450]">{thread.name || 'Nova Conversa'}</span>
          )}
        </div>
        {!isDeleting && (
          <div className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onTogglePin && <button type="button" onClick={onTogglePin} className={`p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer ${thread.isPinned ? 'text-white' : 'text-white/40 hover:text-white'}`} title={thread.isPinned ? 'Desafixar' : 'Fixar'}><Pin className="w-3 h-3" /></button>}
            {onToggleArchive && <button type="button" onClick={onToggleArchive} className={`p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer ${thread.isArchived ? 'text-amber-300' : 'text-white/40 hover:text-white'}`} title={thread.isArchived ? 'Desarquivar' : 'Arquivar'}><Archive className="w-3 h-3" /></button>}
            <button type="button" onClick={onStartRename} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] cursor-pointer" title="Renomear"><Pencil className="w-3 h-3" /></button>
            <button type="button" onClick={onStartDelete} className="p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 cursor-pointer" title="Excluir"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>
    </div>
  );
};
