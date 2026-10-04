import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AssistantWidget } from '@/src/types/chat';
import { ServerHealthWidget } from './ServerHealthWidget';

interface WidgetRegistryProps {
  widgets?: AssistantWidget[];
  onOpenMonitor?: () => void;
}

/**
 * Registry dinâmico para renderizar componentes de Generative UI nativos
 * com base no payload estruturado retornado pelo backend do Charlie.
 */
export function WidgetRegistry({ widgets, onOpenMonitor }: WidgetRegistryProps) {
  if (!widgets || widgets.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {widgets.map((widget) => {
        switch (widget.type) {
          case 'server_health':
            return (
              <ServerHealthWidget
                key={widget.id}
                data={widget.data}
                onOpenMonitor={onOpenMonitor}
              />
            );

          case 'storage_usage':
            return (
              <View key={widget.id} style={styles.storageCard}>
                <Text style={styles.storageTitle}>
                  {widget.data.title ?? 'Armazenamento'}
                </Text>
                <Text style={styles.storageValue}>
                  {widget.data.usedLabel} de {widget.data.totalLabel}
                </Text>
                <View style={styles.storageTrack}>
                  <View
                    style={[
                      styles.storageFill,
                      { width: `${Math.min(100, Math.max(0, widget.data.usedPercent))}%` },
                    ]}
                  />
                </View>
              </View>
            );

          default:
            return (
              <View key={(widget as { id: string }).id} style={styles.fallbackCard}>
                <Text style={styles.fallbackText}>Widget não suportado</Text>
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginTop: 8,
    width: '100%',
  },
  storageCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  storageTitle: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '700',
  },
  storageValue: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 4,
  },
  storageTrack: {
    height: 6,
    backgroundColor: '#212631',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  storageFill: {
    height: '100%',
    backgroundColor: '#818CF8',
    borderRadius: 3,
  },
  fallbackCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  fallbackText: {
    color: '#8791A4',
    fontSize: 12,
  },
});
