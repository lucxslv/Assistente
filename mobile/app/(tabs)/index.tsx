import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { PairingModal } from '@/src/components/PairingModal';
import { useServerConnection } from '@/src/hooks/useServerConnection';
import { useDeviceConnection } from '@/src/hooks/useDeviceConnection';
import { desktopControlService } from '@/src/services/desktopControl';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const serverConn = useServerConnection();
  const deviceConn = useDeviceConnection();
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const { refresh: refreshServer } = serverConn;
  const { refresh: refreshDevice } = deviceConn;

  const handlePullRefresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.allSettled([refreshServer(), refreshDevice()]);
    } finally {
      setLoading(false);
    }
  }, [refreshServer, refreshDevice]);

  useFocusEffect(
    useCallback(() => {
      refreshServer();
      refreshDevice();
    }, [refreshServer, refreshDevice])
  );

  const handleAction = (route: '/charlie' | '/workspace' | '/agent') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route);
  };

  const actionChips = [
    { id: 'lock', label: 'Bloquear PC', icon: 'lock-closed-outline' as const, color: '#EF4444', hint: 'Win + L' },
    { id: 'media', label: 'Pausar Mídia', icon: 'play-outline' as const, color: '#818CF8', hint: 'Play/Pause' },
    { id: 'workspace', label: 'Workspace', icon: 'layers-outline' as const, color: '#818CF8', hint: 'Painel' },
    { id: 'git_pull', label: 'Git Pull', icon: 'git-pull-request-outline' as const, color: '#F59E0B', hint: 'Sync' },
    { id: 'runner', label: 'Runner', icon: 'hardware-chip-outline' as const, color: '#22C55E', hint: 'Agente' },
    { id: 'chat', label: 'Nova Conversa', icon: 'chatbubble-ellipses-outline' as const, color: '#38BDF8', hint: 'Charlie' },
  ];

  const triggerQuickChip = async (chipId: string, label: string) => {
    const isPcAction = chipId === 'lock' || chipId === 'media' || chipId === 'git_pull';

    // Se a ação depender do PC físico e ele estiver offline, desabilita com feedback tátil
    if (isPcAction && !deviceConn.isPcOnline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setActionFeedback('PC Offline ou Suspenso');
      setTimeout(() => setActionFeedback(null), 2500);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (chipId === 'lock') {
        await desktopControlService.lockPC();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setActionFeedback('PC Bloqueado!');
      } else if (chipId === 'media') {
        await desktopControlService.sendMediaKey('play_pause');
        setActionFeedback('Mídia alternada');
      } else if (chipId === 'workspace') {
        router.push('/workspace');
      } else if (chipId === 'git_pull') {
        await desktopControlService.runQuickCommand('git pull');
        setActionFeedback('Git Pull enviado!');
      } else if (chipId === 'runner') {
        router.push('/agent');
      } else if (chipId === 'chat') {
        router.push('/charlie');
      }
    } catch {
      setActionFeedback(`Erro: ${label}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTimeout(() => setActionFeedback(null), 2500);
  };

  return (
    <Screen>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={handlePullRefresh}
            tintColor="#818CF8"
          />
        }
      >
        {/* Cabeçalho com Separação Estrita de Status: API vs PC Físico */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>Charlie</Text>
            <View style={styles.headerStatusRow}>
              {/* Badge 1: Servidor API */}
              <View style={styles.headerStatusPill}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: serverConn.isOnline ? '#22C55E' : '#EF4444' },
                  ]}
                />
                <Text style={styles.headerStatusText}>
                  Servidor: {serverConn.isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>

              {/* Badge 2: Computador Físico */}
              <Pressable
                style={styles.headerStatusPill}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPairingModalOpen(true);
                }}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: deviceConn.isPcOnline ? '#22C55E' : '#64748B' },
                  ]}
                />
                <Text style={styles.headerStatusText}>
                  {deviceConn.isPcOnline
                    ? `${deviceConn.pcName} (${serverConn.latencyMs ? `${serverConn.latencyMs}ms` : 'Ativo'})`
                    : `${deviceConn.pcName} (Offline)`}
                </Text>
                <Ionicons name="swap-horizontal" size={11} color="#8791A4" />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.pairButton, pressed && styles.buttonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPairingModalOpen(true);
            }}
          >
            <Ionicons name="qr-code-outline" size={20} color="#818CF8" />
          </Pressable>
        </View>

        {/* Omnibar Primária */}
        <View style={styles.omnibarCard}>
          <Text style={styles.omnibarTitle}>O que você quer fazer?</Text>
          <View style={styles.omnibarActions}>
            <Pressable
              style={({ pressed }) => [
                styles.omnibarButton,
                styles.omnibarButtonPrimary,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => handleAction('/charlie')}
            >
              <Text style={styles.primaryButtonText}>Falar</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.omnibarButton,
                styles.omnibarButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => handleAction('/charlie')}
            >
              <Text style={styles.secondaryButtonText}>Câmera</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.omnibarButton,
                styles.omnibarButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => handleAction('/charlie')}
            >
              <Text style={styles.secondaryButtonText}>Texto</Text>
            </Pressable>
          </View>
        </View>

        {/* Secção Telemetria Real do PC (Zero Mocks) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>TELEMETRIA DO COMPUTADOR</Text>
          <Text style={styles.deviceStatusLabel}>
            {deviceConn.isPcOnline ? 'Sincronizado' : 'Suspenso'}
          </Text>
        </View>

        <View style={styles.activityCard}>
          {/* Item 1: CPU do PC Físico */}
          <View style={styles.activityItem}>
            <View
              style={[
                styles.indicatorDot,
                { backgroundColor: deviceConn.isPcOnline ? '#818CF8' : '#64748B' },
              ]}
            />
            <View style={styles.activityInfo}>
              <Text style={styles.activityItemTitle}>CPU ({deviceConn.pcName})</Text>
              <Text style={styles.activityItemDetail}>
                {deviceConn.isPcOnline
                  ? `${deviceConn.telemetry?.cpu_percent?.toFixed(1) ?? '0.0'}% de carga no processador`
                  : 'Computador desligado ou em suspensão'}
              </Text>
            </View>
            <Text style={styles.percentText}>
              {deviceConn.isPcOnline
                ? `${deviceConn.telemetry?.cpu_percent?.toFixed(0) ?? '0'}%`
                : 'OFF'}
            </Text>
          </View>

          {/* Item 2: Memória RAM Real */}
          <View style={styles.activityItem}>
            <View
              style={[
                styles.indicatorDot,
                { backgroundColor: deviceConn.isPcOnline ? '#22C55E' : '#64748B' },
              ]}
            />
            <View style={styles.activityInfo}>
              <Text style={styles.activityItemTitle}>Memória RAM</Text>
              <Text style={styles.activityItemDetail}>
                {deviceConn.isPcOnline && deviceConn.telemetry
                  ? `${(deviceConn.telemetry.memory_used_mb / 1024).toFixed(1)} GB de ${(deviceConn.telemetry.memory_total_mb / 1024).toFixed(1)} GB em uso`
                  : 'Sem sinal de telemetria'}
              </Text>
            </View>
            <Text style={[styles.percentText, { color: '#22C55E' }]}>
              {deviceConn.isPcOnline && deviceConn.telemetry
                ? `${deviceConn.telemetry.memory_percent.toFixed(0)}%`
                : 'OFF'}
            </Text>
          </View>

          {/* Item 3: Conexão da API */}
          <Pressable style={styles.activityItem} onPress={() => handleAction('/workspace')}>
            <View
              style={[
                styles.indicatorDot,
                { backgroundColor: serverConn.isOnline ? '#22C55E' : '#EF4444' },
              ]}
            />
            <View style={styles.activityInfo}>
              <Text style={styles.activityItemTitle}>Servidor Oficial</Text>
              <Text style={styles.activityItemDetail}>
                {serverConn.isOnline
                  ? `${serverConn.activeServer?.name ?? 'Servidor Charlie'} online${serverConn.latencyMs ? ` (${serverConn.latencyMs}ms)` : ''}`
                  : 'Servidor desconectado'}
              </Text>
            </View>
            <Ionicons
              name={serverConn.isOnline ? 'checkmark' : 'alert-circle'}
              size={16}
              color={serverConn.isOnline ? '#22C55E' : '#EF4444'}
            />
          </Pressable>
        </View>

        {/* Secção Ações Rápidas (Carrossel Dinâmico de Action Chips) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>AÇÕES RÁPIDAS</Text>
          {actionFeedback && (
            <View style={styles.feedbackToast}>
              <Ionicons name="flash" size={11} color="#22C55E" />
              <Text style={styles.feedbackToastText}>{actionFeedback}</Text>
            </View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScrollContent}
        >
          {actionChips.map((chip) => {
            const isPcAction = chip.id === 'lock' || chip.id === 'media' || chip.id === 'git_pull';
            const isDisabled = isPcAction && !deviceConn.isPcOnline;

            return (
              <Pressable
                key={chip.id}
                style={({ pressed }) => [
                  styles.actionChip,
                  isDisabled && styles.actionChipDisabled,
                  pressed && styles.actionChipPressed,
                ]}
                onPress={() => triggerQuickChip(chip.id, chip.label)}
              >
                <View
                  style={[
                    styles.chipIconWrapper,
                    { backgroundColor: isDisabled ? 'rgba(100, 116, 139, 0.15)' : `${chip.color}1F` },
                  ]}
                >
                  <Ionicons
                    name={chip.icon}
                    size={18}
                    color={isDisabled ? '#64748B' : chip.color}
                  />
                </View>
                <View>
                  <Text style={[styles.chipLabel, isDisabled && styles.chipLabelDisabled]}>
                    {chip.label}
                  </Text>
                  <Text style={styles.chipHint}>
                    {isDisabled ? 'PC Suspenso' : chip.hint}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </ScrollView>

      {/* Modal de Pareamento via QR Code ou Entrada Manual */}
      <PairingModal
        visible={pairingModalOpen}
        onClose={() => setPairingModalOpen(false)}
        onPairSuccess={() => {
          refreshServer();
          refreshDevice();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0D0F12',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitleWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerStatusText: {
    color: '#8791A4',
    fontSize: 10,
    fontWeight: '700',
  },
  pairButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  omnibarCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    gap: 14,
  },
  omnibarTitle: {
    color: '#8791A4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  omnibarActions: {
    flexDirection: 'row',
    gap: 10,
  },
  omnibarButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  omnibarButtonPrimary: {
    backgroundColor: '#818CF8',
  },
  omnibarButtonSecondary: {
    backgroundColor: '#212631',
  },
  primaryButtonText: {
    color: '#0D0F12',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButtonText: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  deviceStatusLabel: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '700',
  },
  activityCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 16,
    marginBottom: 22,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityItemTitle: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '700',
  },
  activityItemDetail: {
    color: '#8791A4',
    fontSize: 11,
    marginTop: 2,
  },
  percentText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  feedbackToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  feedbackToastText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '700',
  },
  chipsScrollContent: {
    gap: 10,
    paddingRight: 10,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 135,
  },
  actionChipDisabled: {
    opacity: 0.5,
  },
  actionChipPressed: {
    backgroundColor: '#212631',
    transform: [{ scale: 0.97 }],
  },
  chipIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelDisabled: {
    color: '#8791A4',
  },
  chipHint: {
    color: '#8791A4',
    fontSize: 10,
    marginTop: 1,
  },
});
