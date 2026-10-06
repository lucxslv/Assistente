import { Message, Settings, Thread, StreamEvent } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { executeDeviceTool } from "./deviceExecutor";

export interface LocalSystemMetrics {
  cpu_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  memory_percent: number;
}

/**
 * Lê diretamente as métricas de hardware da máquina local do usuário via Tauri (Win32).
 */
export async function fetchLocalHardwareMetrics(): Promise<LocalSystemMetrics> {
  try {
    const metrics = await invoke<LocalSystemMetrics>("get_system_metrics");
    if (metrics && typeof metrics.cpu_percent === "number") {
      return metrics;
    }
  } catch {
    // Modo web/browser ou fallback
  }

  return {
    cpu_percent: 0,
    memory_used_gb: 0,
    memory_total_gb: 16,
    memory_percent: 0,
  };
}

/**
 * Converte mensagens de erro de rede/HTTP em mensagens humanas e amigáveis para o usuário.
 */
export function humanizeErrorMessage(error: any): string {
  if (!navigator.onLine) {
    return "Sem conexão com a internet. Verifique sua rede para continuar conversando.";
  }
  const str = String(error?.message || error || "");
  if (str.includes("Failed to fetch") || str.includes("NetworkError") || str.includes("Offline")) {
    return "Sem conexão com a internet ou servidor temporariamente indisponível. Verifique sua conexão para continuar.";
  }
  if (str.includes("500") || str.includes("503") || str.includes("FUNCTION_INVOCATION_FAILED")) {
    return "O assistente está passando por uma breve oscilação. Por favor, tente novamente em instantes.";
  }
  return "Não foi possível completar a ação no momento. Verifique sua conexão e tente novamente.";
}

export const CLOUD_API = "https://assistente-xi.vercel.app/api";
export const LOCAL_API = CLOUD_API; // Mantido apenas para compatibilidade de tipagem

export function getServerMode(): "cloud" {
  return "cloud";
}

export function setServerMode(_mode?: string, _customUrl?: string): void {
  // Conexão exclusiva com o servidor Charlie oficial
}

export async function detectApiBase(): Promise<string> {
  return CLOUD_API;
}

export function getApiBase(): string {
  return CLOUD_API;
}

export function getWsBase(): string {
  return CLOUD_API.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

export function setCustomApiUrl(_url: string): void {
  // Conexão exclusiva com o servidor Charlie oficial
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: UserProfile;
  token: string;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("charlie_auth_token");
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem("charlie_user");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(data: AuthResponse): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("charlie_auth_token", data.token);
  localStorage.setItem("charlie_user", JSON.stringify(data.user));
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("charlie_auth_token");
  localStorage.removeItem("charlie_user");
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Client-Platform": "Windows",
    "X-Client-Type": "desktop",
    "X-Client-Name": "Charlie Desktop",
    ...extraHeaders,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Executa requisições HTTP com fallback transparente e imediato entre motor local (8005) e Vercel Cloud.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const fullPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${CLOUD_API}${fullPath}`;
  return await fetch(url, options);
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Falha ao criar conta.");
  }
  saveAuthSession(data);
  return data;
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Falha ao realizar login.");
  }
  saveAuthSession(data);
  return data;
}

export async function loginAsGuest(): Promise<AuthResponse> {
  try {
    const res = await apiFetch("/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      saveAuthSession(data);
      return data;
    }
  } catch {
    // Modo offline / fallback
  }
  const fallbackData: AuthResponse = {
    user: {
      id: "guest-lucas",
      name: "Lucas",
      email: "lucas@charlie.local",
    },
    token: "charlie_guest_token",
  };
  saveAuthSession(fallbackData);
  return fallbackData;
}


export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await apiFetch("/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      clearAuthSession();
      return null;
    }
    const user: UserProfile = await res.json();
    localStorage.setItem("charlie_user", JSON.stringify(user));
    return user;
  } catch {
    return getStoredUser();
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
  const res = await apiFetch("/health");
  if (!res.ok) throw new Error("API Offline");
  return res.json();
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await apiFetch("/system/status");
  if (!res.ok) throw new Error("Falha ao buscar status do sistema");
  return res.json();
}

export async function fetchToolsStatus(): Promise<ToolsStatus> {
  const res = await apiFetch("/tools/status");
  if (!res.ok) throw new Error("Falha ao buscar status das ferramentas");
  return res.json();
}

export async function fetchThreads(): Promise<Thread[]> {
  try {
    const res = await apiFetch("/threads", {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) {
        console.warn("[Charlie API] Não autorizado ao buscar conversas (401).");
        clearAuthSession();
        return [];
      }
      throw new Error(`Falha ao buscar conversas: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error("[Charlie API] Erro ao carregar conversas:", err);
    return [];
  }
}

