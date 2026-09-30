import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { Message, Settings, Thread, ToolCallInfo } from "./types";
import {
  checkHealth,
  connectSystemWebSocket,
  createThread,
  deleteThread,
  fetchSettings,
  fetchSystemStatus,
  fetchThreads,
  fetchThreadSteps,
  sendChatMessageStream,
  SystemStatus,
  fetchLocalHardwareMetrics,
  humanizeErrorMessage,
  LocalSystemMetrics,
} from "./services/api";
import { executeDeviceTool } from "./services/deviceExecutor";

export function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [localMetrics, setLocalMetrics] = useState<LocalSystemMetrics | undefined>();

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

  // Carrega lista de conversas
  const loadThreads = useCallback(async () => {
    try {
      const data = await fetchThreads();
      setThreads(data);
      if (data.length > 0 && !activeThreadId) {
        setActiveThreadId(data[0].id);
      }
    } catch (err) {
      console.error("Erro ao carregar conversas:", err);
    }
  }, [activeThreadId]);

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

  // Polling e WebSocket de telemetria em tempo real
  useEffect(() => {
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
  }, [loadStatus, loadThreads, loadSettingsData]);

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

  // Atalhos de Teclado Globais do App (Spotlight e navegação)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSpotlight =
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
        (e.ctrlKey && e.altKey && (e.code === "Space" || e.key === " "));

      if (isSpotlight) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewThread();
      } else if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
        if (isSettingsOpen) setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen, isCommandPaletteOpen]);

  // Ações
  const handleNewThread = async () => {
    try {
      const newT = await createThread("Novo Chat");
      setThreads((prev) => [newT, ...prev]);
      setActiveThreadId(newT.id);
      setMessages([]);
    } catch (err) {
      console.error("Erro ao criar nova conversa:", err);
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
      }
    } catch (err) {
      console.error("Erro ao excluir conversa:", err);
    }
  };

  const handleSendMessage = async (text: string, skipTts: boolean) => {
    if (!text.trim() || isLoading) return;

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
            // Executa ferramentas locais nativamente no Windows
            if (
              ev.data.scope === "device" ||
              ["manage_application", "set_system_volume", "system_power_action", "press_key", "type_text", "take_screenshot"].includes(ev.data.name)
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

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Barra Lateral com Histórico e Telemetria */}
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => setActiveThreadId(id)}
        onNewThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isConnected={isConnected}
        systemStatus={systemStatus}
        localMetrics={localMetrics}
      />

      {/* Área Central de Conversa */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <ChatArea
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          currentThreadName={activeThread?.name}
        />
      </main>

      {/* Modal de Configurações */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
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
    </div>
  );
}

export default App;
