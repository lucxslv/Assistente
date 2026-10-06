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

export const LOCAL_API = "http://127.0.0.1:8005/api";
export const CLOUD_API = "https://assistente-xi.vercel.app/api";

// O servidor padrão oficial é a Nuvem Charlie (Vercel + Supabase)
let activeApiBase: string = CLOUD_API;

export function getServerMode(): "cloud" | "local" | "custom" {
  if (typeof window === "undefined") return "cloud";
  const custom = localStorage.getItem("charlie_api_url");
  if (custom && custom.trim()) return "custom";
  const mode = localStorage.getItem("charlie_server_mode");
  if (mode === "local") return "local";
  return "cloud";
}

export function setServerMode(mode: "cloud" | "local" | "custom", customUrl?: string): void {
  if (typeof window === "undefined") return;
  if (mode === "custom" && customUrl && customUrl.trim()) {
    localStorage.setItem("charlie_server_mode", "custom");
    const clean = customUrl.trim().replace(/\/+$/, "");
    const finalUrl = clean.endsWith("/api") ? clean : `${clean}/api`;
    localStorage.setItem("charlie_api_url", finalUrl);
    activeApiBase = finalUrl;
  } else if (mode === "local") {
    localStorage.setItem("charlie_server_mode", "local");
    localStorage.removeItem("charlie_api_url");
    activeApiBase = LOCAL_API;
  } else {
    localStorage.setItem("charlie_server_mode", "cloud");
    localStorage.removeItem("charlie_api_url");
    activeApiBase = CLOUD_API;
  }
}

/**
 * Detecta a conectividade com o servidor preferido (Nuvem por padrão).
 * Caso a nuvem esteja inatingível e o motor local 8005 esteja rodando,
 * permite fallback resiliente.
 */
export async function detectApiBase(): Promise<string> {
  const mode = getServerMode();

  if (mode === "custom") {
    const custom = localStorage.getItem("charlie_api_url");
    if (custom && custom.trim()) {
      const clean = custom.trim().replace(/\/+$/, "");
      activeApiBase = clean.endsWith("/api") ? clean : `${clean}/api`;
      return activeApiBase;
    }
  }

  if (mode === "local") {
    activeApiBase = LOCAL_API;
    return LOCAL_API;
  }

  // Modo Nuvem (Padrão Oficial)
  try {
    const res = await fetch(`${CLOUD_API}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      activeApiBase = CLOUD_API;
      return CLOUD_API;
    }
  } catch {
    // Nuvem temporariamente inacessível, checa se há daemon local ativo
    try {
      const localRes = await fetch(`${LOCAL_API}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (localRes.ok) {
        console.warn("[Charlie API] Nuvem indisponível. Usando servidor local temporariamente.");
        activeApiBase = LOCAL_API;
        return LOCAL_API;
      }
    } catch {
      // Nenhum ativo no momento
    }
  }

  activeApiBase = CLOUD_API;
  return CLOUD_API;
}

// Inicia detecção imediatamente e monitora a cada 5 segundos
if (typeof window !== "undefined") {
  detectApiBase();
  setInterval(detectApiBase, 5000);
}

export function getApiBase(): string {
  const mode = getServerMode();
  if (mode === "custom") {
    const custom = localStorage.getItem("charlie_api_url");
    if (custom && custom.trim()) {
      const clean = custom.trim().replace(/\/+$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }
  }
  if (mode === "local") {
    return LOCAL_API;
  }
  return activeApiBase || CLOUD_API;
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
    setServerMode("cloud");
  } else {
    setServerMode("custom", url);
  }
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
  const currentBase = getApiBase();
  const fullPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${currentBase}${fullPath}`;

  try {
    let fetchOptions = options;
    if (currentBase === LOCAL_API && !options.signal) {
      // Evita bloqueio indefinido caso o backend local 8005 não esteja rodando
      fetchOptions = { ...options, signal: AbortSignal.timeout(2000) };
    }
    const res = await fetch(url, fetchOptions);
    if (!res.ok && currentBase === LOCAL_API && [502, 503, 504].includes(res.status)) {
      throw new Error(`Local status ${res.status}`);
    }
    return res;
  } catch (err: any) {
    if (currentBase === LOCAL_API) {
      console.warn(`[Charlie API] Backend local inacessível para ${path}. Alternando para a nuvem Vercel...`);
      const cloudUrl = `${CLOUD_API}${fullPath}`;
      return await fetch(cloudUrl, options);
    } else if (currentBase === CLOUD_API) {
      // Se a nuvem estiver indisponível e houver serviço local ativo, usa fallback
      try {
        const localCheck = await fetch(`${LOCAL_API}/health`, { signal: AbortSignal.timeout(1000) });
        if (localCheck.ok) {
          console.warn(`[Charlie API] Nuvem indisponível para ${path}. Usando fallback local...`);
          return await fetch(`${LOCAL_API}${fullPath}`, options);
        }
      } catch {
        // ignora
      }
    }
    throw err;
  }
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
  let base = getApiBase();
  try {
    const res = await fetch(`${base}/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, thread_id: threadId, skip_tts: skipTts }),
    });
    if (!res.ok) throw new Error("Falha ao enviar mensagem");
    return res.json();
  } catch (err) {
    if (base === LOCAL_API) {
      console.warn("Motor local inacessível, tentando nuvem Vercel...");
      activeApiBase = CLOUD_API;
      const res = await fetch(`${CLOUD_API}/chat`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ message, thread_id: threadId, skip_tts: skipTts }),
      });
      if (!res.ok) throw new Error("Falha ao enviar mensagem");
      return res.json();
    }
    throw err;
  }
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
  let base = getApiBase();
  let res: Response;
  const payload: any = {
    message,
    thread_id: threadId,
    skip_tts: skipTts,
  };
  if (toolResults && toolResults.length > 0) {
    payload.tool_results = toolResults;
  }

  try {
    res = await fetch(`${base}/chat/stream`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (base === LOCAL_API) {
      console.warn("Motor local inacessível para streaming, tentando nuvem Vercel...");
      activeApiBase = CLOUD_API;
      base = CLOUD_API;
      res = await fetch(`${base}/chat/stream`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    } else {
      throw err;
    }
  }

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
