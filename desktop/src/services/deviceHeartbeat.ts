import { invoke } from '@tauri-apps/api/core';
import { detectApiBase } from './api';
import { startHostService, stopHostService, isHostServiceRunning, getHostConfig, HOST_CAPABILITIES } from './hostService';

interface BatteryStats {
  percent: number;
  is_charging: boolean;
}

interface SystemStats {
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  computer_name: string;
  os_name: string;
  battery?: BatteryStats | null;
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let lastTelemetry: SystemStats | null = null;

async function collectTelemetry(): Promise<SystemStats> {
  try {
    return await invoke<SystemStats>('get_system_stats');
  } catch {
    return {
      cpu_percent: 0,
      memory_used_mb: 0,
      memory_total_mb: 0,
      memory_percent: 0,
      computer_name: 'Desktop Charlie',
      os_name: 'Windows',
      battery: null,
    };
  }
}

/**
 * Starts the host service (authenticated heartbeat + tool polling).
 * This replaces the old device heartbeat that used direct API calls.
 */
export async function startDeviceHeartbeat(apiBaseUrl: string, token: string, hostName?: string): Promise<() => void> {
  // Stop any existing heartbeat
  stopDeviceHeartbeat();

  // Collect initial telemetry
  const telemetry = await collectTelemetry();
  lastTelemetry = telemetry;

  // Resolve local vs. cloud before the first registration; otherwise the
  // initial LOCAL_API can fail permanently before detectApiBase finishes.
  const resolvedApiBase = await detectApiBase().catch(() => apiBaseUrl);

  // Start the authenticated host service
  startHostService({
    apiBaseUrl: resolvedApiBase,
    token: token,
    name: hostName || telemetry.computer_name,
    capabilities: [...HOST_CAPABILITIES],
    pollIntervalMs: 2000,
  }).catch(err => {
    console.error('[HostService] Failed to start:', err);
  });

  // Return cleanup function
  return () => {
    stopDeviceHeartbeat();
  };
}

/** Stop the host service heartbeat */
export function stopDeviceHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  stopHostService();
}

/** Get current telemetry for UI display */
export function getLastTelemetry(): SystemStats | null {
  return lastTelemetry;
}

/** Check if host service is running */
export function isHeartbeatRunning(): boolean {
  return isHostServiceRunning();
}

/** Get current host config */
export function getHostInfo(): { hostId?: string; name?: string; capabilities?: string[] } | null {
  const config = getHostConfig();
  if (!config) return null;
  return {
    hostId: config.hostId,
    name: config.name,
    capabilities: config.capabilities,
  };
}
