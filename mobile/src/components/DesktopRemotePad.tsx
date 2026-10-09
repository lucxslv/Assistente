import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  desktopControlService,
  DeviceStatusResponse,
  MediaKey,
} from '@/src/services/desktopControl';

interface DesktopRemotePadProps {
  onActionExecuted?: (actionName: string) => void;
}

export function DesktopRemotePad({ onActionExecuted }: DesktopRemotePadProps) {
  const [volume, setVolume] = useState<number>(50);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [barWidth, setBarWidth] = useState<number>(200);

  // Status de presença
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusResponse | null>(null);

  // Modal de Captura de Tela
  const [screenshotModalVisible, setScreenshotModalVisible] = useState(false);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);

  // Modal de Confirmação de Bloqueio
  const [lockConfirmVisible, setLockConfirmVisible] = useState(false);

  // Debounce de 150ms para ajuste de volume
  const volumeDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega status da máquina e atualiza a cada 10s (pausando quando em background)
  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const res = await desktopControlService.getDeviceStatus();
        if (mounted) {
          setDeviceStatus(res);
          const vol = (res as any).volume;
          if (vol && typeof vol.level === 'number') {
            setVolume(vol.level);
            setIsMuted(Boolean(vol.is_muted));
          }
        }
      } catch {
        // Ignora
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 10000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchStatus();
      }
    });

    return () => {
      mounted = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => {
      setFeedbackMessage((current) => (current === msg ? null : current));
    }, 2500);
  };

  // Ajuste de volume com debounce de 150ms
  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newVol)));
    setVolume(clamped);
    Haptics.selectionAsync();

    if (volumeDebounceTimer.current) {
      clearTimeout(volumeDebounceTimer.current);
    }

    volumeDebounceTimer.current = setTimeout(async () => {
      try {
        await desktopControlService.setVolume(clamped);
        showFeedback(`Volume: ${clamped}%`);
        onActionExecuted?.(`Volume: ${clamped}%`);
      } catch {
        showFeedback('Falha ao definir volume');
      }
    }, 150);
  };

  const handleBarTouch = (e: GestureResponderEvent) => {
    if (barWidth <= 0) return;
    const touchX = e.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, touchX / barWidth));
    handleVolumeChange(Math.round(ratio * 100));
  };

  // Ações de mídia
  const handleMediaKey = async (key: MediaKey, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoadingAction(key);
    try {
      if (key === 'mute') {
        setIsMuted((prev) => !prev);
        await desktopControlService.toggleMute();
      } else {
        await desktopControlService.sendMediaKey(key);
      }
      showFeedback(`Mídia: ${label}`);
      onActionExecuted?.(label);
    } catch {
      showFeedback(`Erro ao enviar comando ${label}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Disparo do Bloqueio de Tela com confirmação
  const executeLockPC = async () => {
    setLockConfirmVisible(false);
    setLoadingAction('lock');
    try {
      await desktopControlService.lockPC();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showFeedback('PC Bloqueado com sucesso!');
      onActionExecuted?.('Bloquear PC');
    } catch {
      showFeedback('Erro ao bloquear PC');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoadingAction(null);
    }
  };

  // Captura de tela com preview em alta resolução
  const handleCaptureScreenshot = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingAction('screenshot');
    showFeedback('Capturando tela do Windows...');

    try {
      const res = await desktopControlService.captureScreenshot();
      if (res.success && res.image_base64) {
        setScreenshotBase64(res.image_base64);
        setScreenshotModalVisible(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showFeedback('Captura de tela recebida!');
        onActionExecuted?.('Captura de Tela');
      } else {
        showFeedback(res.message || 'Falha ao obter captura de tela.');
      }
    } catch {
      showFeedback('Erro ao solicitar print do PC.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoadingAction(null);
    }
  };

  // Minimizar tudo (Win + D)
  const handleMinimizeAll = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingAction('minimize');
    try {
      await desktopControlService.minimizeAll();
      showFeedback('Janelas minimizadas!');
      onActionExecuted?.('Minimizar Janelas');
    } catch {
      showFeedback('Erro ao minimizar janelas.');
    } finally {
      setLoadingAction(null);
    }
  };

  // Abrir atalhos de apps
  const handleOpenApp = async (target: string, name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoadingAction(target);
    try {
      await desktopControlService.openShortcut(target);
      showFeedback(`${name} aberto!`);
      onActionExecuted?.(`Abrir ${name}`);
    } catch {
      showFeedback(`Erro ao abrir ${name}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Enviar print recebido para o chat do Charlie
  const handleSendToChat = () => {
    setScreenshotModalVisible(false);
    Haptics.selectionAsync();
    router.push('/charlie');
  };

  const isOnline = deviceStatus?.is_online ?? true;
  const deviceName = deviceStatus?.device_name || 'Desktop Charlie';

  return (
    <View style={styles.container}>
      {/* Cabeçalho do Pad com status de conexão */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.pcIconWrapper}>
            <Ionicons name="desktop-outline" size={16} color="#818CF8" />
          </View>
          <View>
            <Text style={styles.title}>{deviceName}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? '#22C55E' : '#EF4444' },
                ]}
              />
              <Text style={styles.subtitle}>
                {isOnline ? 'PC Conectado' : 'PC Desconectado'}
              </Text>
            </View>
          </View>
        </View>

        {loadingAction && <ActivityIndicator size="small" color="#818CF8" />}
      </View>

      {/* Banner de Feedback temporário */}
      {feedbackMessage && (
        <View testID="remote-feedback-banner" style={styles.feedbackBanner}>
          <Ionicons name="flash-outline" size={14} color="#22C55E" />
          <Text testID="remote-feedback-text" style={styles.feedbackText}>{feedbackMessage}</Text>
        </View>
      )}

      {/* Bloco de Volume com slider fluido e presets */}
      <View style={styles.cardSection}>
        <View style={styles.sectionTop}>
          <View style={styles.labelRow}>
            <Ionicons
              name={isMuted || volume === 0 ? 'volume-mute-outline' : 'volume-high-outline'}
              size={16}
              color="#8791A4"
            />
            <Text style={styles.sectionLabel}>VOLUME MESTRE</Text>
          </View>
          <Text style={styles.volumeValue}>{isMuted ? 'MUDO' : `${volume}%`}</Text>
        </View>

        {/* Barra de Toque contínua para Volume */}
        <View
          style={styles.volumeTrack}
          onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderGrant={handleBarTouch}
          onResponderMove={handleBarTouch}
        >
          <View style={[styles.volumeFill, { width: `${volume}%` }]} />
        </View>

        {/* Presets e Passos de Volume */}
        <View style={styles.volumePresetsRow}>
          <Pressable
            testID="remote-vol-down"
            style={styles.volStepButton}
            onPress={() => handleVolumeChange(Math.max(0, volume - 10))}
          >
            <Ionicons name="remove" size={16} color="#F5F7FA" />
          </Pressable>

          {[25, 50, 75, 100].map((preset) => (
            <Pressable
              key={preset}
              style={[
                styles.presetPill,
                volume === preset && styles.presetPillActive,
              ]}
              onPress={() => handleVolumeChange(preset)}
            >
              <Text
                style={[
                  styles.presetText,
                  volume === preset && styles.presetTextActive,
                ]}
              >
                {preset}%
              </Text>
            </Pressable>
          ))}

          <Pressable
            testID="remote-vol-up"
            style={styles.volStepButton}
            onPress={() => handleVolumeChange(Math.min(100, volume + 10))}
          >
            <Ionicons name="add" size={16} color="#F5F7FA" />
          </Pressable>
        </View>
      </View>

      {/* Controles de Mídia */}
      <View style={styles.mediaRow}>
        <Pressable
          style={styles.mediaButton}
          onPress={() => handleMediaKey('prev', 'Faixa Anterior')}
        >
          <Ionicons name="play-back" size={20} color="#F5F7FA" />
        </Pressable>

        <Pressable
          testID="remote-media-play"
          style={[styles.mediaButton, styles.mediaButtonPrimary]}
          onPress={() => handleMediaKey('play_pause', 'Play/Pause')}
        >
          <Ionicons name="play-outline" size={24} color="#0D0F12" />
        </Pressable>

        <Pressable
          style={styles.mediaButton}
          onPress={() => handleMediaKey('next', 'Próxima Faixa')}
        >
          <Ionicons name="play-forward" size={20} color="#F5F7FA" />
        </Pressable>

        <Pressable
          style={[styles.mediaButton, isMuted && styles.mediaButtonActive]}
          onPress={() => handleMediaKey('mute', 'Alternar Mudo')}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-medium-outline'}
            size={20}
            color={isMuted ? '#EF4444' : '#F5F7FA'}
          />
        </Pressable>
      </View>

      {/* Ações Rápidas do Windows */}
      <View style={styles.systemActionsGrid}>
        <Pressable
          testID="remote-lock-button"
          style={styles.systemCard}
          onPress={() => setLockConfirmVisible(true)}
        >
          <View style={[styles.systemIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
            <Ionicons name="lock-closed" size={18} color="#EF4444" />
          </View>
          <Text style={styles.systemTitle}>Bloquear PC</Text>
          <Text style={styles.systemHint}>Win + L</Text>
        </Pressable>

        <Pressable
          testID="remote-minimize-button"
          style={styles.systemCard}
          onPress={handleMinimizeAll}
        >
          <View style={[styles.systemIconBg, { backgroundColor: 'rgba(129, 140, 248, 0.15)' }]}>
            <Ionicons name="remove-circle-outline" size={18} color="#818CF8" />
          </View>
          <Text style={styles.systemTitle}>Minimizar Tudo</Text>
          <Text style={styles.systemHint}>Win + D</Text>
        </Pressable>

        <Pressable
          testID="remote-screenshot-button"
          style={styles.systemCard}
          onPress={handleCaptureScreenshot}
        >
          <View style={[styles.systemIconBg, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
            <Ionicons name="camera-outline" size={18} color="#22C55E" />
          </View>
          <Text style={styles.systemTitle}>Capturar Tela</Text>
          <Text style={styles.systemHint}>PrintScreen</Text>
        </Pressable>

        <Pressable
          style={styles.systemCard}
          onPress={() => handleOpenApp('explorer:', 'Explorador de Arquivos')}
        >
          <View style={[styles.systemIconBg, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
            <Ionicons name="folder-outline" size={18} color="#F59E0B" />
          </View>
          <Text style={styles.systemTitle}>Explorador</Text>
          <Text style={styles.systemHint}>Pastas</Text>
        </Pressable>
      </View>

      {/* Atalhos Rápidos de Aplicativos do Sistema */}
      <View style={styles.appsRow}>
        <Pressable
          style={styles.appPill}
          onPress={() => handleOpenApp('terminal', 'Terminal')}
        >
          <Ionicons name="terminal-outline" size={14} color="#A78BFA" />
          <Text style={styles.appPillText}>Terminal</Text>
        </Pressable>

        <Pressable
          style={styles.appPill}
          onPress={() => handleOpenApp('code', 'VS Code')}
        >
          <Ionicons name="code-slash-outline" size={14} color="#818CF8" />
          <Text style={styles.appPillText}>VS Code</Text>
        </Pressable>

        <Pressable
          style={styles.appPill}
          onPress={() => handleOpenApp('explorer', 'Explorador')}
        >
          <Ionicons name="folder-outline" size={14} color="#F59E0B" />
          <Text style={styles.appPillText}>Explorer</Text>
        </Pressable>

        <Pressable
          style={styles.appPill}
          onPress={() => handleOpenApp('chrome', 'Google Chrome')}
        >
          <Ionicons name="globe-outline" size={14} color="#38BDF8" />
          <Text style={styles.appPillText}>Chrome</Text>
        </Pressable>

        <Pressable
          style={styles.appPill}
          onPress={() => handleOpenApp('calc', 'Calculadora')}
        >
          <Ionicons name="calculator-outline" size={14} color="#22C55E" />
          <Text style={styles.appPillText}>Calc</Text>
        </Pressable>

        <Pressable
          style={styles.appPill}
          onPress={() => handleOpenApp('spotify', 'Spotify')}
        >
          <Ionicons name="musical-notes-outline" size={14} color="#1DB954" />
          <Text style={styles.appPillText}>Spotify</Text>
        </Pressable>
      </View>

      {/* Modal de Confirmação: Bloquear PC */}
      <Modal
        visible={lockConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLockConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.confirmIconWrapper}>
              <Ionicons name="lock-closed" size={28} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>Bloquear Computador?</Text>
            <Text style={styles.confirmDesc}>
              A sessão ativa do Windows será bloqueada imediatamente (Win + L).
            </Text>

            <View style={styles.confirmActionsRow}>
              <Pressable
                style={styles.confirmCancelBtn}
                onPress={() => setLockConfirmVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                testID="remote-lock-confirm"
                style={styles.confirmProceedBtn}
                onPress={executeLockPC}
              >
                <Text style={styles.confirmProceedText}>Bloquear Agora</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Preview de Captura de Tela (Print do Monitor) */}
      <Modal
        visible={screenshotModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScreenshotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.screenshotModalContent}>
            <View style={styles.screenshotHeader}>
              <View style={styles.screenshotTitleRow}>
                <Ionicons name="camera" size={18} color="#22C55E" />
                <Text style={styles.screenshotTitle}>Captura de Tela do PC</Text>
              </View>
              <Pressable
                onPress={() => setScreenshotModalVisible(false)}
                style={styles.screenshotCloseBtn}
              >
                <Ionicons name="close" size={20} color="#F5F7FA" />
              </Pressable>
            </View>

            {screenshotBase64 ? (
              <View style={styles.screenshotImageWrapper}>
                <Image
                  source={{ uri: screenshotBase64 }}
                  style={styles.screenshotImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={styles.screenshotEmpty}>
                <ActivityIndicator color="#818CF8" />
              </View>
            )}

            <View style={styles.screenshotFooter}>
              <Pressable
                style={styles.sendChatButton}
                onPress={handleSendToChat}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#0D0F12" />
                <Text style={styles.sendChatButtonText}>Enviar para o chat do Charlie</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pcIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F5F7FA',
    letterSpacing: -0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subtitle: {
    fontSize: 12,
    color: '#8791A4',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedbackText: {
    fontSize: 12,
    color: '#86EFAC',
    fontWeight: '500',
  },
  cardSection: {
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8791A4',
    letterSpacing: 0.5,
  },
  volumeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5F7FA',
  },
  volumeTrack: {
    height: 12,
    backgroundColor: '#212631',
    borderRadius: 6,
    overflow: 'hidden',
  },
  volumeFill: {
    height: '100%',
    backgroundColor: '#818CF8',
    borderRadius: 6,
  },
  volumePresetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  volStepButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPill: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPillActive: {
    backgroundColor: 'rgba(129, 140, 248, 0.2)',
    borderColor: '#818CF8',
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8791A4',
  },
  presetTextActive: {
    color: '#F5F7FA',
  },
  mediaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  mediaButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaButtonPrimary: {
    backgroundColor: '#F5F7FA',
    borderColor: '#F5F7FA',
  },
  mediaButtonActive: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  systemActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  systemCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  systemIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  systemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F5F7FA',
  },
  systemHint: {
    fontSize: 11,
    color: '#64748B',
  },
  appsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  appPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 8,
    paddingVertical: 8,
  },
  appPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8791A4',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  confirmIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5F7FA',
    textAlign: 'center',
  },
  confirmDesc: {
    fontSize: 13,
    color: '#8791A4',
    textAlign: 'center',
    lineHeight: 18,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#212631',
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F7FA',
  },
  confirmProceedBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  confirmProceedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  screenshotModalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  screenshotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenshotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenshotTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5F7FA',
  },
  screenshotCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenshotImageWrapper: {
    width: '100%',
    height: 240,
    backgroundColor: '#0D0F12',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#212631',
  },
  screenshotImage: {
    width: '100%',
    height: '100%',
  },
  screenshotEmpty: {
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenshotFooter: {
    marginTop: 4,
  },
  sendChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendChatButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D0F12',
  },
});
