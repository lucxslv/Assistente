import { useState, useCallback } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { StorageService } from '../services/storage';

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => StorageService.getSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const updated = StorageService.saveSettings({ ...prev, ...newSettings });
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const reset = StorageService.saveSettings(DEFAULT_SETTINGS);
    setSettingsState(reset);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    isSettingsOpen,
    setIsSettingsOpen,
  };
}
