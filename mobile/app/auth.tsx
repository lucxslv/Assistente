import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { PairingModal } from '@/src/components/PairingModal';
import { useAuth } from '@/src/hooks/useAuth';
import { authStorage } from '@/src/services/authStorage';
import { serverConfigService } from '@/src/services/serverConfig';

type AuthMode = 'pc' | 'cloud';

export default function AuthScreen() {
  const { signIn, signUp, continueAsGuest, refreshSession } = useAuth();
  const [mode, setMode] = useState<AuthMode>('pc');
  const [pairingModalOpen, setPairingModalOpen] = useState(false);

  // Modo PC / PIN
  const [pin, setPin] = useState('');

  // Modo Nuvem
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Estados compartilhados
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handlePinSubmit() {
    const cleanPin = pin.trim().replace(/[^0-9]/g, '');
    if (cleanPin.length !== 6) {
      setError('O PIN deve conter exatamente 6 dígitos numéricos.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setBusy(true);
    setError('');

    try {
      const deviceId = await authStorage.getOrCreateDeviceId();
      const deviceName = await authStorage.getDeviceName();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('https://assistente-xi.vercel.app/api/pair/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: cleanPin,
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
        serverUrl: 'https://assistente-xi.vercel.app/api',
        deviceId,
        deviceName,
        isLan: false,
      });

      await refreshSession();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha na conexão com o servidor.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function handleCloudSubmit() {
    setBusy(true);
    setError('');
    try {
      if (registering) {
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha de autenticação na nuvem.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function handleGuestMode() {
    Haptics.selectionAsync();
    await continueAsGuest();
    router.replace('/');
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.page}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandContainer}>
            <Text style={styles.brand}>Charlie</Text>
            <Text style={styles.title}>Conversar. Observar. Agir.</Text>
            <Text style={styles.description}>
              Assistente de IA com controle em tempo real do seu computador.
            </Text>
          </View>

          {/* Seletor de Modo: Conectar ao PC vs Nuvem */}
          <View style={styles.tabContainer}>
            <Pressable
              testID="tab-pc"
              style={[styles.tabButton, mode === 'pc' && styles.tabButtonActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setMode('pc');
                setError('');
              }}
            >
              <Ionicons
                name="desktop-outline"
                size={16}
                color={mode === 'pc' ? '#818CF8' : '#77809A'}
              />
              <Text style={[styles.tabText, mode === 'pc' && styles.tabTextActive]}>
                Conectar ao PC
              </Text>
            </Pressable>

            <Pressable
              testID="tab-cloud"
              style={[styles.tabButton, mode === 'cloud' && styles.tabButtonActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setMode('cloud');
                setError('');
              }}
            >
              <Ionicons
                name="cloud-outline"
                size={16}
                color={mode === 'cloud' ? '#818CF8' : '#77809A'}
              />
              <Text style={[styles.tabText, mode === 'cloud' && styles.tabTextActive]}>
                Conta Nuvem
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            {mode === 'pc' ? (
              <>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Pareamento com Charlie Desktop</Text>
                  <Text style={styles.cardSubtitle}>
                    Digite o PIN de 6 dígitos exibido nas configurações do Charlie no seu computador.
                  </Text>
                </View>

                {/* Input de PIN */}
                <View style={styles.pinWrapper}>
                  <TextInput
                    testID="pin-input"
                    style={styles.pinInput}
                    value={pin}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '').slice(0, 6);
                      setPin(cleaned);
                      setError('');
                    }}
                    placeholder="000000"
                    placeholderTextColor="#475569"
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus={mode === 'pc'}
                  />
                  <Text style={styles.pinHelper}>
                    {pin.length}/6 dígitos
                  </Text>
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                {/* Botão de Conectar via PIN */}
                <Pressable
                  testID="pin-submit-button"
                  onPress={handlePinSubmit}
                  style={[styles.button, busy && styles.buttonDisabled]}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#0D0F12" />
                  ) : (
                    <View style={styles.btnRow}>
                      <Ionicons name="link-outline" size={18} color="#0D0F12" />
                      <Text style={styles.buttonText}>Conectar ao Computador</Text>
                    </View>
                  )}
                </Pressable>

                {/* Divisor */}
                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>OU</Text>
                  <View style={styles.divider} />
                </View>

                {/* Botão para Escanear QR Code */}
                <Pressable
                  testID="qr-scanner-button"
                  style={styles.qrButton}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPairingModalOpen(true);
                  }}
                >
                  <Ionicons name="qr-code-outline" size={18} color="#818CF8" />
                  <Text style={styles.qrButtonText}>Escanear QR Code na Tela do PC</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {registering ? 'Criar Conta no Charlie Cloud' : 'Entrar na Conta Cloud'}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    Acesse seu assistente e históricos centralizados via nuvem.
                  </Text>
                </View>

                {registering && (
                  <TextInput
                    testID="name-input"
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Nome completo"
                    placeholderTextColor="#77809A"
                  />
                )}

                <TextInput
                  testID="email-input"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="E-mail"
                  placeholderTextColor="#77809A"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <TextInput
                  testID="password-input"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Senha"
                  placeholderTextColor="#77809A"
                  secureTextEntry
                />

                {!!error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  testID="cloud-submit-button"
                  onPress={handleCloudSubmit}
                  style={[styles.button, busy && styles.buttonDisabled]}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#0D0F12" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {registering ? 'Criar Conta' : 'Entrar'}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRegistering(!registering);
                    setError('');
                  }}
                >
                  <Text style={styles.link}>
                    {registering ? 'Já tenho conta? Entrar' : 'Não tem conta? Criar nova'}
                  </Text>
                </Pressable>
              </>
            )}

            {/* Opção para entrar diretamente no modo demonstração */}
            <Pressable
              testID="guest-button"
              onPress={handleGuestMode}
              style={styles.guestButton}
            >
              <Ionicons name="sparkles-outline" size={14} color="#818CF8" />
              <Text style={styles.guestButtonText}>Continuar no Modo Demonstração (Lucas)</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Modal de Pareamento Completo (com Câmera / QR Code Scanner) */}
        <PairingModal
          visible={pairingModalOpen}
          onClose={() => setPairingModalOpen(false)}
          onPairSuccess={async () => {
            await refreshSession();
            router.replace('/');
          }}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0D0F12',
  },
  scrollContent: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 36,
    paddingBottom: 40,
  },
  brandContainer: {
    marginBottom: 20,
  },
  brand: {
    color: '#818CF8',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
  description: {
    color: '#8791A4',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#161A22',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#212631',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#212631',
  },
  tabText: {
    color: '#77809A',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#F5F7FA',
  },
  card: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    padding: 20,
    borderRadius: 22,
    gap: 14,
  },
  cardHeader: {
    marginBottom: 4,
  },
  cardTitle: {
    color: '#F5F7FA',
    fontSize: 16,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  pinWrapper: {
    alignItems: 'center',
    marginVertical: 4,
  },
  pinInput: {
    width: '100%',
    color: '#818CF8',
    backgroundColor: '#0D0F12',
    borderColor: '#818CF8',
    borderWidth: 2,
    paddingVertical: 14,
    borderRadius: 14,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
  },
  pinHelper: {
    color: '#77809A',
    fontSize: 11,
    marginTop: 6,
  },
  input: {
    color: '#F5F7FA',
    backgroundColor: '#0D0F12',
    borderColor: '#212631',
    borderWidth: 1,
    padding: 14,
    borderRadius: 14,
    fontSize: 14,
  },
  error: {
    color: '#EF4444',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  button: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#0D0F12',
    fontWeight: '800',
    fontSize: 14,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#212631',
  },
  dividerText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#1E232E',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  qrButtonText: {
    color: '#818CF8',
    fontWeight: '700',
    fontSize: 13,
  },
  link: {
    color: '#818CF8',
    textAlign: 'center',
    padding: 6,
    fontWeight: '600',
    fontSize: 13,
  },
  guestButton: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#212631',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  guestButtonText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '700',
  },
});
