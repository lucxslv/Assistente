import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MessageFeed } from './components/chat/MessageFeed';
import { PromptDock } from './components/chat/PromptDock';
import { AuthGatekeeper } from './components/auth/AuthGatekeeper';
import { AuditDashboard } from './components/admin/AuditDashboard';
import { useChat } from './hooks/useChat';
import { useAuth } from './hooks/useAuth';
import { useMobileViewport } from './hooks/useMobileViewport';
import { FileAttachment } from './types/chat';
import { checkIsAdmin } from './utils/admin';
import { hapticFeedback } from './utils/haptics';

function isSecretRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return (
    path === '/vault-audit' ||
    path.startsWith('/vault-audit') ||
    path === '/ghost-ops' ||
    path.startsWith('/ghost-ops') ||
    path === '/admin-telemetry' ||
    hash === '#vault-audit' ||
    hash === '#/vault-audit' ||
    hash === '#ghost-ops' ||
    search.includes('vault-audit') ||
    search.includes('route=audit')
  );
}

export const App: React.FC = () => {
  const { isKeyboardOpen } = useMobileViewport();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'audit'>(() =>
    isSecretRoute() ? 'audit' : 'chat'
  );

  // Mobile Edge Swipe (< 768px): Swipe right from left edge (x < 28px) to open sidebar
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
    deleteThread,
    sendMessage,
    stopStreaming,
    regenerateLastMessage,
    clearCurrentChat,
    refreshThreads,
  } = useChat();

  const isAdmin = checkIsAdmin(user?.email);

  // Monitora alterações na URL para suporte a navegação por rota secreta
  useEffect(() => {
    const handleRouteChange = () => {
      if (isSecretRoute()) {
        setCurrentView('audit');
      } else {
        setCurrentView('chat');
      }
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  // Se o usuário faz login/logout, atualiza conversas
  useEffect(() => {
    if (token) {
      refreshThreads();
    }
  }, [token, refreshThreads]);

  const handleSend = (text: string, attachments: FileAttachment[]) => {
    sendMessage(text, attachments);
  };

  const handleSelectStarterPrompt = (promptText: string) => {
    sendMessage(promptText, []);
  };

  const navigateTo = (view: 'chat' | 'audit') => {
    setCurrentView(view);
    if (view === 'audit') {
      window.history.pushState({}, '', '/vault-audit');
    } else {
      window.history.pushState({}, '', '/');
    }
  };

  // Se o usuário não estiver autenticado, exige login obrigatório (Auth Gatekeeper)
  if (!isAuthenticated || !user) {
    return (
      <AuthGatekeeper
        onLogin={login}
        onRegister={register}
        isLoading={isAuthLoading}
        error={authError}
        onClearError={() => setAuthError(null)}
      />
    );
  }

  // Route Guard Estrito: Se tentar acessar rota secreta e NÃO for administrador,
  // renderiza tela padrão 404 Not Found para mascarar completamente a existência da rota.
  if (currentView === 'audit' && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-[#0A0B0E] text-[#F3F4F6] p-6 text-center select-none font-sans">
        <div className="text-7xl font-mono font-bold text-white/[0.12] mb-3">404</div>
        <h1 className="text-lg font-semibold text-[#F3F4F6] mb-1.5">Página não encontrada</h1>
        <p className="text-xs text-[#9CA3AF] max-w-sm mb-6 leading-relaxed">
          O recurso solicitado não existe ou não está disponível neste servidor.
        </p>
        <button
          onClick={() => navigateTo('chat')}
          className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-[#E5E7EB] hover:text-white transition-colors cursor-pointer"
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
      style={{ height: 'var(--app-height, 100dvh)' }}
      className="flex h-full w-full max-w-full bg-[#0A0B0E] text-[#F3F4F6] overflow-hidden font-sans"
    >
      {/* Sidebar Navigation Drawer */}
      <Sidebar
        isOpen={isSidebarOpen}
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
        onDeleteThread={(id) => deleteThread(id)}
        onLogout={logout}
        onOpenAudit={() => navigateTo('audit')}
        isAdmin={isAdmin}
      />

      {/* Main Area: Chat or Secret Vault Dashboard */}
      {currentView === 'audit' && isAdmin ? (
        <AuditDashboard onBackToChat={() => navigateTo('chat')} />
      ) : (
        <main className="flex-1 min-h-0 flex flex-col min-w-0 h-full relative bg-[#0A0B0E] overflow-hidden">
          {/* Top Header */}
          <Header
            activeThread={activeThread}
            connectionStatus={connectionStatus}
            charlieStatus={charlieStatus}
            messages={messages}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
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

          {/* Message Feed & Input Dock Container */}
          <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
            <MessageFeed
              messages={messages}
              userName={user.name || 'Você'}
              charlieStatus={charlieStatus}
              isStreaming={isStreaming}
              onSelectPrompt={handleSelectStarterPrompt}
              onRetryMessage={regenerateLastMessage}
            />

            {/* Prompt Dock (Mobile-friendly Input) */}
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
  );
};

export default App;
