import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { useAuth } from '@/src/hooks/useAuth';
import { useServerConnection } from '@/src/hooks/useServerConnection';
import { useDeviceConnection } from '@/src/hooks/useDeviceConnection';
import { deviceDiscoveryService } from '@/src/services/deviceDiscovery';
import { serverConfigService } from '@/src/services/serverConfig';
import { authStorage } from '@/src/services/authStorage';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const serverConn = useServerConnection();
  const deviceConn = useDeviceConnection();

  const [discovering, setDiscovering] = useState(false);
  const [discoveryFeedback, setDiscoveryFeedback] = useState<string | null>(null);

  const initials = (user?.name || 'Lucas')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleAutoDiscovery = async () => {
    setDiscovering(true);
    setDiscoveryFeedback(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await deviceDiscoveryService.autoDiscoverAndLink();
      if (result) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDiscoveryFeedback(`✓ Conectado automaticamente ao ${result.name}!`);
        await serverConn.refresh();
        await deviceConn.refresh();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setDiscoveryFeedback('Nenhum desktop novo encontrado na rede local.');
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setDiscoveryFeedback('Erro durante a busca na rede local.');
    } finally {
      setDiscovering(false);
      setTimeout(() => setDiscoveryFeedback(null), 4000);
    }
  };

  const handleToggleServer = async () => {
    Haptics.selectionAsync();
    const active = await serverConfigService.getActiveServer();
    const isCloud = active.url.includes('vercel.app');

    if (isCloud) {
      // Alterna para local
      await serverConfigService.saveServer({
        name: 'Desktop Local (LAN)',
        url: 'http://192.168.0.190:8005/api',
        makeActive: true,
      });
    } else {
      // Alterna para nuvem
      await serverConfigService.saveServer({
        name: 'Servidor Oficial Nuvem',
        url: 'https://assistente-xi.vercel.app/api',
        makeActive: true,
      });
    }
    await serverConn.refresh();
    await deviceConn.refresh();
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    Alert.alert(
      'Desconectar do Charlie',
      'Deseja realmente sair da sua conta neste dispositivo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await signOut();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === 'ios' ? 16 : 28,
            paddingBottom: insets.bottom + 80,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho de Perfil */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'Lucas'}</Text>
            <Text style={styles.profileEmail}>{user?.email || 'usuario@charlie.local'}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.statusBadge}>
                <View style={styles.greenDot} />
                <Text style={styles.badgeText}>Conta Ativa</Text>
              </View>
              {serverConn.isOnline && (
                <View style={[styles.statusBadge, styles.latencyBadge]}>
                  <Ionicons name="speedometer-outline" size={12} color="#818CF8" />
                  <Text style={styles.badgeText}>
                    {serverConn.latencyMs ? `${serverConn.latencyMs}ms` : 'Online'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Feedback de Descoberta */}
        {discoveryFeedback && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{discoveryFeedback}</Text>
          </View>
        )}

        {/* Seção Computador Vinculado (Desktop) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="desktop-outline" size={18} color="#818CF8" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Charlie Desktop</Text>
              <Text style={styles.cardSubtitle}>Computador vinculado para automação</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Dispositivo:</Text>
            <Text style={styles.detailValue}>{deviceConn.pcName}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status Físico:</Text>
            <View style={styles.rowAlign}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: deviceConn.isPcOnline ? '#22C55E' : '#64748B' },
                ]}
              />
              <Text style={styles.detailValue}>
                {deviceConn.isPcOnline ? 'Online na Rede' : 'Offline / Suspenso'}
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Conexão:</Text>
            <Text style={styles.detailValue}>
              {serverConn.activeServer?.url.includes('vercel.app')
                ? 'Nuvem (Vercel WAN)'
                : 'Rede Local Wi-Fi (LAN)'}
            </Text>
          </View>

          <Pressable
            style={[styles.actionButton, discovering && styles.buttonDisabled]}
            onPress={handleAutoDiscovery}
            disabled={discovering}
          >
            {discovering ? (
              <ActivityIndicator color="#0D0F12" size="small" />
            ) : (
              <View style={styles.btnRow}>
                <Ionicons name="scan-outline" size={16} color="#0D0F12" />
                <Text style={styles.actionButtonText}>
                  Descobrir Desktop na Rede Local
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Seção Servidor e Roteamento */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="server-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Roteamento de API</Text>
              <Text style={styles.cardSubtitle}>Alterne entre Nuvem e Servidor Local</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Servidor Atual:</Text>
            <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>
              {serverConn.activeServer?.name || 'Servidor Oficial'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Endpoint:</Text>
            <Text style={[styles.detailValueCode, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>
              {serverConn.activeServer?.url || 'https://assistente-xi.vercel.app/api'}
            </Text>
          </View>

          <Pressable style={styles.secondaryButton} onPress={handleToggleServer}>
            <Ionicons name="swap-horizontal" size={16} color="#818CF8" />
            <Text style={styles.secondaryButtonText}>
              {serverConn.activeServer?.url.includes('vercel.app')
                ? 'Mudar para Conexão Local (192.168.0.190:8005)'
                : 'Mudar para Servidor Oficial Nuvem'}
            </Text>
          </Pressable>
        </View>

        {/* Seção Sistema e Sobre */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBox}>
              <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Sobre a Plataforma</Text>
              <Text style={styles.cardSubtitle}>Charlie Assistente Multimodal v2.0</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Plataforma Mobile:</Text>
            <Text style={styles.detailValue}>Expo SDK 57 (React Native 0.86)</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Inteligência IA:</Text>
            <Text style={styles.detailValue}>Gemini 3.1 + Supabase Cloud</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Comunicação:</Text>
            <Text style={styles.detailValue}>WebSockets & REST Híbrido</Text>
          </View>
        </View>

        {/* Botão de Logout */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>Desconectar da Conta</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
    marginBottom: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4338CA',
  },
  avatarText: {
    color: '#0D0F12',
    fontSize: 22,
    fontWeight: '900',
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    color: '#F5F7FA',
    fontSize: 20,
    fontWeight: '800',
  },
  profileEmail: {
    color: '#8791A4',
    fontSize: 13,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  latencyBadge: {
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  badgeText: {
    color: '#F5F7FA',
    fontSize: 11,
    fontWeight: '700',
  },
  feedbackBox: {
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderColor: 'rgba(129, 140, 248, 0.3)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  feedbackText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#212631',
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E232E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    color: '#F5F7FA',
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#77809A',
    fontSize: 11,
    marginTop: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    color: '#8791A4',
    fontSize: 13,
  },
  detailValue: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '600',
  },
  detailValueCode: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '600',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  actionButton: {
    backgroundColor: '#818CF8',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  actionButtonText: {
    color: '#0D0F12',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#1E232E',
    borderColor: '#2D3748',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  secondaryButtonText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
