import { Message, Settings, Thread, StreamEvent } from "../types";

export function getApiBase(): string {
  const custom = localStorage.getItem("charlie_api_url");
  if (custom && custom.trim()) {
    const clean = custom.trim().replace(/\/+$/, "");
    return clean.endsWith("/api") ? clean : `${clean}/api`;
  }
  return (import.meta as any).env?.VITE_API_URL || "http://127.0.0.1:8005/api";
}

export function getWsBase(): string {
  const api = getApiBase();
  if (api.startsWith("https://")) {
    return api.replace(/^https:\/\//, "wss://");
  }
  return api.replace(/^http:\/\//, "ws://");
}

export function setCustomApiUrl(url: string): void {
  if (!url || !url.trim()) {
    localStorage.removeItem("charlie_api_url");
  } else {
    localStorage.setItem("charlie_api_url", url.trim());
  }
}

export interface SystemStatus {
  assistant_name: string;
  is_online: boolean;
  status: "idle" | "listening" | "thinking" | "executing_tool" | "speaking" | "error";
  is_speaking: boolean;
  is_listening: boolean;
  active_thread_id: string | null;
  active_tool: string | null;
  current_process: string | null;
  uptime_seconds: number;
  database_connected: boolean;
  connected_devices_count?: number;
  host: {
    cpu_percent: number;
    memory_used_mb: number;
    memory_total_mb: number;
    memory_percent: number;
  };
}

export interface ToolsStatus {
  is_executing: boolean;
  active_tool: string | null;
  active_args: Record<string, any> | null;
  current_process: string | null;
}

export async function checkHealth(): Promise<{ status: string; database_connected: boolean }> {
  const res = await fetch(`${getApiBase()}/health`);
  if (!res.ok) throw new Error("API Offline");
  return res.json();
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await fetch(`${getApiBase()}/system/status`);
  if (!res.ok) throw new Error("Falha ao buscar status do sistema");
  return res.json();
}

export async function fetchToolsStatus(): Promise<ToolsStatus> {
  const res = await fetch(`${getApiBase()}/tools/status`);
  if (!res.ok) throw new Error("Falha ao buscar status das ferramentas");
  return res.json();
}

export async function fetchThreads(): Promise<Thread[]> {
  const res = await fetch(`${getApiBase()}/threads`);
  if (!res.ok) throw new Error("Falha ao buscar conversas");
  return res.json();
}

export async function createThread(name: string = "Novo Chat"): Promise<Thread> {
  const res = await fetch(`${getApiBase()}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Falha ao criar conversa");
  return res.json();
}

export async function fetchThreadSteps(threadId: string): Promise<Message[]> {
  const res = await fetch(`${getApiBase()}/messages?thread_id=${encodeURIComponent(threadId)}`);
  if (!res.ok) throw new Error("Falha ao buscar mensagens");
  return res.json();
}

export async function deleteThread(threadId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao excluir conversa");
}

export async function sendChatMessage(
  message: string,
  threadId: string | null,
  skipTts: boolean = true
): Promise<{ reply: string; thread_id: string; status: string }> {
  const res = await fetch(`${getApiBase()}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId, skip_tts: skipTts }),
  });
  if (!res.ok) throw new Error("Falha ao enviar mensagem");
  return res.json();
}

/**
 * Envia mensagem via SSE (Server-Sent Events) recebendo tokens e status em tempo real.
 */
export async function sendChatMessageStream(
  message: string,
  threadId: string | null,
  onEvent: (event: StreamEvent) => void,
  skipTts: boolean = true
): Promise<void> {
  const res = await fetch(`${getApiBase()}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId, skip_tts: skipTts }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Falha no streaming: ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      if (!part.trim()) continue;
      let eventType: StreamEvent["type"] = "token";
      let eventDataStr = "";

      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) {
          eventType = line.substring(7).trim() as StreamEvent["type"];
        } else if (line.startsWith("data: ")) {
          eventDataStr = line.substring(6).trim();
        }
      }

      if (eventDataStr) {
        try {
          const parsed = JSON.parse(eventDataStr);
          onEvent({ type: eventType, data: parsed });
        } catch (e) {
          console.error("Erro ao fazer parse do evento SSE:", e, eventDataStr);
        }
      }
    }
  }

  if (buffer.trim()) {
    let eventType: StreamEvent["type"] = "token";
    let eventDataStr = "";
    for (const line of buffer.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.substring(7).trim() as StreamEvent["type"];
      else if (line.startsWith("data: ")) eventDataStr = line.substring(6).trim();
    }
    if (eventDataStr) {
      try {
        const parsed = JSON.parse(eventDataStr);
        onEvent({ type: eventType, data: parsed });
      } catch (e) {
        // ignore
      }
    }
  }
}

/**
 * Conecta ao WebSocket do Charlie para telemetria de status em tempo real.
 */
export function connectSystemWebSocket(
  onState: (state: SystemStatus) => void,
  onError?: (err: any) => void
): () => void {
  let ws: WebSocket | null = null;
  let isClosed = false;

  const connect = () => {
    if (isClosed) return;
    try {
      ws = new WebSocket(`${getWsBase()}/chat/ws`);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "state" && msg.data) {
            onState(msg.data);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!isClosed) {
          setTimeout(connect, 3000);
        }
      };
      ws.onerror = (err) => {
        onError?.(err);
      };
    } catch (e) {
      onError?.(e);
      if (!isClosed) setTimeout(connect, 3000);
    }
  };

  connect();

  return () => {
    isClosed = true;
    if (ws) ws.close();
  };
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch(`${getApiBase()}/settings`);
  if (!res.ok) throw new Error("Falha ao buscar configurações");
  return res.json();
}

export async function updateSettings(data: Partial<Settings>): Promise<any> {
  const res = await fetch(`${getApiBase()}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao atualizar configurações");
  return res.json();
}
