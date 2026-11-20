import { getApiBase } from "./api";
import { executeDeviceTool } from "./deviceExecutor";

/** Capabilities supported by the Windows host */
export const HOST_CAPABILITIES = [
  "list_directory",
  "read_file",
  "write_file",
  "replace_in_file",
  "create_folder",
  "execute_command",
  "create_local_directory",
  "system_power_action",
  "set_system_volume",
  "take_screenshot",
  "get_process_list",
  "list_local_directory",
  "read_local_file",
  "open_path_or_app",
  "manage_application",
  "toggle_mute",
  "send_media_key",
  "send_media_control",
  "lock_workstation",
  "minimize_all_windows",
  "take_screenshot",
  "get_local_ip",
  // Background process family
  "start_background_process",
  "get_background_process_logs",
  "list_background_processes",
  "kill_background_process",
] as const;

export interface HostConfig {
  apiBaseUrl: string;
  token: string;
  hostId?: string;
  name?: string;
  capabilities?: string[];
  pollIntervalMs?: number;
}

export interface HostHeartbeatPayload {
  host_id: string;
  capabilities: string[];
  telemetry: {
    cpu_percent: number;
    memory_percent: number;
    memory_used_gb: number;
    memory_total_gb: number;
  };
}

export interface ClaimedToolCall {
  call_id: string;
  tool: string;
  args: Record<string, any>;
}

export interface ToolResultSubmission {
  call_id: string;
  status: string;
  output: any;
  duration_ms: number;
  error_type?: string;
  is_recoverable: boolean;
}

let hostConfig: HostConfig | null = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let isClaimPollInFlight = false;
let isHeartbeatInFlight = false;
const HEARTBEAT_INTERVAL_MS = 15000;

const HOST_ROUTES = {
  heartbeat: "/host/heartbeat",
  pendingCalls: "/host/pending-calls",
  results: "/host/tool-results",
} as const;

function hostApiUrl(path: string): string {
  const configured = (hostConfig?.apiBaseUrl || getApiBase()).replace(/\/+$/, "");
  const root = configured.replace(/\/api$/, "");
  return `${root}/api${path}`;
}

function hostAuthHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${hostConfig?.token || ""}`,
  };
}

/** Start the authenticated host service */
export async function startHostService(config: HostConfig): Promise<void> {
  if (isPolling) {
    console.warn("[HostService] Already running");
    return;
  }

  hostConfig = {
    ...config,
    capabilities: config.capabilities || [...HOST_CAPABILITIES],
    pollIntervalMs: config.pollIntervalMs || 2000,
  };

  // Register this host
  try {
    await registerHost();
  } catch (err) {
    console.error("[HostService] Failed to register host:", err);
    throw err;
  }

  // Heartbeat com margem: o backend considera o host offline após 30 s.
  heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch(err => console.error("[HostService] Heartbeat error:", err));
  }, HEARTBEAT_INTERVAL_MS);

  // Start polling for tool claims (every 2s by default)
  isPolling = true;
  pollForTools();
  pollingInterval = setInterval(() => {
    pollForTools().catch(err => console.error("[HostService] Poll error:", err));
  }, hostConfig.pollIntervalMs);

  console.log("[HostService] Started successfully");
}

/** Stop the host service */
export function stopHostService(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPolling = false;
  hostConfig = null;
  console.log("[HostService] Stopped");
}

/** Check if host service is running */
export function isHostServiceRunning(): boolean {
  return isPolling;
}

/** Get current host config */
export function getHostConfig(): HostConfig | null {
  return hostConfig;
}

/** Register this host through the canonical heartbeat endpoint. */
async function registerHost(): Promise<void> {
  if (!hostConfig) throw new Error("Host config not set");

  const hostId = hostConfig.hostId || `host_${Date.now()}`;
  const name = hostConfig.name || `Windows Host ${navigator.platform}`;
  hostConfig.hostId = hostId;
  hostConfig.name = name;

  const res = await fetch(hostApiUrl(HOST_ROUTES.heartbeat), {
    method: "POST",
    headers: hostAuthHeaders(),
    body: JSON.stringify({
      host_id: hostId,
      name,
      capabilities: hostConfig.capabilities,
      telemetry: {},
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to register host: ${err}`);
  }

  const data = await res.json();
  if (data.host_id && hostConfig) {
    hostConfig.hostId = data.host_id;
  }
}

