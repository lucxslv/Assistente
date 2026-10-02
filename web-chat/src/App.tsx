import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MessageFeed } from './components/chat/MessageFeed';
import { PromptDock } from './components/chat/PromptDock';
import { SettingsModal } from './components/layout/SettingsModal';
import { AuthGatekeeper } from './components/auth/AuthGatekeeper';
import { useChat } from './hooks/useChat';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { FileAttachment } from './types/chat';

export const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const { settings, updateSettings, isSettingsOpen, setIsSettingsOpen } = useSettings();

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

  // If user logs in/out, refresh thread list
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

  return (
    <div className="flex h-screen w-screen bg-[#0A0B0E] text-[#F3F4F6] overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        threads={threads}
        activeThreadId={activeThreadId}
        connectionStatus={connectionStatus}
        user={user}
        onSelectThread={(id) => setActiveThreadId(id)}
        onNewThread={() => createNewThread('Nova Conversa')}
        onRenameThread={(id, newName) => renameThread(id, newName)}
        onDeleteThread={(id) => deleteThread(id)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={logout}
      />

      {/* Main Conversation Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative bg-[#0A0B0E]">
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
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Message Feed */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          <MessageFeed
            messages={messages}
            userName={user.name || 'Você'}
            charlieStatus={charlieStatus}
            isStreaming={isStreaming}
            onSelectPrompt={handleSelectStarterPrompt}
            onRetryMessage={regenerateLastMessage}
          />

          {/* Prompt Dock (Input) */}
          <PromptDock
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={stopStreaming}
            disabled={isLoadingMessages}
          />
        </div>
      </main>

      {/* Settings Modal (Pre-configured preferences) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={updateSettings}
      />
    </div>
  );
};

export default App;
