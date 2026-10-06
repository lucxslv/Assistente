import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ServerProfile, serverConfigService } from '@/src/services/serverConfig';
import { authStorage } from '@/src/services/authStorage';

export interface PairingModalProps {
  visible: boolean;
  onClose: () => void;
  onPairSuccess?: (server: ServerProfile) => void;
}

interface StrictQRPayload {
  v: number;
  id: string;
  secret: string;
  lan?: string;
  tunnel?: string | null;
  name?: string;
  token?: string;
  pin?: string;
}

const CLOUD_API_BASE = 'https://assistente-xi.vercel.app/api';

export function PairingModal({ visible, onClose, onPairSuccess }: PairingModalProps) {
  const [tab, setTab] = useState<'qr' | 'pin'>('qr');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Aba PIN (6 dígitos)
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [pinTesting, setPinTesting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccessInfo, setPinSuccessInfo] = useState<string | null>(null);
  const pinInputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setPinDigits(['', '', '', '', '', '']);
      setPinError(null);
      setPinSuccessInfo(null);
    }
  }, [visible]);

  // Handler de leitura do QR Code seguro (validação contra o Servidor Oficial)
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      let parsed: StrictQRPayload | null = null;
      try {
        parsed = JSON.parse(data) as StrictQRPayload;
      } catch {
        throw new Error('QR Code não contém um payload JSON válido.');
      }

      if (!parsed) {
        throw new Error('QR Code vazio ou ilegível.');
      }

      const deviceId = await authStorage.getOrCreateDeviceId();
      const deviceName = await authStorage.getDeviceName();

      if (parsed.id && parsed.secret) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const verifyResponse = await fetch(`${CLOUD_API_BASE}/pair/verify-qr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: parsed.id,
            secret: parsed.secret,
            device_name: deviceName,
            device_id: deviceId,
            platform: Platform.OS,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!verifyResponse.ok) {
          const errData = await verifyResponse.json().catch(() => ({}));
          throw new Error(errData.detail || 'Falha na validação do segredo do QR Code.');
        }

        const verifyResult = await verifyResponse.json();
        const permanentToken = verifyResult.token;

        await authStorage.savePairedCredentials({
          token: permanentToken,
          serverUrl: CLOUD_API_BASE,
          deviceId,
          deviceName,
          isLan: false,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const savedProfile = await serverConfigService.getActiveServer();
        onPairSuccess?.(savedProfile);
        onClose();
        return;
      }

      // Fallback para payloads com token direto
      if (parsed.token) {
        await authStorage.savePairedCredentials({
          token: parsed.token,
          serverUrl: CLOUD_API_BASE,
          deviceId,
          deviceName,
          isLan: false,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const savedProfile = await serverConfigService.getActiveServer();
        onPairSuccess?.(savedProfile);
        onClose();
        return;
      }

      throw new Error('Formato de QR Code incompatível com o Servidor Oficial.');
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e instanceof Error ? e.message : 'Falha na leitura do QR Code.';
      setPinError(msg);
      setTimeout(() => setScanned(false), 2500);
    }
  };

  // Handler da digitação do PIN de 6 dígitos
  const handlePinChange = (text: string, index: number) => {
    setPinError(null);
    const cleaned = text.replace(/[^0-9]/g, '');

    if (cleaned.length === 6) {
      const newDigits = cleaned.split('');
      setPinDigits(newDigits);
      pinInputRefs.current[5]?.focus();
      triggerPinVerification(newDigits.join(''));
      return;
    }

    const singleDigit = cleaned.slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = singleDigit;
    setPinDigits(newDigits);

    if (singleDigit && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }

    const fullPin = newDigits.join('');
    if (fullPin.length === 6 && !newDigits.includes('')) {
      triggerPinVerification(fullPin);
    }
  };

  const handlePinKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  // Verificação segura do PIN diretamente no Servidor Oficial Charlie
  const triggerPinVerification = async (pinCode: string) => {
    setPinTesting(true);
    setPinError(null);
    setPinSuccessInfo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const deviceId = await authStorage.getOrCreateDeviceId();
      const deviceName = await authStorage.getDeviceName();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${CLOUD_API_BASE}/pair/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pinCode,
          device_name: deviceName,
          device_id: deviceId,
          platform: Platform.OS,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error('PIN bloqueado por tentativas excessivas. Gere um novo no Desktop.');
        }
        throw new Error(errData.detail || 'PIN incorreto ou expirado. Gere um novo no Desktop.');
      }

      const pairResult = await res.json();

      await authStorage.savePairedCredentials({
        token: pairResult.token,
        serverUrl: CLOUD_API_BASE,
        deviceId,
        deviceName,
        isLan: false,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPinSuccessInfo('● Conectado ao PC via Servidor Oficial');

      const saved = await serverConfigService.getActiveServer();
      setTimeout(() => {
        onPairSuccess?.(saved);
        onClose();
      }, 800);
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPinError(err instanceof Error ? err.message : 'Falha ao verificar código PIN.');
    } finally {
      setPinTesting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Conectar Desktop</Text>
              <Text style={styles.subtitle}>Pareamento direto via Servidor Oficial Charlie</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#F5F7FA" />
            </Pressable>
          </View>

          {/* Abas */}
          <View style={styles.tabsRow}>
            <Pressable
              style={[styles.tab, tab === 'qr' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('qr');
                setScanned(false);
              }}
            >
              <Ionicons
                name="qr-code-outline"
                size={15}
                color={tab === 'qr' ? '#0D0F12' : '#8791A4'}
              />
              <Text style={[styles.tabText, tab === 'qr' && styles.tabTextActive]}>
                QR Code
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, tab === 'pin' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('pin');
              }}
            >
              <Ionicons
                name="keypad-outline"
                size={15}
                color={tab === 'pin' ? '#0D0F12' : '#8791A4'}
              />
              <Text style={[styles.tabText, tab === 'pin' && styles.tabTextActive]}>
                Código PIN
              </Text>
            </Pressable>
          </View>

          {/* Conteúdo da Aba QR Code */}
          {tab === 'qr' && (
            <View style={styles.tabContent}>
              {!permission ? (
                <View style={styles.cameraPlaceholder}>
                  <ActivityIndicator color="#818CF8" />
                </View>
              ) : !permission.granted ? (
                <View style={styles.permissionBox}>
                  <Ionicons name="camera-reverse-outline" size={40} color="#818CF8" />
                  <Text style={styles.permissionTitle}>Permissão de Câmera</Text>
                  <Text style={styles.permissionText}>
                    Aponte para o QR Code gerado pelo Charlie Desktop no menu &quot;Parear Celular&quot;.
                  </Text>
                  <Pressable style={styles.primaryButton} onPress={requestPermission}>
                    <Text style={styles.primaryButtonText}>Autorizar Câmera</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.scannerWrapper}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                  />
                  <View style={styles.scannerOverlay}>
                    <View style={styles.scanTarget}>
                      <View style={[styles.corner, styles.tl]} />
                      <View style={[styles.corner, styles.tr]} />
                      <View style={[styles.corner, styles.bl]} />
                      <View style={[styles.corner, styles.br]} />
                    </View>
                    <Text style={styles.scanInstruction}>
                      Aponte para o QR Code no Desktop
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Conteúdo da Aba PIN (6 Dígitos) */}
          {tab === 'pin' && (
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={styles.pinContainer}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.pinInstruction}>
                Digite o código PIN de 6 dígitos gerado no Charlie Desktop:
              </Text>

              <View style={styles.pinRow}>
                {pinDigits.map((digit, idx) => (
                  <TextInput
                    key={idx}
                    ref={(r) => {
                      pinInputRefs.current[idx] = r;
                    }}
                    style={[
                      styles.pinBox,
                      digit ? styles.pinBoxFilled : null,
                      idx === 2 && styles.pinBoxSeparator,
                    ]}
                    value={digit}
                    onChangeText={(val) => handlePinChange(val, idx)}
                    onKeyPress={(e) => handlePinKeyPress(e, idx)}
                    keyboardType="number-pad"
                    maxLength={idx === 0 ? 6 : 1}
                    selectTextOnFocus
                    placeholder="·"
                    placeholderTextColor="#475569"
                    autoFocus={idx === 0}
                  />
                ))}
              </View>

              {pinTesting && (
                <View style={styles.pinLoadingBox}>
                  <ActivityIndicator size="small" color="#818CF8" />
                  <Text style={styles.pinLoadingText}>Verificando PIN no Servidor Oficial...</Text>
                </View>
              )}

              {pinSuccessInfo && (
                <View style={[styles.resultCard, styles.resultOnline]}>
                  <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                  <Text style={styles.resultText}>{pinSuccessInfo}</Text>
                </View>
              )}

              {pinError && (
                <View style={[styles.resultCard, styles.resultOffline]}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.resultText}>{pinError}</Text>
                </View>
              )}

              <Pressable
                style={[
                  styles.primaryButton,
                  (pinDigits.includes('') || pinTesting) && styles.buttonDisabled,
                ]}
                onPress={() => triggerPinVerification(pinDigits.join(''))}
                disabled={pinDigits.includes('') || pinTesting}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color="#0D0F12" />
                <Text style={styles.primaryButtonText}>Conectar via PIN</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161A22',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#212631',
    maxHeight: '88%',
    minHeight: 460,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#212631',
  },
  tabActive: {
    backgroundColor: '#818CF8',
  },
  tabText: {
    color: '#8791A4',
    fontSize: 12,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#0D0F12',
  },
  tabContent: {
    flex: 1,
  },
  cameraPlaceholder: {
    height: 280,
    borderRadius: 20,
    backgroundColor: '#0D0F12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBox: {
    height: 280,
    borderRadius: 20,
    backgroundColor: '#0D0F12',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  permissionTitle: {
    color: '#F5F7FA',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionText: {
    color: '#8791A4',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  scannerWrapper: {
    height: 290,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  scanTarget: {
    width: 190,
    height: 190,
    position: 'relative',
  },
  corner: {
    width: 24,
    height: 24,
    borderColor: '#818CF8',
    position: 'absolute',
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanInstruction: {
    color: '#F5F7FA',
    fontSize: 12,
    marginTop: 18,
    fontWeight: '600',
    backgroundColor: 'rgba(13, 15, 18, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pinContainer: {
    paddingVertical: 8,
    gap: 16,
  },
  pinInstruction: {
    color: '#8791A4',
    fontSize: 13,
    marginBottom: 4,
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  pinBox: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#0D0F12',
    borderWidth: 1.5,
    borderColor: '#212631',
    color: '#F5F7FA',
    fontSize: 22,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
    textAlign: 'center',
  },
  pinBoxFilled: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
  },
  pinBoxSeparator: {
    marginRight: 6,
  },
  pinLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  pinLoadingText: {
    color: '#8791A4',
    fontSize: 12,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultOnline: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  resultOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  resultText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#818CF8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#0D0F12',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