/** Send heartbeat with telemetry */
async function sendHeartbeat(): Promise<void> {
  if (!hostConfig || isHeartbeatInFlight) return;
  isHeartbeatInFlight = true;

  try {
    // Get system telemetry via Tauri invoke
    let telemetry = {
      cpu_percent: 0,
      memory_percent: 0,
      memory_used_gb: 0,
      memory_total_gb: 0,
    };

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const metrics = await invoke<any>("get_system_metrics");
      if (metrics && typeof metrics.cpu_percent === "number") {
        telemetry = {
          cpu_percent: metrics.cpu_percent,
          memory_percent: metrics.memory_percent,
          memory_used_gb: metrics.memory_used_gb,
          memory_total_gb: metrics.memory_total_gb,
        };
      }
    } catch {
      // Fallback if Tauri not available
    }

    const payload = {
      host_id: hostConfig!.hostId,
      name: hostConfig!.name || "Windows Host",
      capabilities: hostConfig!.capabilities,
      telemetry,
    };

    const res = await fetch(hostApiUrl(HOST_ROUTES.heartbeat), {
      method: "POST",
      headers: hostAuthHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn("[HostService] Heartbeat failed:", await res.text());
    }
  } catch (err) {
    console.error("[HostService] Heartbeat error:", err);
  } finally {
    isHeartbeatInFlight = false;
  }
}

/** Refresh presence immediately before a user-initiated chat action. */
export async function refreshHostPresence(): Promise<void> {
  await sendHeartbeat();
}

/** Poll for pending tool calls from the cloud */
async function pollForTools(): Promise<void> {
  if (!hostConfig || !isPolling || isClaimPollInFlight) return;
  isClaimPollInFlight = true;

  try {
    const res = await fetch(hostApiUrl(`${HOST_ROUTES.pendingCalls}?limit=10`), {
      method: "GET",
      headers: hostAuthHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 204 || res.status === 404) {
      return; // No pending calls
    }

    if (!res.ok) {
      console.warn("[HostService] Claim failed:", await res.text());
      return;
    }

    const payload = await res.json();
    const tools: ClaimedToolCall[] = Array.isArray(payload) ? payload : (payload.calls || []);
    if (tools.length === 0) return;

    console.log(`[HostService] Claimed ${tools.length} tool(s)`);

    // Execute each tool locally
    for (const tool of tools) {
      try {
        const output = await executeDeviceTool(tool.tool, tool.args || {});
        
        // Submit result back to cloud
        await submitToolResult({
          call_id: tool.call_id,
          status: "done",
          output,
          duration_ms: 0,
          error_type: undefined,
          is_recoverable: false,
        });
      } catch (err: any) {
        const errStr = `Erro ao executar no dispositivo: ${err?.message || err}`;
        
        // Submit error result
        await submitToolResult({
          call_id: tool.call_id,
          status: "error",
          output: errStr,
          duration_ms: 0,
          error_type: "execution_error",
          is_recoverable: true,
        });
      }
    }
  } catch (err) {
    console.error("[HostService] Poll error:", err);
  } finally {
    isClaimPollInFlight = false;
  }
}

/** Submit tool execution result back to cloud */
async function submitToolResult(result: ToolResultSubmission): Promise<void> {
  if (!hostConfig) return;

  try {
    const res = await fetch(hostApiUrl(HOST_ROUTES.results), {
      method: "POST",
      headers: hostAuthHeaders(),
      body: JSON.stringify(result),
    });

    if (!res.ok) {
      console.warn("[HostService] Submit result failed:", await res.text());
    }
  } catch (err) {
    console.error("[HostService] Submit result error:", err);
  }
}
