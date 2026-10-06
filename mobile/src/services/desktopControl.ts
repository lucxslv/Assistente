import { api } from './api';

export interface RemoteControlResponse {
  success?: boolean;
  status: string;
  action: string;
  level?: number;
  key?: string;
  message?: string;
  executed?: boolean;
  result?: string;
  image_base64?: string;
  filename?: string;
}

export interface DeviceTelemetry {
  cpu_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  memory_percent: number;
  battery?: { percent: number; power_plugged: boolean } | null;
  active_tasks?: { id: string; name: string; status: string }[];
  runner_status?: string;
}

export interface DeviceStatusResponse {
  is_online: boolean;
  device_name: string;
  last_seen_seconds_ago?: number | null;
  telemetry?: DeviceTelemetry | null;
  message?: string;
}

export type MediaKey =
  | 'play_pause'
  | 'next'
  | 'prev'
  | 'volume_up'
  | 'volume_down'
  | 'mute';

export const desktopControlService = {
  /** Obtém status em tempo real do computador físico e telemetria de hardware real */
  async getDeviceStatus(): Promise<DeviceStatusResponse> {
    try {
      return await api.get<DeviceStatusResponse>('/device/status');
    } catch {
      return {
        is_online: false,
        device_name: 'Meu PC',
        message: 'Servidor inacessível',
      };
    }
  },

  /** Ajusta volume do sistema Windows (0 a 100) */
  async setVolume(level: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'set_volume',
        params: { level: clamped },
        level: clamped,
      });
      return res.success ?? (res.status === 'ok' || res.status === 'queued');
    } catch {
      return false;
    }
  },

  /** Alterna mudo do som do sistema */
  async toggleMute(): Promise<boolean> {
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'toggle_mute',
      });
      return res.success ?? (res.status === 'ok' || res.status === 'queued');
    } catch {
      return false;
    }
  },

  /** Envia teclas de controle de multimídia do Windows */
  async sendMediaKey(key: MediaKey): Promise<boolean> {
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'media',
        params: { key },
        key,
      });
      return res.success ?? (res.status === 'ok' || res.status === 'queued');
    } catch {
      return false;
    }
  },

  /** Bloqueia a estação de trabalho (Win+L / LockWorkStation) */
  async lockPC(): Promise<boolean> {
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'lock',
      });
      return res.success ?? (res.status === 'ok' || res.status === 'queued');
    } catch {
      return false;
    }
  },

  /** Minimiza todas as janelas abertas (Win+D) */
  async minimizeAll(): Promise<boolean> {
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'minimize_all',
      });
      return res.success ?? (res.status === 'ok' || res.status === 'queued');
    } catch {
      return false;
    }
  },

  /** Alias para compatibilidade legada */
  async minimizeAllWindows(): Promise<boolean> {
    return this.minimizeAll();
  },

  /** Tira uma captura de tela do monitor principal e retorna o base64 para visualização imediata */
  async captureScreenshot(): Promise<{ success: boolean; image_base64?: string; message?: string }> {
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'screenshot',
      });
      if (res.image_base64) {
        return {
          success: true,
          image_base64: res.image_base64,
          message: res.message || 'Captura de tela realizada.',
        };
      }
      return {
        success: res.success ?? res.status === 'ok',
        image_base64: res.image_base64,
        message: res.message || 'Captura solicitada.',
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Falha ao solicitar captura de tela.',
      };
    }
  },

  /** Alias para compatibilidade legada */
  async takeScreenshot(): Promise<RemoteControlResponse> {
    const shot = await this.captureScreenshot();
    return {
      status: shot.success ? 'ok' : 'error',
      action: 'screenshot',
      message: shot.message,
      image_base64: shot.image_base64,
    };
  },

  /** Abre atalho, pasta ou aplicativo no Windows */
  async openShortcut(target: string): Promise<boolean> {
    try {
      const res = await api.post<RemoteControlResponse>('/device/command', {
        action: 'open',
        params: { target },
        target,
      });
      return res.success ?? (res.status === 'ok' || res.status === 'queued');
    } catch {
      return false;
    }
  },

  /** Executa comando rápido no sistema */
  async runQuickCommand(command: string): Promise<RemoteControlResponse> {
    try {
      return await api.post<RemoteControlResponse>('/device/command', {
        action: 'command',
        params: { command },
        command,
      });
    } catch (err: any) {
      return {
        status: 'error',
        action: 'command',
        message: err?.message || 'Erro ao executar comando',
      };
    }
  },
};
