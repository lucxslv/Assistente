import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { AuthGatekeeper } from "./components/AuthGatekeeper";
import { Message, Settings, Thread, ToolCallInfo } from "./types";
import { listen } from "@tauri-apps/api/event";
import {
  checkHealth,
  connectSystemWebSocket,
  createThread,
  deleteThread,
  renameThread,
  fetchSettings,
  fetchSystemStatus,
  fetchThreads,
  fetchThreadSteps,
  sendChatMessageStream,
  SystemStatus,
  fetchLocalHardwareMetrics,
  humanizeErrorMessage,
  LocalSystemMetrics,
  UserProfile,
  fetchCurrentUser,
  getStoredUser,
  clearAuthSession,
} from "./services/api";
import { executeDeviceTool } from "./services/deviceExecutor";
import { AgentCommandCenter } from "./components/AgentCommandCenter";
import { useAgentRuntime, agentRuntimeStore } from "./services/agentRuntimeStore";

export function App() {
  const [activeView, setActiveView] = useState<"chat" | "agent">("chat");
  const { session: agentSession } = useAgentRuntime();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getStoredUser());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [localMetrics, setLocalMetrics] = useState<LocalSystemMetrics | undefined>();

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  }, []);

  // Telemetria do hardware local do computador (Tauri / Win32)
  useEffect(() => {
    let isMounted = true;
    const updateMetrics = async () => {
      try {
        const data = await fetchLocalHardwareMetrics();
        if (isMounted) setLocalMetrics(data);
      } catch {
        // ignora fallback
      }
    };
    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Listener do evento emitido pelo atalho global do Windows (Ctrl + Alt + Espaço)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("open-spotlight", () => {
      if (currentUser) {
        setIsCommandPaletteOpen(true);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Fallback em caso de ambiente não-Tauri
      });

    return () => {
      unlisten?.();
    };
  }, [currentUser]);

  const hasInitializedRef = useRef(false);

  // Carrega lista de conversas
  const loadThreads = useCallback(async () => {
    try {
      const data = await fetchThreads();
      setThreads(data);
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        if (data.length > 0) {
          setActiveThreadId((prev) => prev ?? data[0].id);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar conversas:", err);
    }
  }, []);

  // Carrega status da API e telemetria do sistema
  const loadStatus = useCallback(async () => {
    try {
      const health = await checkHealth();
      setIsConnected(health.status === "ok");
      const statusData = await fetchSystemStatus();
      setSystemStatus(statusData);
    } catch {
      setIsConnected(false);
      setSystemStatus(null);
    }
  }, []);

  // Carrega configurações
  const loadSettingsData = useCallback(async () => {
    try {
      const s = await fetchSettings();
      setSettings(s);
    } catch (err) {
      console.error("Erro ao carregar configurações:", err);
    }
  }, []);

  // Verifica sessão do usuário ao iniciar o aplicativo
  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        if (u) {
          setCurrentUser(u);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {});
  }, []);

  // Polling e WebSocket de telemetria em tempo real
  useEffect(() => {
    if (!currentUser) return;

    loadStatus();
    loadThreads();
    loadSettingsData();

    // Conexão WebSocket para telemetria sem latência
    const unsubscribeWs = connectSystemWebSocket((liveStatus) => {
      setSystemStatus(liveStatus);
      setIsConnected(liveStatus.is_online);
    });

    const interval = setInterval(loadStatus, 5000);
    return () => {
      clearInterval(interval);
      unsubscribeWs();
    };
  }, [currentUser]);

  // Carrega mensagens ao trocar de conversa
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    fetchThreadSteps(activeThreadId)
      .then((steps) => {
        if (isMounted) setMessages(steps);
      })
      .catch((err) => {
        console.error("Erro ao carregar mensagens:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [activeThreadId]);

  // Ações fundamentais
  const handleNewThread = useCallback(async () => {
    // Se a conversa atual já está vazia e sem mensagens, mantemos o foco nela
    if (messages.length === 0 && activeThreadId) {
      const active = threads.find((t) => t.id === activeThreadId);
      if (active?.name === "Nova conversa" || active?.name === "Novo Chat") {
        return;
      }
    }

    try {
      setIsLoading(true);
      const newThread = await createThread("Nova conversa");
      setThreads((prev) => [newThread, ...prev.filter((t) => t.id !== newThread.id)]);
      setActiveThreadId(newThread.id);
      setMessages([]);
      showToast("Nova conversa iniciada");
    } catch (err) {
      console.error("Erro ao criar nova conversa no servidor:", err);
      setActiveThreadId(null);
      setMessages([]);
      showToast("Nova conversa iniciada");
    } finally {
      setIsLoading(false);
    }
  }, [messages.length, activeThreadId, threads, showToast]);

  const handleAuthSuccess = (user: UserProfile) => {
    hasInitializedRef.current = false;
    setCurrentUser(user);
    showToast(`Bem-vindo, ${user.name}!`);
    loadThreads();
  };

  const handleLogout = () => {
    hasInitializedRef.current = false;
    clearAuthSession();
    setCurrentUser(null);
    setIsSettingsOpen(false);
    setIsCommandPaletteOpen(false);
    setIsShortcutsOpen(false);
    setThreads([]);
    setMessages([]);
    setActiveThreadId(null);
    showToast("Sessão encerrada com sucesso");
  };

  // Atalhos de Teclado Globais do App
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentUser) return;

      // Esc: Fechar janelas modais ativas
      if (e.key === "Escape") {
        if (isShortcutsOpen) {
          e.preventDefault();
          setIsShortcutsOpen(false);
          return;
        }
        if (isCommandPaletteOpen) {
          e.preventDefault();
          setIsCommandPaletteOpen(false);
          return;
        }
        if (isSettingsOpen) {
          e.preventDefault();
          setIsSettingsOpen(false);
          return;
        }
        return;
      }

      // Ctrl + / ou ?: Abrir Central de Atalhos
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "/" || e.key === "?" || e.code === "Slash")
      ) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      // Ctrl + N: Nova Conversa
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewThread();
        showToast("Nova conversa iniciada");
        return;
      }

      // Ctrl + ,: Preferências
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
        return;
      }

      // Ctrl + K ou Ctrl + Alt + Espaço: Paleta de Comandos
      const isSpotlight =
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
        (e.ctrlKey && e.altKey && (e.code === "Space" || e.key === " "));

      if (isSpotlight) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Ctrl + L: Limpar mensagens da tela
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setMessages([]);
        showToast("Histórico da tela limpo");
        return;
      }

      // Ctrl + Shift + C: Copiar última resposta do Charlie
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.type !== "user_message" && m.name !== "Usuário" && m.content);
        if (lastAssistant?.content) {
          e.preventDefault();
          navigator.clipboard.writeText(lastAssistant.content);
          showToast("Resposta copiada para a área de transferência!");
        }
        return;
      }

      // Ctrl + Shift + S: Captura de tela rápida
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        showToast("Abrindo ferramenta de captura...");
        executeDeviceTool("manage_application", {
          app_name: "snippingtool",
          action: "open",
        }).catch(() => {});
        return;
      }

      // Ctrl + Shift + L: Bloquear estação de trabalho
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        showToast("Bloqueando sessão do computador...");
        executeDeviceTool("system_power_action", { action: "lock" }).catch(() => {});
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentUser,
    isSettingsOpen,
    isCommandPaletteOpen,
    isShortcutsOpen,
    messages,
    handleNewThread,
    showToast,
  ]);

  const handleRenameThread = async (id: string, newName: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, name: newName } : t)));
    try {
      await renameThread(id, newName);
    } catch (err) {
      console.error("Erro ao renomear conversa:", err);
    }
  };

  const handleDeleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteThread(id);
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) {
        const remaining = threads.filter((t) => t.id !== id);
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
        if (remaining.length === 0) setMessages([]);
      }
    } catch (err) {
      console.error("Erro ao excluir conversa:", err);
    }
  };

  const handleSendMessage = async (text: string, skipTts: boolean) => {
    if (!text.trim() || isLoading) return;

    // Bridge Chat -> Agent Runtime (se o usuário iniciar um objetivo explícito)
    const lower = text.trim().toLowerCase();
    if (lower.startsWith("/agent ") || lower.startsWith("agente: ")) {
      const goal = text.replace(/^(\/agent|agente:)\s*/i, "").trim();
      if (goal) {
        agentRuntimeStore.startGoal(goal, "Charlie");
        showToast("🎯 Objetivo iniciado no Agent Command Center!");
        setActiveView("agent");
        return;
      }
    }

    // Adiciona otimisticamente a mensagem do usuário na tela
    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      name: "Usuário",
      type: "user_message",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgId = "asst-" + Date.now();
    const tempAssistantMsg: Message = {
      id: assistantMsgId,
      name: "Charlie",
      type: "assistant_message",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      tools: [],
    };

    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);
    setIsLoading(true);

    try {
      await sendChatMessageStream(
        text,
        activeThreadId,
        (ev) => {
          if (ev.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + ev.data.token } : m
              )
            );
          } else if (ev.type === "tool_start") {
            agentRuntimeStore.addLog("TOOL", `Invocando ${ev.data.name}`, ev.data.args);
            // Executa ferramentas locais nativamente no Windows
            if (
              ev.data.scope === "device" ||
              [
                "manage_application",
                "set_system_volume",
                "system_power_action",
                "press_key",
                "type_text",
                "take_screenshot",
                "create_folder",
                "write_file",
                "list_directory",
              ].includes(ev.data.name)
            ) {
              executeDeviceTool(ev.data.name, ev.data.args || {}).catch((err) =>
                console.warn("Erro ao executar ferramenta local:", err)
              );
            }

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const newTool: ToolCallInfo = {
                  name: ev.data.name,
                  args: ev.data.args,
                  status: "executing",
                };
                return { ...m, tools: [...(m.tools || []), newTool] };
              })
            );
          } else if (ev.type === "tool_end") {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const updatedTools = (m.tools || []).map((t) =>
                  t.name === ev.data.name && t.status === "executing"
                    ? { ...t, result: ev.data.result, status: "completed" as const }
                    : t
                );
                return { ...m, tools: updatedTools };
              })
            );
          } else if (ev.type === "done") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: ev.data.reply || m.content,
                      streaming: false,
                    }
                  : m
              )
            );
            if (!activeThreadId || activeThreadId !== ev.data.thread_id) {
              setActiveThreadId(ev.data.thread_id);
            }
            loadThreads();
            loadStatus();
          } else if (ev.type === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content
                        ? `${m.content}\n\n*(${humanizeErrorMessage(ev.data.error)})*`
                        : humanizeErrorMessage(ev.data.error),
                      streaming: false,
                    }
                  : m
              )
            );
          }
        },
        skipTts
      );
    } catch (err) {
      console.warn("Falha no envio de mensagem:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: m.content || humanizeErrorMessage(err),
                streaming: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = useCallback(
    (messageId: string) => {
      const msgIdx = messages.findIndex((m) => m.id === messageId);
      if (msgIdx >= 0) {
        for (let i = msgIdx - 1; i >= 0; i--) {
          if (messages[i].type === "user_message" && messages[i].content) {
            handleSendMessage(messages[i].content, false);
            return;
          }
        }
      }
    },
    [messages]
  );

  if (!currentUser) {
    return (
      <div className="flex h-screen w-screen bg-[#0E0F12] text-[#F2F3F5] font-sans select-none overflow-hidden">
        <AuthGatekeeper onSuccess={handleAuthSuccess} />

        {/* Banner de Feedback Rápido (Toast) */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] border border-[var(--border)] shadow-[0_12px_36px_rgba(0,0,0,0.6)] text-[12.5px] font-medium text-[var(--text-primary)] animate-fade-in pointer-events-none select-none">
            <span className="text-[var(--accent)] text-[14px]">✦</span>
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Barra Lateral com Histórico, Navegação e Telemetria */}
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => {
          setActiveThreadId(id);
          setActiveView("chat");
        }}
        onNewThread={() => {
          handleNewThread();
          setActiveView("chat");
        }}
        onDeleteThread={handleDeleteThread}
        onRenameThread={handleRenameThread}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        user={currentUser}
        onOpenAuth={() => setIsSettingsOpen(true)}
        isConnected={isConnected}
        systemStatus={systemStatus}
        localMetrics={localMetrics}
        activeView={activeView}
        onSelectView={setActiveView}
        isAgentActive={
          agentSession?.status === "running" ||
          agentSession?.status === "waiting_permission"
        }
      />

      {/* Área Central: Chat ou Agent Command Center */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {activeView === "chat" ? (
          <ChatArea
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onRegenerate={handleRegenerate}
            currentThreadName={activeThread?.name}
            userName={currentUser?.name || "Lucas"}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        ) : (
          <AgentCommandCenter />
        )}
      </main>

      {/* Modal de Configurações */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        user={currentUser}
        onLogout={handleLogout}
      />

      {/* Central de Atalhos (Ctrl + /) */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Paleta de Comandos Rápidos (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        threads={threads}
        onSelectThread={(id) => {
          setActiveThreadId(id);
          setIsCommandPaletteOpen(false);
        }}
        onNewThread={() => {
          handleNewThread();
          setIsCommandPaletteOpen(false);
        }}
        onOpenSettings={() => {
          setIsSettingsOpen(true);
          setIsCommandPaletteOpen(false);
        }}
        onSendMessage={(text) => {
          handleSendMessage(text, true);
          setIsCommandPaletteOpen(false);
        }}
      />

      {/* Banner de Feedback Rápido (Toast) */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] border border-[var(--border)] shadow-[0_12px_36px_rgba(0,0,0,0.6)] text-[12.5px] font-medium text-[var(--text-primary)] animate-fade-in pointer-events-none select-none">
          <span className="text-[var(--accent)] text-[14px]">✦</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
