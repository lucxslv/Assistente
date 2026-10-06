import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { desktopControlService, DeviceStatusResponse, DeviceTelemetry } from '@/src/services/desktopControl';

export interface DeviceConnectionState {
  isPcOnline: boolean;
  pcName: string;
  telemetry: DeviceTelemetry | null;
  lastSeenSecondsAgo: number | null;
  refresh: () => Promise<void>;
}

export function useDeviceConnection(): DeviceConnectionState {
  const [deviceState, setDeviceState] = useState<DeviceStatusResponse>({
    is_online: false,
    device_name: 'Meu PC',
    telemetry: null,
  });

  const applyDeviceState = useCallback((res: DeviceStatusResponse) => {
    setDeviceState((prev) => {
      if (
        prev.is_online === res.is_online &&
        prev.device_name === res.device_name &&
        prev.last_seen_seconds_ago === res.last_seen_seconds_ago &&
        prev.telemetry?.cpu_percent === res.telemetry?.cpu_percent &&
        prev.telemetry?.memory_percent === res.telemetry?.memory_percent &&
        prev.telemetry?.runner_status === res.telemetry?.runner_status
      ) {
        return prev;
      }
      return res;
    });
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await desktopControlService.getDeviceStatus();
      applyDeviceState(res);
    } catch {
      applyDeviceState({
        is_online: false,
        device_name: 'Meu PC',
        telemetry: null,
      });
    }
  }, [applyDeviceState]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchLoop = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const res = await desktopControlService.getDeviceStatus();
        if (mounted) applyDeviceState(res);
      } catch {
        if (mounted) {
          applyDeviceState({
            is_online: false,
            device_name: 'Meu PC',
            telemetry: null,
          });
        }
      }
    };

    fetchLoop();
    timer = setInterval(fetchLoop, 10000);

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        fetchLoop();
      }
    });

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [applyDeviceState]);

  return useMemo(
    () => ({
      isPcOnline: deviceState.is_online,
      pcName: deviceState.device_name || 'Meu PC',
      telemetry: deviceState.telemetry ?? null,
      lastSeenSecondsAgo: deviceState.last_seen_seconds_ago ?? null,
      refresh: checkStatus,
    }),
    [deviceState.is_online, deviceState.device_name, deviceState.telemetry, deviceState.last_seen_seconds_ago, checkStatus]
  );
}
