import React, { useEffect, useState } from 'react';
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
import { checkServerHealth, ServerHealthResult } from '@/src/services/apiClient';
import { ServerProfile, serverConfigService } from '@/src/services/serverConfig';

interface PairingModalProps {
  visible: boolean;
  onClose: () => void;
  onPairSuccess?: (server: ServerProfile) => void;
}

interface QRPairingPayload {
  type: 'charlie-pair';
  name?: string;
  url: string;
  token?: string;
}

export function PairingModal({ visible, onClose, onPairSuccess }: PairingModalProps) {
  const [tab, setTab] = useState<'qr' | 'manual' | 'list'>('qr');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Formulário Manual
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ServerHealthResult | null>(null);

  // Lista de Servidores
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  const loadServers = async () => {
    try {
      const list = await serverConfigService.listServers();
      const active = await serverConfigService.getActiveServer();
      setServers(list);
      setActiveId(active.id);
    } catch {
      // Ignora
    }
  };

  useEffect(() => {
    let mounted = true;
    if (visible) {
      (async () => {
        try {
          const list = await serverConfigService.listServers();
          const active = await serverConfigService.getActiveServer();
          if (!mounted) return;
          setServers(list);
          setActiveId(active.id);
          setScanned(false);
          setTestResult(null);
        } catch {
          // Ignora
        }
      })();
    }
    return () => {
      mounted = false;
    };
  }, [visible]);

  // Handler de leitura do QR Code
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      let payload: QRPairingPayload | null = null;
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed.url === 'string') {
          payload = parsed;
        }
      } catch {
        // Se não for JSON, verifica se é uma URL direta
        if (data.startsWith('http://') || data.startsWith('https://')) {
          payload = {
            type: 'charlie-pair',
            name: 'Servidor Pareado',
            url: data,
          };
        }
      }

      if (!payload || !payload.url) {
        throw new Error('QR Code inválido para o Charlie.');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Salva e ativa o servidor
      const saved = await serverConfigService.saveServer({
        name: payload.name ?? 'Servidor Pareado',
        url: payload.url,
        token: payload.token,
        makeActive: true,
      });

      onPairSuccess?.(saved);
      onClose();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setScanned(false), 2000);
    }
  };

  // Teste de conexão manual
  const handleTestConnection = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setTestResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await checkServerHealth(url.trim());
    setTestResult(result);
    setTesting(false);

    if (result.status === 'online') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  // Salvar manual
  const handleSaveManual = async () => {
    if (!url.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const saved = await serverConfigService.saveServer({
      name: name.trim() || 'Servidor Manual',
      url: url.trim(),
      token: token.trim() || undefined,
      makeActive: true,
    });

    onPairSuccess?.(saved);
    onClose();
  };

  // Trocar servidor ativo
  const handleSelectServer = async (server: ServerProfile) => {
    Haptics.selectionAsync();
    await serverConfigService.setActiveServer(server.id);
    setActiveId(server.id);
    onPairSuccess?.(server);
    onClose();
  };

  // Remover servidor
  const handleDeleteServer = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await serverConfigService.deleteServer(id);
    await loadServers();
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
              <Text style={styles.title}>Conectar Servidor</Text>
              <Text style={styles.subtitle}>LAN, Tailscale, Túnel ou Nuvem</Text>
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
                size={16}
                color={tab === 'qr' ? '#0D0F12' : '#8791A4'}
              />
              <Text style={[styles.tabText, tab === 'qr' && styles.tabTextActive]}>
                QR Code
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, tab === 'manual' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('manual');
              }}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={tab === 'manual' ? '#0D0F12' : '#8791A4'}
              />
              <Text style={[styles.tabText, tab === 'manual' && styles.tabTextActive]}>
                Manual
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, tab === 'list' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('list');
                loadServers();
              }}
            >
              <Ionicons
                name="server-outline"
                size={16}
                color={tab === 'list' ? '#0D0F12' : '#8791A4'}
              />
              <Text style={[styles.tabText, tab === 'list' && styles.tabTextActive]}>
                Salvos ({servers.length})
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
                    Necessária para ler o QR Code de pareamento do Charlie Desktop ou CLI.
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
                      Aponte para o QR Code gerado pelo Charlie Desktop
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Conteúdo da Aba Manual */}
          {tab === 'manual' && (
            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={styles.manualContainer}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome do Ambiente</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex.: PC Casa (LAN), Mac Mini"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Endereço URL do Servidor</Text>
                <TextInput
                  style={styles.input}
                  placeholder="http://192.168.1.105:8005 ou túnel"
                  placeholderTextColor="#64748B"
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Token JWT (Opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Cole aqui se houver proteção"
                  placeholderTextColor="#64748B"
                  value={token}
                  onChangeText={setToken}
                  secureTextEntry
                />
              </View>

              {/* Resultado do Teste de Conexão */}
              {testResult && (
                <View
                  style={[
                    styles.resultCard,
                    testResult.status === 'online'
                      ? styles.resultOnline
                      : styles.resultOffline,
                  ]}
                >
                  <Ionicons
                    name={testResult.status === 'online' ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={testResult.status === 'online' ? '#22C55E' : '#EF4444'}
                  />
                  <Text style={styles.resultText}>
                    {testResult.status === 'online'
                      ? `Conectado! Latência: ${testResult.latencyMs}ms (${testResult.networkType.toUpperCase()})`
                      : `Inacessível: ${testResult.error ?? 'Verifique a rede'}`}
                  </Text>
                </View>
              )}

              <View style={styles.manualActions}>
                <Pressable
                  style={[styles.secondaryButton, testing && styles.buttonDisabled]}
                  onPress={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <ActivityIndicator size="small" color="#F5F7FA" />
                  ) : (
                    <>
                      <Ionicons name="pulse" size={16} color="#F5F7FA" />
                      <Text style={styles.secondaryButtonText}>Testar Conexão</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.primaryButton, !url.trim() && styles.buttonDisabled]}
                  onPress={handleSaveManual}
                  disabled={!url.trim()}
                >
                  <Ionicons name="checkmark" size={16} color="#0D0F12" />
                  <Text style={styles.primaryButtonText}>Salvar e Conectar</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* Conteúdo da Aba Lista de Servidores */}
          {tab === 'list' && (
            <ScrollView style={styles.tabContent} contentContainerStyle={styles.listContainer}>
              {servers.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.serverCard, isActive && styles.serverCardActive]}
                    onPress={() => handleSelectServer(s)}
                  >
                    <View style={styles.serverCardInfo}>
                      <View style={styles.serverCardTop}>
                        <Text style={styles.serverCardName}>{s.name}</Text>
                        {isActive && <Text style={styles.activeTag}>ATIVO</Text>}
                      </View>
                      <Text style={styles.serverCardUrl} numberOfLines={1}>
                        {s.url}
                      </Text>
                    </View>

                    {servers.length > 1 && (
                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => handleDeleteServer(s.id)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
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
    maxHeight: '85%',
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
    borderRadius: 12,
  },
  manualContainer: {
    gap: 14,
    paddingBottom: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#8791A4',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    height: 44,
    backgroundColor: '#0D0F12',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#F5F7FA',
    fontSize: 13,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  resultOnline: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderWidth: 1,
  },
  resultOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
  },
  resultText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  manualActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#818CF8',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryButtonText: {
    color: '#0D0F12',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#212631',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryButtonText: {
    color: '#F5F7FA',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  listContainer: {
    gap: 10,
    paddingBottom: 16,
  },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0F12',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  serverCardActive: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
  },
  serverCardInfo: {
    flex: 1,
  },
  serverCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serverCardName: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '700',
  },
  activeTag: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(129, 140, 248, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  serverCardUrl: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
});
