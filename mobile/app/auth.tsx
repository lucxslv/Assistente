import React, { useState } from 'react';
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

export default function AuthScreen() {
  const { signIn, signUp, refreshSession } = useAuth();
  const [pairingModalOpen, setPairingModalOpen] = useState(false);

  // Estados de formulário da Conta
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Estados de feedback
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha seu e-mail e senha.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    if (registering && !name.trim()) {
      setError('Por favor, informe seu nome completo.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setBusy(true);
    setError('');

    try {
      if (registering) {
        await signUp(name.trim(), email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha na autenticação da conta.';
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
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
          {/* Marca Charlie */}
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <Ionicons name="sparkles" size={20} color="#818CF8" />
            </View>
            <Text style={styles.brand}>Charlie</Text>
            <Text style={styles.title}>
              {registering ? 'Criar Nova Conta' : 'Entrar no Charlie'}
            </Text>
            <Text style={styles.description}>
              {registering
                ? 'Cadastre-se para sincronizar seus computadores e histórico de IA.'
                : 'Acesse sua conta para controlar seu computador e conversar com o assistente.'}
            </Text>
          </View>

          {/* Cartão de Autenticação Padrão */}
          <View style={styles.card}>
            {registering && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome Completo</Text>
                <TextInput
                  testID="name-input"
                  style={styles.input}
                  value={name}
                  onChangeText={(val) => {
                    setName(val);
                    setError('');
                  }}
                  placeholder="Lucas Silva"
                  placeholderTextColor="#475569"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>E-mail</Text>
              <TextInput
                testID="email-input"
                style={styles.input}
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  setError('');
                }}
                placeholder="seu.email@exemplo.com"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Senha</Text>
              <TextInput
                testID="password-input"
                style={styles.input}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setError('');
                }}
                placeholder="Sua senha secreta"
                placeholderTextColor="#475569"
                secureTextEntry
              />
            </View>

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Botão Principal de Login / Registro */}
            <Pressable
              testID="auth-submit-button"
              onPress={handleSubmit}
              style={[styles.button, busy && styles.buttonDisabled]}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#0D0F12" />
              ) : (
                <View style={styles.btnRow}>
                  <Text style={styles.buttonText}>
                    {registering ? 'Criar Conta' : 'Entrar na Conta'}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#0D0F12" />
                </View>
              )}
            </Pressable>

            {/* Alternador entre Login e Criação */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setRegistering(!registering);
                setError('');
              }}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>
                {registering
                  ? 'Já tem uma conta? Entrar agora'
                  : 'Não tem conta? Criar nova conta'}
              </Text>
            </Pressable>

            {/* Divisor */}
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OU CONECTE DIRETAMENTE</Text>
              <View style={styles.divider} />
            </View>

            {/* Pareamento Rápido com Desktop sem conta */}
            <Pressable
              testID="qr-scanner-button"
              style={styles.directPairButton}
              onPress={() => {
                Haptics.selectionAsync();
                setPairingModalOpen(true);
              }}
            >
              <Ionicons name="desktop-outline" size={16} color="#818CF8" />
              <Text style={styles.directPairText}>Parear com Desktop (PIN / QR Code)</Text>
            </Pressable>

            <View style={styles.autoDiscoveryHint}>
              <Ionicons name="wifi-outline" size={13} color="#64748B" />
              <Text style={styles.hintText}>
                Computadores Charlie na mesma rede Wi-Fi são detectados automaticamente após o login.
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Modal de Pareamento Direto / QR Code */}
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
    paddingTop: Platform.OS === 'ios' ? 24 : 40,
    paddingBottom: 40,
  },
  brandContainer: {
    marginBottom: 24,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  brand: {
    color: '#818CF8',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  description: {
    color: '#8791A4',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    padding: 20,
    borderRadius: 22,
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    color: '#F5F7FA',
    backgroundColor: '#0D0F12',
    borderColor: '#212631',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    flex: 1,
  },
  button: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  linkButton: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  linkText: {
    color: '#818CF8',
    fontWeight: '600',
    fontSize: 13,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#212631',
  },
  dividerText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  directPairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1E232E',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  directPairText: {
    color: '#F5F7FA',
    fontWeight: '700',
    fontSize: 13,
  },
  autoDiscoveryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  hintText: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
});
