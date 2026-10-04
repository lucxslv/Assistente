import React, { useCallback, useEffect, useState } from 'react';
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
import { api } from '@/src/services/api';
import { agentService } from '@/src/services/agent';
import { SystemStatus } from '@/src/types/api';

interface ActivitySummary {
  runnerProcess: string;
  runnerProgress: string;
  isServerOnline: boolean;
  serverLabel: string;
  pendingTasksCount: number;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const serverConn = useServerConnection();
  const [pairingModalOpen, setPairingModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivitySummary>({
    runnerProcess: 'Deploy Charlie API',
    runnerProgress: '62%',
    isServerOnline: true,
    serverLabel: 'API online',
    pendingTasksCount: 3,
  });

  const fetchData = useCallback(async () => {
    try {
      const [sysStatus, agentData] = await Promise.allSettled([
        api.get<SystemStatus>('/system/status'),
        agentService.active(),
      ]);

      if (sysStatus.status === 'fulfilled' && sysStatus.value) {
        setActivity((prev) => ({
          ...prev,
          isServerOnline: sysStatus.value.is_online,
          serverLabel: sysStatus.value.is_online ? 'API online' : 'Servidor indisponível',
          runnerProcess: sysStatus.value.current_process ?? prev.runnerProcess,
        }));
      }

      if (agentData.status === 'fulfilled' && agentData.value?.session) {
        const pending = agentData.value.session.nodes?.filter(
          (n) => n.status !== 'SUCCESS' && n.status !== 'COMPLETED'
        ).length ?? 0;

        setActivity((prev) => ({
          ...prev,
          pendingTasksCount: pending > 0 ? pending : prev.pendingTasksCount,
        }));
      }
    } catch {
      // Degradação graciosa mantendo estados visíveis no Command Center
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      serverConn.refresh();
    }, [fetchData, serverConn])
  );

  useEffect(() => {
    const timer = setInterval(fetchData, 8000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const handleAction = (route: '/charlie' | '/workspace' | '/agent') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route);
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
            onRefresh={() => {
              fetchData();
              serverConn.refresh();
            }}
            tintColor="#818CF8"
          />
        }
      >
        {/* Cabeçalho Contextual com Indicador de Conexão Híbrida */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Charlie</Text>
            <Text style={styles.greeting}>Bom dia, Lucas</Text>
          </View>

          {/* Badge Interativo de Conexão (Abre o Modal de Pareamento) */}
          <Pressable
            style={({ pressed }) => [styles.connectionBadge, pressed && styles.badgePressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPairingModalOpen(true);
            }}
          >
            <View style={[styles.connectionDot, { backgroundColor: serverConn.badgeColor }]} />
            <Text style={styles.connectionText}>{serverConn.badgeText}</Text>
            <Ionicons name="swap-horizontal" size={13} color="#8791A4" />
          </Pressable>
        </View>

        {/* Omnibar Primária */}
        <View style={styles.omnibarCard}>
          <Text style={styles.omnibarTitle}>O que você quer fazer?</Text>
          <View style={styles.omnibarActions}>
            {/* Botão Falar (Principal destacado) */}
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

            {/* Botão Câmera */}
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

            {/* Botão Texto */}
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

        {/* Secção Atividade Recente */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ATIVIDADE</Text>
        </View>

        <View style={styles.activityCard}>
          {/* Item 1: Runner Executando */}
          <Pressable
            style={styles.activityItem}
            onPress={() => handleAction('/agent')}
          >
            <View style={[styles.indicatorDot, { backgroundColor: '#818CF8' }]} />
            <View style={styles.activityInfo}>
              <Text style={styles.activityItemTitle}>Runner executando</Text>
              <Text style={styles.activityItemDetail}>{activity.runnerProcess}</Text>
            </View>
            <Text style={styles.percentText}>{activity.runnerProgress}</Text>
          </Pressable>

          {/* Item 2: Servidor */}
          <Pressable
            style={styles.activityItem}
            onPress={() => handleAction('/workspace')}
          >
            <View
              style={[
                styles.indicatorDot,
                { backgroundColor: serverConn.isOnline ? '#22C55E' : '#EF4444' },
              ]}
            />
            <View style={styles.activityInfo}>
              <Text style={styles.activityItemTitle}>Servidor</Text>
              <Text style={styles.activityItemDetail}>
                {serverConn.isOnline
                  ? `${serverConn.activeServer?.name ?? 'API'} online`
                  : 'Servidor desconectado'}
              </Text>
            </View>
            <Ionicons
              name={serverConn.isOnline ? 'checkmark' : 'alert-circle'}
              size={16}
              color={serverConn.isOnline ? '#22C55E' : '#EF4444'}
            />
          </Pressable>

          {/* Item 3: Charlie Tarefas */}
          <Pressable
            style={styles.activityItem}
            onPress={() => handleAction('/charlie')}
          >
            <View style={[styles.indicatorDot, { backgroundColor: '#F59E0B' }]} />
            <View style={styles.activityInfo}>
              <Text style={styles.activityItemTitle}>Charlie</Text>
              <Text style={styles.activityItemDetail}>
                {activity.pendingTasksCount} tarefas aguardando
              </Text>
            </View>
            <Text style={styles.countText}>{activity.pendingTasksCount}</Text>
          </Pressable>
        </View>

        {/* Secção Ações Rápidas */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AÇÕES RÁPIDAS</Text>
        </View>

        <View style={styles.quickActionsContainer}>
          {/* Linha 1: Backup | Logs | Runner */}
          <View style={styles.quickActionsRow}>
            <Pressable
              style={({ pressed }) => [styles.quickActionPill, pressed && styles.pillPressed]}
              onPress={() => handleAction('/workspace')}
            >
              <Text style={styles.quickActionText}>Backup</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.quickActionPill, pressed && styles.pillPressed]}
              onPress={() => handleAction('/workspace')}
            >
              <Text style={styles.quickActionText}>Logs</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.quickActionPill, pressed && styles.pillPressed]}
              onPress={() => handleAction('/agent')}
            >
              <Text style={styles.quickActionText}>Runner</Text>
            </Pressable>
          </View>

          {/* Linha 2: Conversas | Ferramentas */}
          <View style={styles.quickActionsRow}>
            <Pressable
              style={({ pressed }) => [styles.quickActionPill, pressed && styles.pillPressed]}
              onPress={() => handleAction('/charlie')}
            >
              <Text style={styles.quickActionText}>Conversas</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.quickActionPill, pressed && styles.pillPressed]}
              onPress={() => handleAction('/workspace')}
            >
              <Text style={styles.quickActionText}>Ferramentas</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Modal de Pareamento via QR Code ou Entrada Manual */}
      <PairingModal
        visible={pairingModalOpen}
        onClose={() => setPairingModalOpen(false)}
        onPairSuccess={() => {
          fetchData();
          serverConn.refresh();
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  greeting: {
    color: '#8791A4',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
  },
  badgePressed: {
    opacity: 0.7,
  },
  connectionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  connectionText: {
    color: '#DCE2EF',
    fontSize: 11,
    fontWeight: '700',
  },
  omnibarCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
  },
  omnibarTitle: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 14,
  },
  omnibarActions: {
    flexDirection: 'row',
    gap: 10,
  },
  omnibarButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
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
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  countText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700',
  },
  quickActionsContainer: {
    gap: 10,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionPill: {
    flex: 1,
    height: 42,
    backgroundColor: '#212631',
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pillPressed: {
    backgroundColor: '#282F3D',
    transform: [{ scale: 0.98 }],
  },
  quickActionText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '600',
  },
});
