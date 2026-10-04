import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/hooks/useAuth';

export default function AuthScreen() {
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
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
      setError(e instanceof Error ? e.message : 'Falha de autenticação.');
    } finally {
      setBusy(false);
    }
  }

  function handleGuestMode() {
    Haptics.selectionAsync();
    continueAsGuest();
    router.replace('/');
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.page}
      >
        <View style={styles.brandContainer}>
          <Text style={styles.brand}>Charlie</Text>
          <Text style={styles.title}>Conversar. Observar. Agir.</Text>
        </View>

        <View style={styles.card}>
          {registering && (
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nome"
              placeholderTextColor="#77809A"
            />
          )}

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            placeholderTextColor="#77809A"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Senha"
            placeholderTextColor="#77809A"
            secureTextEntry
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={submit} style={styles.button} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#0D0F12" />
            ) : (
              <Text style={styles.buttonText}>
                {registering ? 'Criar conta' : 'Entrar'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setRegistering(!registering);
            }}
          >
            <Text style={styles.link}>
              {registering ? 'Já tenho conta' : 'Criar nova conta'}
            </Text>
          </Pressable>

          {/* Opção para entrar diretamente no modo demonstração */}
          <Pressable onPress={handleGuestMode} style={styles.guestButton}>
            <Text style={styles.guestButtonText}>Continuar como Lucas (Demo)</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-evenly',
    backgroundColor: '#0D0F12',
  },
  brandContainer: {
    marginBottom: 8,
  },
  brand: {
    color: '#818CF8',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    padding: 20,
    borderRadius: 22,
    gap: 14,
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
    fontSize: 13,
  },
  button: {
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#0D0F12',
    fontWeight: '800',
    fontSize: 14,
  },
  link: {
    color: '#818CF8',
    textAlign: 'center',
    padding: 6,
    fontWeight: '600',
    fontSize: 13,
  },
  guestButton: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#212631',
    alignItems: 'center',
  },
  guestButtonText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '700',
  },
});