export async function createThread(name: string = "Novo Chat"): Promise<Thread> {
  const res = await apiFetch("/threads", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Falha ao criar conversa");
  return res.json();
}

export async function fetchThreadSteps(threadId: string): Promise<Message[]> {
  const res = await apiFetch(`/messages?thread_id=${encodeURIComponent(threadId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao buscar mensagens");
  return res.json();
}

export async function deleteThread(threadId: string): Promise<void> {
  const res = await apiFetch(`/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao excluir conversa");
}

export async function renameThread(threadId: string, name: string): Promise<void> {
  const res = await apiFetch(`/threads/${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Falha ao renomear conversa");
}

export async function sendChatMessage(
  message: string,
  threadId: string | null,
  skipTts: boolean = true
): Promise<{ reply: string; thread_id: string; status: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/chat`, {
    method: "POST",
    headers: getAuthHeaders(),
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
  skipTts: boolean = true,
  toolResults?: Array<{ call_id: string; name: string; result: string }>
): Promise<void> {
  const base = getApiBase();
  const payload: any = {
    message,
    thread_id: threadId,
    skip_tts: skipTts,
  };
  if (toolResults && toolResults.length > 0) {
    payload.tool_results = toolResults;
  }

  const res = await fetch(`${base}/chat/stream`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Falha no streaming: ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  let clientToolCalls: Array<{ call_id: string; name: string; args: any }> = [];
  let returnedThreadId: string | null = threadId;

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

          if ((eventType as string) === "client_tool_request" || (eventType as string) === "client_tool_call") {
            clientToolCalls = parsed.tools || [];
            if (parsed.thread_id) returnedThreadId = parsed.thread_id;
          }
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
        if ((eventType as string) === "client_tool_request" || (eventType as string) === "client_tool_call") {
          clientToolCalls = parsed.tools || [];
          if (parsed.thread_id) returnedThreadId = parsed.thread_id;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  // Se o backend solicitou execução física de ferramentas no computador local (Windows)
  if (clientToolCalls.length > 0) {
    const results: Array<{ call_id: string; name: string; result: string }> = [];

    for (const call of clientToolCalls) {
      onEvent({
        type: "status",
        data: { status: "executing", text: `Executando no Windows: ${call.name}...` },
      });
      try {
        const output = await executeDeviceTool(call.name, call.args || {});
        results.push({
          call_id: call.call_id,
          name: call.name,
          result: output,
        });
        onEvent({
          type: "tool_end",
          data: { name: call.name, result: output },
        });
      } catch (err: any) {
        const errStr = `Erro ao executar no dispositivo: ${err?.message || err}`;
        results.push({
          call_id: call.call_id,
          name: call.name,
          result: errStr,
        });
        onEvent({
          type: "tool_end",
          data: { name: call.name, result: errStr },
        });
      }
    }

    // Continua recursivamente enviando os dados reais coletados de volta para a IA finalizar a resposta
    return await sendChatMessageStream("", returnedThreadId, onEvent, skipTts, results);
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
    const wsUrl = `${getWsBase()}/chat/ws?client_type=desktop`;
    // Vercel serverless não suporta WebSockets persistentes; tenta reconectar quando o motor local subir
    if (wsUrl.includes("vercel.app")) {
      if (!isClosed) {
        setTimeout(connect, 4000);
      }
      return;
    }
    try {
      ws = new WebSocket(wsUrl);
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
  const res = await apiFetch("/settings");
  if (!res.ok) throw new Error("Falha ao buscar configurações");
  return res.json();
}

export async function updateSettings(data: Partial<Settings>): Promise<any> {
  const res = await apiFetch("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao atualizar configurações");
  return res.json();
}

export async function fetchUserMemories(): Promise<{ facts: string[]; preferences: Record<string, string>; count: number }> {
  try {
    const res = await apiFetch("/settings/memory", {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return { facts: [], preferences: {}, count: 0 };
    return res.json();
  } catch {
    return { facts: [], preferences: {}, count: 0 };
  }
}

export async function clearUserMemories(): Promise<void> {
  const res = await apiFetch("/settings/memory", {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao limpar memórias");
}
