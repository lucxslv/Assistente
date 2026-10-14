import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MessageFeed } from './components/chat/MessageFeed';
import { PromptDock } from './components/chat/PromptDock';
import { Component as SignInFlo } from './components/ui/sign-in-flo';
import { AuditDashboard } from './components/admin/AuditDashboard';
import { ProfileModal } from './components/profile/ProfileModal';
import { useChat } from './hooks/useChat';
import { useAuth } from './hooks/useAuth';
import { useMobileViewport } from './hooks/useMobileViewport';
import { FileAttachment } from './types/chat';
import { checkIsAdmin } from './utils/admin';
import { hapticFeedback } from './utils/haptics';

function isSecretRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const path = url.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return (
    path === '/vault-audit' ||
    path.startsWith('/vault-audit/') ||
    path === '/ghost-ops' ||
    path.startsWith('/ghost-ops/') ||
    path === '/admin-telemetry' ||
    hash === '#vault-audit' ||
    hash === '#/vault-audit' ||
    hash === '#ghost-ops' ||
    url.searchParams.has('vault-audit') ||
    url.searchParams.get('route') === 'audit'
  );
}

export const App: React.FC = () => {
  const { isKeyboardOpen } = useMobileViewport();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'audit'>(() =>
    isSecretRoute() ? 'audit' : 'chat'
  );

  const edgeTouchRef = useRef<{ startX: number; startY: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768 || isSidebarOpen) return;
    const touch = e.touches[0];
    if (touch.clientX < 28) {
      edgeTouchRef.current = { startX: touch.clientX, startY: touch.clientY };
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!edgeTouchRef.current || isSidebarOpen) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - edgeTouchRef.current.startX;
    const deltaY = touch.clientY - edgeTouchRef.current.startY;
    if (deltaX > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      hapticFeedback.light();
      setIsSidebarOpen(true);
      edgeTouchRef.current = null;
    }
  };
  const handleTouchEnd = () => {
    edgeTouchRef.current = null;
  };

  const {
    user,
    token,
    isAuthenticated,
    isLoading: isAuthLoading,
    authError,
    setAuthError,
    login,
    register,
    updateProfile,
    logout,
  } = useAuth();

  const {
    threads,
    activeThreadId,
    activeThread,
    messages,
    isLoadingMessages,
    isStreaming,
    charlieStatus,
    connectionStatus,
    draft,
    setDraft,
    setActiveThreadId,
    createNewThread,
    renameThread,
    togglePinThread,
    toggleArchiveThread,
    deleteThread,
    sendMessage,
    stopStreaming,
    editUserMessage,
    regenerateAssistantMessage,
    submitMessageFeedback,
    retryAssistantMessage,
    resendUserMessage,
    clearCurrentChat,
    refreshThreads,
  } = useChat();

  const isAdmin = checkIsAdmin(user);

  useEffect(() => {
    const handleRouteChange = () => {
      setCurrentView(isSecretRoute() ? 'audit' : 'chat');
    };
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault();
        setIsProfileOpen(false);
        setIsSidebarOpen(false);
        if (currentView !== 'chat') {
          setCurrentView('chat');
          window.history.pushState({}, '', '/');
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('charlie:focus-prompt'));
        }, 20);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [currentView]);

  useEffect(() => {
    if (token) refreshThreads();
  }, [token, refreshThreads]);

  const handleSend = (text: string, attachments: FileAttachment[]) => {
    sendMessage(text, attachments);
  };
  const handleSelectStarterPrompt = (promptText: string) => {
    sendMessage(promptText, []);
  };
  const navigateTo = (view: 'chat' | 'audit') => {
    setCurrentView(view);
    window.history.pushState({}, '', view === 'audit' ? '/vault-audit' : '/');
  };

  if (!isAuthenticated || !user) {
    return (
      <SignInFlo
        onLogin={login}
        onRegister={register}
        isLoading={isAuthLoading}
        error={authError}
        onClearError={() => setAuthError(null)}
      />
    );
  }

  if (currentView === 'audit' && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-black text-[#F2F2F3] p-6 text-center select-none font-sans">
        <div className="text-7xl font-mono font-bold text-white/[0.10] mb-3">404</div>
        <h1 className="text-lg font-semibold text-[#F2F2F3] mb-1.5">Página não encontrada</h1>
        <p className="text-xs text-[#9CA3AF] max-w-sm mb-6 leading-relaxed">
          O recurso solicitado não existe ou não está disponível neste servidor.
        </p>
        <button
          onClick={() => navigateTo('chat')}
          className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] text-xs font-medium text-[#E5E7EB] transition-colors cursor-pointer"
        >
          Voltar para a página inicial
        </button>
      </div>
    );
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="min-h-[100dvh] w-full bg-black flex items-center justify-center p-0 md:p-3 lg:p-4 font-sans"
      style={{ height: 'var(--app-height, 100dvh)' }}
    >
      {/* Floating Window — rounded outer corners on solid black */}
      <div className="flex h-full w-full max-w-full md:max-w-[1600px] md:h-[calc(var(--app-height,100dvh)-24px)] lg:h-[calc(var(--app-height,100dvh)-32px)] md:rounded-[18px] md:overflow-hidden md:border md:border-white/[0.07] md:shadow-window bg-[#0E0E10] overflow-hidden text-[#F2F2F3]">
        <Sidebar
          isOpen={isSidebarOpen}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
          onClose={() => setIsSidebarOpen(false)}
          threads={threads}
          activeThreadId={activeThreadId}
          connectionStatus={connectionStatus}
          user={user}
          onSelectThread={(id) => {
            navigateTo('chat');
            setActiveThreadId(id);
          }}
          onNewThread={() => {
            navigateTo('chat');
            createNewThread('Nova Conversa');
          }}
          onRenameThread={(id, newName) => renameThread(id, newName)}
          onTogglePinThread={(id) => togglePinThread(id)}
          onToggleArchiveThread={(id) => toggleArchiveThread(id)}
          onDeleteThread={(id) => deleteThread(id)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onLogout={() => {
            logout();
            setActiveThreadId(null);
            clearCurrentChat();
          }}
          onOpenAudit={() => navigateTo('audit')}
          isAdmin={isAdmin}
        />

        <ProfileModal
          isOpen={isProfileOpen}
          user={user}
          onClose={() => setIsProfileOpen(false)}
          onSaveProfile={updateProfile}
        />

        {currentView === 'audit' && isAdmin ? (
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#161618] md:rounded-r-[18px] overflow-hidden">
            <AuditDashboard onBackToChat={() => navigateTo('chat')} />
          </div>
        ) : (
          <main className="flex-1 min-h-0 flex flex-col min-w-0 h-full relative bg-[#161618] overflow-hidden md:rounded-r-[18px]">
            {/* Subtle vertical divider — handled by layout border */}
            <Header
              activeThread={activeThread}
              connectionStatus={connectionStatus}
              charlieStatus={charlieStatus}
              messages={messages}
              user={user}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebar={() => {
                if (window.innerWidth >= 768) {
                  setIsSidebarCollapsed((v) => !v);
                } else {
                  setIsSidebarOpen((prev) => !prev);
                }
              }}
              onNewThread={() => createNewThread('Nova Conversa')}
              onRenameThread={(newName) => {
                if (activeThreadId) renameThread(activeThreadId, newName);
              }}
              onDeleteThread={() => {
                if (activeThreadId) deleteThread(activeThreadId);
              }}
              onClearChat={clearCurrentChat}
              onOpenAudit={() => navigateTo('audit')}
              isAdmin={isAdmin}
            />

            <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
              <MessageFeed
                messages={messages}
                userName={user.name || 'Você'}
                userAvatarUrl={user.avatar_url}
                charlieStatus={charlieStatus}
                isStreaming={isStreaming}
                onSelectPrompt={handleSelectStarterPrompt}
                onRetryAssistant={(failedMsg) => retryAssistantMessage(failedMsg.id)}
                onResendUser={(userMsg) => resendUserMessage(userMsg)}
                onEditUser={(userMsg, newContent) => editUserMessage(userMsg.id, newContent)}
                onRegenerateAssistant={(assistantMsg) => regenerateAssistantMessage(assistantMsg.id)}
                onFeedback={(msg, rating) => submitMessageFeedback(msg.id, rating)}
              />
              <PromptDock
                value={draft}
                onChange={setDraft}
                onSend={handleSend}
                isStreaming={isStreaming}
                onStop={stopStreaming}
                disabled={isLoadingMessages}
                isKeyboardOpen={isKeyboardOpen}
              />
            </div>
          </main>
        )}
      </div>
    </div>
  );
};

export default App;
