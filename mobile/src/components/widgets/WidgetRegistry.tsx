import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AssistantWidget } from '@/src/types/chat';
import { ServerHealthWidget } from './ServerHealthWidget';

interface WidgetRegistryProps {
  widgets?: AssistantWidget[];
  onOpenMonitor?: () => void;
}

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  fallbackText?: string;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

class WidgetErrorBoundary extends React.Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[WidgetErrorBoundary] Erro ao renderizar widget:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.fallbackCard}>
          <Text style={styles.fallbackTitle}>Visualização interativa indisponível</Text>
          {Boolean(this.props.fallbackText) && (
            <Text style={styles.fallbackContent}>{this.props.fallbackText}</Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
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
        const fallbackText = (widget as { fallbackText?: string }).fallbackText;

        return (
          <WidgetErrorBoundary key={(widget as { id: string }).id} fallbackText={fallbackText}>
            {(() => {
              switch (widget.type) {
                case 'server_health':
                  return (
                    <ServerHealthWidget
                      data={widget.data}
                      onOpenMonitor={onOpenMonitor}
                    />
                  );

                case 'storage_usage':
                  return (
                    <View style={styles.storageCard}>
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

                case 'embedded_widget_unavailable':
                  return (
                    <View style={styles.fallbackCard}>
                      <Text style={styles.fallbackTitle}>Visualização interativa indisponível</Text>
                      <Text style={styles.fallbackContent}>
                        {widget.fallbackText || 'Este conteúdo não pôde ser renderizado interativamente.'}
                      </Text>
                    </View>
                  );

                default:
                  return (
                    <View style={styles.fallbackCard}>
                      <Text style={styles.fallbackTitle}>Componente interativo alternativo</Text>
                      <Text style={styles.fallbackContent}>
                        {fallbackText || 'Widget não suportado nesta versão do aplicativo.'}
                      </Text>
                    </View>
                  );
              }
            })()}
          </WidgetErrorBoundary>
        );
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
  },
  fallbackTitle: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  fallbackContent: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },
  fallbackText: {
    color: '#8791A4',
    fontSize: 12,
  },
});
