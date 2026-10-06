import React, { useEffect, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { agentService } from '@/src/services/agent';
import { AgentSession } from '@/src/types/api';

interface MissionStep {
  id: string;
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
  statusLabel: string;
  progressText?: string;
  dotColor: string;
}

const DEFAULT_STEPS: MissionStep[] = [
  {
    id: 'step-1',
    title: 'Analisou projeto',
    status: 'completed',
    statusLabel: 'concluído',
    dotColor: '#22C55E',
  },
  {
    id: 'step-2',
    title: 'Criou build',
    status: 'completed',
    statusLabel: 'concluído',
    dotColor: '#22C55E',
  },
  {
    id: 'step-3',
    title: 'Executando testes',
    status: 'in_progress',
    statusLabel: 'em andamento',
    progressText: '67%',
    dotColor: '#818CF8',
  },
  {
    id: 'step-4',
    title: 'Deploy',
    status: 'pending',
    statusLabel: 'aguardando',
    progressText: '-',
    dotColor: '#64748B',
  },
];

export default function AgentScreen() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const active = await agentService.active();
        if (mounted && active.session) {
          setSession(active.session);
          setIsPaused(active.is_paused);
        }
      } catch {
        // Degradação graciosa mantendo demo UI
      }
    };

    run();
    const interval = setInterval(run, 4000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        run();
      }
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  const handlePauseResume = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isPaused) {
        await agentService.resume();
        setIsPaused(false);
      } else {
        await agentService.pause();
        setIsPaused(true);
      }
    } catch {
      setIsPaused(!isPaused);
    }
  };

  const handleCancel = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await agentService.cancel();
      setSession(null);
    } catch {
      // Degradação graciosa
    }
  };

  // Resolução dinâmica de etapas e progresso baseada na sessão ativa
  const steps: MissionStep[] =
    session?.nodes && session.nodes.length > 0
      ? session.nodes.map((node, index) => {
          const isDone =
            node.status === 'completed' ||
            node.status === 'done' ||
            node.status === 'success';
          const isRunning =
            node.status === 'running' || node.status === 'in_progress';
          return {
            id: node.id || `node-${index}`,
            title: node.title || node.tool || `Etapa ${index + 1}`,
            status: isDone ? 'completed' : isRunning ? 'in_progress' : 'pending',
            statusLabel: isDone ? 'concluído' : isRunning ? 'em andamento' : 'aguardando',
            progressText: isRunning ? '…' : isDone ? '100%' : '-',
            dotColor: isDone ? '#22C55E' : isRunning ? '#818CF8' : '#64748B',
          };
        })
      : DEFAULT_STEPS;

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const progressPercent =
    steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <Screen>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Agent</Text>
          <Text style={styles.subtitle}>Mission Control</Text>
        </View>

        {/* Card Principal da Missão */}
        <View style={styles.missionCard}>
          <Text style={styles.missionTitle}>
            {session?.goal ?? 'Deploy da nova API'}
          </Text>

          {/* Linha do Tempo Visual das Etapas */}
          <View style={styles.stepsList}>
            {steps.map((step) => (
              <View key={step.id} style={styles.stepRow}>
                <View style={[styles.stepDot, { backgroundColor: step.dotColor }]} />
                <View style={styles.stepInfo}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepSubtext}>{step.statusLabel}</Text>
                </View>

                {step.status === 'completed' && (
                  <Ionicons name="checkmark" size={16} color="#22C55E" />
                )}
                {step.status === 'in_progress' && (
                  <Text style={styles.progressValue}>{step.progressText}</Text>
                )}
                {step.status === 'pending' && (
                  <Text style={styles.pendingDash}>-</Text>
                )}
              </View>
            ))}
          </View>

          {/* Barra de Progresso do Runner */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.max(8, progressPercent)}%` },
              ]}
            />
          </View>

          {/* Controlos Operacionais */}
          <View style={styles.controlsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.controlButton,
                pressed && styles.controlButtonPressed,
              ]}
              onPress={handlePauseResume}
            >
              <Text style={styles.controlButtonText}>
                {isPaused ? 'Retomar' : 'Pausar'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.controlButton,
                pressed && styles.controlButtonPressed,
              ]}
              onPress={handleCancel}
            >
              <Text style={styles.controlButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>

        {/* Secção Atividade / Pensamentos do Agente */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ATIVIDADE</Text>
        </View>

        <View style={styles.terminalCard}>
          <Text style={styles.terminalLine}>10:32:04 Analisando package.json</Text>
          <Text style={styles.terminalLine}>10:32:07 Detectado Expo SDK 57</Text>
          <Text style={styles.terminalLine}>10:32:11 Executando typecheck</Text>
          <Text style={styles.terminalLine}>10:32:13 43/43 arquivos verificados</Text>
        </View>
      </ScrollView>
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
    marginBottom: 20,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8791A4',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  missionCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    gap: 16,
  },
  missionTitle: {
    color: '#F5F7FA',
    fontSize: 16,
    fontWeight: '700',
  },
  stepsList: {
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '700',
  },
  stepSubtext: {
    color: '#8791A4',
    fontSize: 11,
    marginTop: 2,
  },
  progressValue: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  pendingDash: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#212631',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#818CF8',
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  controlButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonPressed: {
    backgroundColor: '#2A313E',
    transform: [{ scale: 0.98 }],
  },
  controlButtonText: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  terminalCard: {
    backgroundColor: '#12161D',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  terminalLine: {
    color: '#8791A4',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
