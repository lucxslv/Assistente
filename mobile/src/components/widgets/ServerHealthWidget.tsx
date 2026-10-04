import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ServerHealthWidgetData } from '@/src/types/chat';

interface ServerHealthWidgetProps {
  data: ServerHealthWidgetData;
  onOpenMonitor?: () => void;
}

export function ServerHealthWidget({ data, onOpenMonitor }: ServerHealthWidgetProps) {
  const isHealthy =
    data.status === 'healthy' ||
    data.database === 'healthy' ||
    data.database === true;

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenMonitor?.();
  };

  const isPostgresOk = data.database === 'healthy' || data.database === true;
  const isWsOk = data.webSocket === 'connected' || data.webSocket === true;
  const isSseOk = data.sse === undefined || data.sse === 'connected' || data.sse === true;

  return (
    <View style={styles.card}>
      {/* Cabeçalho com indicador de status e título */}
      <View style={styles.header}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isHealthy ? '#22C55E' : '#EF4444' },
          ]}
        />
        <Text style={styles.title}>{data.title ?? 'API saudável'}</Text>
      </View>

      {/* Métricas e Serviços */}
      <View style={styles.metricsContainer}>
        {/* CPU */}
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>CPU</Text>
          <Text style={styles.metricValue}>{Math.round(data.cpuPercent)}%</Text>
        </View>

        {/* RAM */}
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>RAM</Text>
          <Text style={styles.metricValue}>{Math.round(data.ramPercent)}%</Text>
        </View>

        {/* PostgreSQL */}
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>PostgreSQL</Text>
          <Ionicons
            name={isPostgresOk ? 'checkmark' : 'close'}
            size={16}
            color={isPostgresOk ? '#22C55E' : '#EF4444'}
          />
        </View>

        {/* WebSocket */}
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>WebSocket</Text>
          <Ionicons
            name={isWsOk ? 'checkmark' : 'close'}
            size={16}
            color={isWsOk ? '#22C55E' : '#EF4444'}
          />
        </View>

        {/* SSE */}
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>SSE</Text>
          <Ionicons
            name={isSseOk ? 'checkmark' : 'close'}
            size={16}
            color={isSseOk ? '#22C55E' : '#EF4444'}
          />
        </View>
      </View>

      {/* Botão de ação contextual */}
      {onOpenMonitor && (
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={handleAction}
        >
          <Text style={styles.actionButtonText}>
            {data.actionLabel ?? 'Abrir monitor'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    width: '100%',
    minWidth: 260,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 15,
    fontWeight: '700',
  },
  metricsContainer: {
    gap: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: '#8791A4',
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#818CF8',
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  actionButtonText: {
    color: '#0D0F12',
    fontSize: 13,
    fontWeight: '700',
  },
});
