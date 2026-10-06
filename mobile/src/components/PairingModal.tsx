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
import { checkServerHealth, ServerHealthResult } from '@/src/services/apiClient';
import { ServerProfile, normalizeServerUrl, normalizeHostAddress, serverConfigService } from '@/src/services/serverConfig';
import { authStorage } from '@/src/services/authStorage';

export interface PairingModalProps {
  visible: boolean;
  onClose: () => void;
  onPairSuccess?: (server: ServerProfile) => void;
}

interface StrictQRPayload {
  v: number;
  id: string;
  lan: string;
  tunnel?: string | null;
  secret: string;
  // Compatibilidade legada
  type?: string;
  name?: string;
  url?: string;
  lanUrl?: string;
  tunnelUrl?: string;
  token?: string;
  pin?: string;
}

export function PairingModal({ visible, onClose, onPairSuccess }: PairingModalProps) {
  const [tab, setTab] = useState<'qr' | 'pin' | 'manual' | 'list'>('qr');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Aba PIN (6 dígitos)
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [pinHost, setPinHost] = useState('');
  const [pinTesting, setPinTesting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccessInfo, setPinSuccessInfo] = useState<string | null>(null);
  const pinInputRefs = useRef<(TextInput | null)[]>([]);

  // Formulário Manual
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ServerHealthResult | null>(null);

  // Lista de Servidores Salvos
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  const loadServers = async () => {
    try {
      const list = await serverConfigService.listServers();
      const active = await serverConfigService.getActiveServer();
      setServers(list);
      setActiveId(active.id);
      if (!pinHost && active.url) {
        setPinHost(active.url);
      }
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
          setPinHost(active.url);
          setScanned(false);
          setTestResult(null);
          setPinDigits(['', '', '', '', '', '']);
          setPinError(null);
          setPinSuccessInfo(null);
        } catch {
          // Ignora
        }
      })();
    }
    return () => {
      mounted = false;
    };
  }, [visible]);

  // Handler de leitura do QR Code seguro (schema v1 estrito)
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

      // Obtenção dos identificadores seguros do dispositivo móvel
      const deviceId = await authStorage.getOrCreateDeviceId();
      const deviceName = await authStorage.getDeviceName();

      // Fluxo 1: Schema V1 com troca criptográfica de chaves (HMAC e token permanente)
      if (parsed.v === 1 && parsed.id && parsed.secret) {
        const lanCandidate = parsed.lan ? normalizeHostAddress(parsed.lan) : '';
        const tunnelCandidate = parsed.tunnel ? normalizeServerUrl(parsed.tunnel).replace(/\/api$/, '') : '';

        // Tenta comunicação prioritária na rede local (LAN) com timeout de 2.5s
        let chosenBaseUrl = lanCandidate;
        let isLan = true;

        if (lanCandidate) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const pingRes = await fetch(`${lanCandidate}/api/pair/status?id=${parsed.id}`, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!pingRes.ok && pingRes.status !== 404) {
              throw new Error('LAN timeout');
            }
          } catch {
            // Se falhou na LAN (ex: celular no 4G), faz fallback para o túnel ou emite erro claro
            if (tunnelCandidate) {
              chosenBaseUrl = tunnelCandidate;
              isLan = false;
            } else {
              throw new Error(
                `Não foi possível alcançar o PC em ${lanCandidate}. Certifique-se de que o celular e o computador estão na mesma rede Wi-Fi.`
              );
            }
          }
        } else if (tunnelCandidate) {
          chosenBaseUrl = tunnelCandidate;
          isLan = false;
        } else {
          chosenBaseUrl = 'https://assistente-xi.vercel.app';
          isLan = false;
        }

        // Dispara handshake POST /api/pair/verify-qr
        const verifyResponse = await fetch(`${chosenBaseUrl}/api/pair/verify-qr`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: parsed.id,
            secret: parsed.secret,
            device_name: deviceName,
            device_id: deviceId,
            platform: Platform.OS,
          }),
        });

        if (!verifyResponse.ok) {
          const errData = await verifyResponse.json().catch(() => ({}));
          throw new Error(errData.detail || 'Falha na validação do segredo do QR Code.');
        }

        const verifyResult = await verifyResponse.json();
        const permanentToken = verifyResult.token;

        // Persiste as credenciais no SecureStore e sincroniza o perfil do servidor
        await authStorage.savePairedCredentials({
          token: permanentToken,
          serverUrl: chosenBaseUrl,
          deviceId,
          deviceName,
          isLan,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const savedProfile = await serverConfigService.getActiveServer();
        onPairSuccess?.(savedProfile);
        onClose();
        return;
      }

      // Fluxo 2: Fallback para payloads legados (type: "charlie-pair")
      let chosenUrl = parsed.lanUrl || parsed.url;
      if (parsed.lanUrl && parsed.tunnelUrl) {
        const lanCheck = await checkServerHealth(parsed.lanUrl);
        if (lanCheck.status !== 'online') {
          chosenUrl = parsed.tunnelUrl;
        }
      } else if (!chosenUrl && parsed.tunnelUrl) {
        chosenUrl = parsed.tunnelUrl;
      }

      if (chosenUrl) {
        const check = await checkServerHealth(chosenUrl);
        if (check.status !== 'online') {
          chosenUrl = 'https://assistente-xi.vercel.app/api';
        }
      } else {
        chosenUrl = 'https://assistente-xi.vercel.app/api';
      }

      const saved = await serverConfigService.saveServer({
        name: parsed.name ?? 'Desktop Charlie',
        url: chosenUrl,
        token: parsed.token,
        makeActive: true,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPairSuccess?.(saved);
      onClose();
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

    // Caso o usuário cole todos os 6 dígitos na caixa de texto
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

  // Verificação segura do PIN com rate limiting e emissão de token permanente
  const triggerPinVerification = async (pinCode: string) => {
    setPinTesting(true);
    setPinError(null);
    setPinSuccessInfo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const allServers = await serverConfigService.listServers();
      const lanServer = allServers.find((s) => !s.url.includes('vercel.app'));

      // Monta lista de hosts candidatos inteligente (host digitado, LAN salva, host físico padrão, emulador e localhost)
      const candidateList: string[] = [];
      if (pinHost.trim()) candidateList.push(pinHost.trim());
      if (lanServer?.url) candidateList.push(lanServer.url);
      candidateList.push('http://192.168.0.190:8005');
      if (Platform.OS === 'android') candidateList.push('http://10.0.2.2:8005');
      candidateList.push('http://localhost:8005');

      const uniqueBases = Array.from(new Set(candidateList.map((c) => normalizeHostAddress(c))));

      const deviceId = await authStorage.getOrCreateDeviceId();
      const deviceName = await authStorage.getDeviceName();

      let response: Response | null = null;
      let lastErrMessage = '';
      let successfulHost = '';

      for (const baseHost of uniqueBases) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);

          const res = await fetch(`${baseHost}/api/pair/verify-pin`, {
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

          if (res.ok) {
            response = res;
            successfulHost = baseHost;
            break;
          } else {
            const errData = await res.json().catch(() => ({}));
            lastErrMessage = errData.detail || `Erro HTTP ${res.status}`;
            if (res.status === 429) {
              throw new Error('PIN bloqueado por tentativas excessivas. Gere um novo no Desktop.');
            }
            if (res.status === 400 || res.status === 401) {
              throw new Error(errData.detail || 'PIN incorreto.');
            }
          }
        } catch (fetchErr: any) {
          if (fetchErr.message && (fetchErr.message.includes('PIN') || fetchErr.message.includes('bloqueado'))) {
            throw fetchErr;
          }
          // Falha de rede para este host, continua tentando o próximo candidato
        }
      }

      if (!response) {
        throw new Error(
          lastErrMessage ||
            'Não foi possível conectar ao PC. Verifique se celular e computador estão na mesma rede Wi-Fi e se o Charlie Desktop está aberto.'
        );
      }

      const pairResult = await response.json();
      let resolvedUrl = successfulHost;
      let isLan = false;

      // Valida se o endpoint LAN está respondendo antes de promovê-lo a servidor ativo
      if (pairResult.lan_url) {
        try {
          const lanHealth = await checkServerHealth(pairResult.lan_url);
          if (lanHealth.status === 'online') {
            resolvedUrl = pairResult.lan_url;
            isLan = true;
          } else if (pairResult.tunnel_url) {
            resolvedUrl = pairResult.tunnel_url;
          }
        } catch {
          // Mantém baseHost (ex: nuvem) caso a porta local esteja fechada
        }
      } else if (pairResult.tunnel_url) {
        resolvedUrl = pairResult.tunnel_url;
      }

      // Salva no SecureStore
      await authStorage.savePairedCredentials({
        token: pairResult.token,
        serverUrl: resolvedUrl,
        deviceId,
        deviceName,
        isLan,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPinSuccessInfo(`● Conectado ao PC (${isLan ? 'LAN' : 'Nuvem'})`);

      const saved = await serverConfigService.getActiveServer();
      setTimeout(() => {
        onPairSuccess?.(saved);
        onClose();
      }, 1000);
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPinError(err instanceof Error ? err.message : 'Falha ao verificar código PIN.');
    } finally {
      setPinTesting(false);
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
              <Text style={styles.title}>Conectar Desktop</Text>
              <Text style={styles.subtitle}>Pareamento seguro via QR Code ou PIN de 6 dígitos</Text>
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

            <Pressable
              style={[styles.tab, tab === 'manual' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('manual');
              }}
            >
              <Ionicons
                name="create-outline"
                size={15}
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
                size={15}
                color={tab === 'list' ? '#0D0F12' : '#8791A4'}
              />
              <Text style={[styles.tabText, tab === 'list' && styles.tabTextActive]}>
                Salvos
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

          {/* Conteúdo da Aba PIN (6 Dígitos com Rate Limiting) */}
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

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Endereço ou IP do PC (opcional se já na rede local)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: http://192.168.1.105:8005"
                  placeholderTextColor="#64748B"
                  value={pinHost}
                  onChangeText={setPinHost}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {pinTesting && (
                <View style={styles.pinLoadingBox}>
                  <ActivityIndicator size="small" color="#818CF8" />
                  <Text style={styles.pinLoadingText}>Verificando PIN e trocando chaves com o Desktop...</Text>
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
                <Text style={styles.label}>Token de Acesso (Opcional)</Text>
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
    maxHeight: '88%',
    minHeight: 480,
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
    gap: 6,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#212631',
  },
  tabActive: {
    backgroundColor: '#818CF8',
  },
  tabText: {
    color: '#8791A4',
    fontSize: 11,
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
    gap: 14,
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
    borderRadius: 12,
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    color: '#F5F7FA',
    paddingHorizontal: 14,
    fontSize: 14,
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
  manualContainer: {
    gap: 14,
    paddingVertical: 8,
  },
  manualActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#818CF8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#0D0F12',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#212631',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  listContainer: {
    gap: 8,
    paddingVertical: 8,
  },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
  },
  serverCardActive: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(129, 140, 248, 0.05)',
  },
  serverCardInfo: {
    flex: 1,
    marginRight: 10,
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
    backgroundColor: '#818CF8',
    color: '#0D0F12',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  serverCardUrl: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 2,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
