import { getApiBase } from "./api";
import { executeDeviceTool } from "./deviceExecutor";

/** Capabilities supported by the Windows host */
export const HOST_CAPABILITIES = [
  "list_directory",
  "read_file",
  "write_file",
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

  // Start heartbeat (every 30s)
  heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch(err => console.error("[HostService] Heartbeat error:", err));
  }, 30000);

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

/** Register this host with the cloud API */
async function registerHost(): Promise<void> {
  if (!hostConfig) throw new Error("Host config not set");

  const base = hostConfig.apiBaseUrl || getApiBase();
  // const url = `${base.replace(/\/api$/, "")}/api/host/register`; // unused

  const payload = {
    host_id: hostConfig.hostId || `host_${Date.now()}`,
    name: hostConfig.name || `Windows Host ${navigator.platform}`,
    capabilities: hostConfig.capabilities,
  };

  const res = await fetch(`${base}/api/host/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${hostConfig.token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to register host: ${err}`);
  }

  const data = await res.json();
  if (data.host_id && !hostConfig?.hostId) {
    // Update config with assigned host_id if not set
    if (hostConfig) hostConfig.hostId = data.host_id;
  }
}

/** Send heartbeat with telemetry */
async function sendHeartbeat(): Promise<void> {
  if (!hostConfig) return;

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
      capabilities: hostConfig!.capabilities,
      telemetry,
    };

    const base = hostConfig!.apiBaseUrl || getApiBase();
    const res = await fetch(`${base.replace(/\/api$/, "")}/api/host/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hostConfig!.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn("[HostService] Heartbeat failed:", await res.text());
    }
  } catch (err) {
    console.error("[HostService] Heartbeat error:", err);
  }
}

/** Poll for pending tool calls from the cloud */
async function pollForTools(): Promise<void> {
  if (!hostConfig || !isPolling) return;

  try {
    const base = hostConfig!.apiBaseUrl || getApiBase().replace(/\/api$/, "");
    const res = await fetch(`${base}/api/host/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hostConfig!.token}`,
      },
      body: JSON.stringify({ host_id: hostConfig!.hostId }),
    });

    if (res.status === 204 || res.status === 404) {
      return; // No pending calls
    }

    if (!res.ok) {
      console.warn("[HostService] Claim failed:", await res.text());
      return;
    }

    const tools: any[] = await res.json();
    if (!tools || tools.length === 0) return;

    console.log(`[HostService] Claimed ${tools.length} tool(s)`);

    // Execute each tool locally
    for (const tool of tools) {
      try {
        const output = await executeDeviceTool(tool.tool, tool.args || {});
        
        // Submit result back to cloud
        await submitToolResult({
          call_id: tool.call_id,
          status: "success",
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
  }
}

/** Submit tool execution result back to cloud */
async function submitToolResult(result: ToolResultSubmission): Promise<void> {
  if (!hostConfig) return;

  try {
    const base = hostConfig!.apiBaseUrl || getApiBase().replace(/\/api$/, "");
    const res = await fetch(`${base}/api/host/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hostConfig!.token}`,
      },
      body: JSON.stringify(result),
    });

    if (!res.ok) {
      console.warn("[HostService] Submit result failed:", await res.text());
    }
  } catch (err) {
    console.error("[HostService] Submit result error:", err);
  }
}
