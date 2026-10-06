import { invoke } from '@tauri-apps/api/core';
import { executeDeviceTool } from './deviceExecutor';

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

interface PendingCommand {
  id: string;
  action: string;
  level?: number;
  key?: string;
  command?: string;
  target?: string;
  params?: Record<string, any>;
}

interface HeartbeatResponse {
  status: string;
  pending_commands?: PendingCommand[];
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

const HEARTBEAT_TARGETS = [
  'https://assistente-xi.vercel.app/api/device/heartbeat',
];

async function handleIncomingRemoteCommand(cmd: PendingCommand): Promise<void> {
  try {
    const action = cmd.action?.toLowerCase();
    const params = cmd.params || {};
    console.log(`[Heartbeat] Executando comando remoto recebido da Nuvem (WAN): ${action}`, cmd);

    if (action === 'lock' || action === 'lock_workstation') {
      await executeDeviceTool('lock_workstation', {});
    } else if (action === 'volume' || action === 'set_volume') {
      const level = typeof cmd.level === 'number' ? cmd.level : (typeof params.level === 'number' ? params.level : 50);
      await executeDeviceTool('set_system_volume', { level });
    } else if (action === 'mute' || action === 'toggle_mute') {
      await executeDeviceTool('toggle_mute', {});
    } else if (action === 'media' || action === 'send_media_key') {
      const key = cmd.key || params.key || 'play_pause';
      await executeDeviceTool('send_media_key', { key });
    } else if (action === 'minimize_all' || action === 'minimize_all_windows') {
      await executeDeviceTool('minimize_all_windows', {});
    } else if (action === 'screenshot' || action === 'take_screenshot') {
      await executeDeviceTool('take_screenshot', {});
    } else if (action === 'open' || action === 'open_path_or_app') {
      const target = cmd.target || params.target || '';
      await executeDeviceTool('open_path_or_app', { target });
    } else if (action === 'command' && (cmd.command || params.command)) {
      await executeDeviceTool('execute_command', { command: cmd.command || params.command });
    }
  } catch (err) {
    console.warn('[Heartbeat] Falha ao processar comando remoto:', err);
  }
}

export async function sendHostHeartbeat(): Promise<void> {
  try {
    let stats: SystemStats;
    try {
      stats = await invoke<SystemStats>('get_system_stats');
    } catch {
      // Fallback em caso de execução fora do runtime nativo Tauri
      stats = {
        cpu_percent: 8.5,
        memory_used_mb: 4096,
        memory_total_mb: 16384,
        memory_percent: 25.0,
        computer_name: 'Desktop Charlie',
        os_name: 'Windows',
      };
    }

    const payload = JSON.stringify({
      device_name: stats.computer_name,
      cpu_percent: stats.cpu_percent,
      memory_used_mb: stats.memory_used_mb,
      memory_total_mb: stats.memory_total_mb,
      memory_percent: stats.memory_percent,
      battery: stats.battery,
      active_tasks: [],
      runner_status: 'idle',
    });

    // Envia heartbeat em paralelo para o backend local e para o servidor na nuvem (WAN)
    const responses = await Promise.allSettled(
      HEARTBEAT_TARGETS.map(async (url) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          return (await res.json()) as HeartbeatResponse;
        }
        return null;
      })
    );

    // Processa comandos pendentes despachados remotamente via Nuvem
    for (const item of responses) {
      if (item.status === 'fulfilled' && item.value?.pending_commands) {
        for (const cmd of item.value.pending_commands) {
          handleIncomingRemoteCommand(cmd);
        }
      }
    }
  } catch {
    // Ignora erro se backend estiver reiniciando
  }
}

/**
 * Inicia o daemon de presença do PC que envia telemetria e heartbeat ativo a cada 4s.
 * Permite controle do PC mesmo de fora de casa (WAN / 4G) via Cloud Relay.
 */
export function startDeviceHeartbeat(): () => void {
  if (heartbeatInterval) return () => {};

  // Disparo imediato
  sendHostHeartbeat();

  // Ciclo a cada 4 segundos para resposta rápida a comandos externos
  heartbeatInterval = setInterval(sendHostHeartbeat, 4000);

  return () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };
}
