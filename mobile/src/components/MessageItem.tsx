import React, { useState } from 'react';
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { WidgetRegistry } from '@/src/components/widgets/WidgetRegistry';
import { ChatMessage } from '@/src/types/api';

interface MessageItemProps {
  message: ChatMessage;
  onOpenMonitor?: () => void;
  onResend?: (content: string) => void;
}

function extractCodeBlock(content: string): string | null {
  const match = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function MessageItemComponent({ message, onOpenMonitor, onResend }: MessageItemProps) {
  const [copiedNotice, setCopiedNotice] = useState(false);
  const isUser = message.role === 'user';
  const codeBlock = extractCodeBlock(message.content);

  const handleCopy = async (customText?: string) => {
    try {
      const textToCopy = customText ?? message.content;
      await Clipboard.setStringAsync(textToCopy);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    } catch {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: message.content,
      });
    } catch {
      // Ignora cancelamento
    }
  };

  const handleResend = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onResend?.(message.content);
  };

  return (
    <View style={[styles.wrap, isUser ? styles.wrapUser : styles.wrapAssistant]}>
      {/* Balão de Mensagem */}
      {Boolean(message.content) && (
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
            {message.content}
          </Text>

          {/* Menus Contextuais Táteis para Mensagens do Assistente */}
          {!isUser && (
            <View style={styles.actionsBar}>
              <Pressable
                testID="copy-message-button"
                style={styles.actionBtn}
                onPress={() => handleCopy()}
              >
                <Ionicons
                  name={copiedNotice ? 'checkmark' : 'copy-outline'}
                  size={13}
                  color={copiedNotice ? '#22C55E' : '#8791A4'}
                />
                <Text style={[styles.actionBtnText, copiedNotice && styles.actionBtnTextSuccess]}>
                  {copiedNotice ? 'Copiado!' : 'Copiar'}
                </Text>
              </Pressable>

              {Boolean(codeBlock) && (
                <Pressable
                  testID="copy-code-button"
                  style={styles.actionBtn}
                  onPress={() => handleCopy(codeBlock!)}
                >
                  <Ionicons name="code-slash" size={13} color="#818CF8" />
                  <Text style={[styles.actionBtnText, { color: '#818CF8' }]}>Código</Text>
                </Pressable>
              )}

              <Pressable style={styles.actionBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={13} color="#8791A4" />
                <Text style={styles.actionBtnText}>Compartilhar</Text>
              </Pressable>

              {onResend && (
                <Pressable style={styles.actionBtn} onPress={handleResend}>
                  <Ionicons name="refresh-outline" size={13} color="#8791A4" />
                  <Text style={styles.actionBtnText}>Reenviar</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {/* Renderização de Widgets Generativos do Assistente */}
      {!isUser && message.widgets && (
        <WidgetRegistry widgets={message.widgets} onOpenMonitor={onOpenMonitor} />
      )}
    </View>
  );
}

/**
 * React.memo customizado para garantir que mensagens já renderizadas NUNCA
 * re-renderizem durante a emissão de novos tokens da resposta corrente.
 */
export const MessageItem = React.memo(
  MessageItemComponent,
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.message.widgets?.length === next.message.widgets?.length
);

const styles = StyleSheet.create({
  wrap: {
    maxWidth: '88%',
    marginVertical: 4,
  },
  wrapUser: {
    alignSelf: 'flex-end',
  },
  wrapAssistant: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: '#818CF8',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: '#0D0F12',
    fontWeight: '600',
  },
  textAssistant: {
    color: '#F5F7FA',
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#212631',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  actionBtnText: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnTextSuccess: {
    color: '#22C55E',
  },
});
