import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StreamingMessageBubbleProps {
  isThinking: boolean;
  thinkingSeconds: number;
  text: string;
  activeTool?: string | null;
}

export function StreamingMessageBubble({
  isThinking,
  thinkingSeconds,
  text,
  activeTool,
}: StreamingMessageBubbleProps) {
  const [pulseAnim] = useState(() => new Animated.Value(0.4));
  const [cursorVisible, setCursorVisible] = useState(true);

  // Animação de pulso suave durante o pensamento
  useEffect(() => {
    if (!isThinking) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isThinking, pulseAnim]);

  // Cursor piscante durante emissão de texto
  useEffect(() => {
    if (isThinking || !text) return;
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 450);
    return () => clearInterval(interval);
  }, [isThinking, text]);

  // Se não estiver pensando e não houver texto emitido, não renderiza nada
  if (!isThinking && !text && !activeTool) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Indicador de Raciocínio (Skeleton / Onda de Pulso) */}
      {isThinking && (
        <Animated.View style={[styles.thinkingCard, { opacity: pulseAnim }]}>
          <View style={styles.thinkingIconBg}>
            <ActivityIndicator size="small" color="#818CF8" />
          </View>
          <View style={styles.thinkingInfo}>
            <Text style={styles.thinkingTitle}>Charlie raciocinando...</Text>
            <Text style={styles.thinkingTimer}>
              Tempo de resposta: {thinkingSeconds.toFixed(1)}s
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Indicador de Ferramenta em Execução */}
      {Boolean(activeTool) && (
        <View style={styles.toolCard}>
          <Ionicons name="construct-outline" size={14} color="#F59E0B" />
          <Text style={styles.toolText}>Executando ferramenta: {activeTool}</Text>
        </View>
      )}

      {/* Balão de Texto em Streaming Throttled */}
      {Boolean(text) && (
        <View style={styles.bubble}>
          <Text style={styles.streamText}>
            {text}
            {cursorVisible && <Text style={styles.cursor}> ▌</Text>}
          </Text>

          <View style={styles.liveBadgeRow}>
            <View style={styles.neonDot} />
            <Text style={styles.liveBadgeText}>gerando em tempo real</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: '90%',
    alignSelf: 'flex-start',
    marginVertical: 6,
    gap: 8,
  },
  thinkingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  thinkingIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thinkingInfo: {
    flex: 1,
  },
  thinkingTitle: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '700',
  },
  thinkingTimer: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  toolText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  bubble: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  streamText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#F5F7FA',
  },
  cursor: {
    color: '#818CF8',
    fontWeight: '900',
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveBadgeText: {
    color: '#8791A4',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
