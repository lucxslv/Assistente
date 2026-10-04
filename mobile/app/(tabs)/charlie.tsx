import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { WidgetRegistry } from '@/src/components/widgets/WidgetRegistry';
import { useChat } from '@/src/hooks/useChat';
import { threadsService } from '@/src/services/threads';
import { Thread } from '@/src/types/api';
import { ChatMessage } from '@/src/types/chat';

/** Conversa de demonstração inicial que replica a UI Generativa do design */
const INITIAL_DEMO_MESSAGES: ChatMessage[] = [
  {
    id: 'demo-1',
    role: 'user',
    content: 'Charlie, verifica se a API está saudável.',
    createdAt: new Date().toISOString(),
    status: 'done',
  },
  {
    id: 'demo-2',
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    status: 'done',
    widgets: [
      {
        id: 'widget-server-health-demo',
        type: 'server_health',
        data: {
          title: 'API saudável',
          status: 'healthy',
          cpuPercent: 18,
          ramPercent: 42,
          database: 'healthy',
          webSocket: 'connected',
          sse: 'connected',
          actionLabel: 'Abrir monitor',
        },
      },
    ],
  },
];

export default function CharlieScreen() {
  const insets = useSafeAreaInsets();
  const [thread, setThread] = useState<Thread | null>(null);
  const [input, setInput] = useState('');
  const [writing, setWriting] = useState(false);
  const listRef = useRef<FlatList>(null);

  const {
    messages: liveMessages,
    setMessages,
    send,
    isStreaming,
  } = useChat(thread?.id ?? null);

  // Inicializa mensagens (ou utiliza demonstração rica caso vazio)
  useEffect(() => {
    (async () => {
      try {
        const threads = await threadsService.list();
        const active = threads[0] ?? (await threadsService.create('Conversa mobile'));
        setThread(active);
        const history = await threadsService.messages(active.id);
        if (history && history.length > 0) {
          setMessages(history);
        } else {
          setMessages(INITIAL_DEMO_MESSAGES);
        }
      } catch {
        setMessages(INITIAL_DEMO_MESSAGES);
      }
    })();
  }, [setMessages]);

  const messages = liveMessages.length > 0 ? liveMessages : INITIAL_DEMO_MESSAGES;

  const handleSubmit = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await send(text);
  };

  const handleStartWriting = () => {
    Haptics.selectionAsync();
    setWriting(true);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Charlie</Text>
          <Text style={styles.subtitle}>Conversa · online</Text>
        </View>

        {/* Feed de Conversa com Generative UI */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          contentContainerStyle={[styles.feed, { paddingBottom: 80 + insets.bottom }]}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={[styles.messageWrap, isUser && styles.messageMine]}>
                {item.content ? (
                  <View style={[styles.bubble, isUser ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.messageText, isUser && styles.messageTextMine]}>
                      {item.content}
                    </Text>
                    {item.status === 'streaming' && (
                      <Text style={styles.streamingText}>ao vivo</Text>
                    )}
                  </View>
                ) : null}

                {/* Renderização de Widgets Generativos */}
                {item.role === 'assistant' && item.widgets && (
                  <WidgetRegistry
                    widgets={item.widgets}
                    onOpenMonitor={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/workspace');
                    }}
                  />
                )}
              </View>
            );
          }}
        />

        {/* Bloco de Entrada Primário */}
        {writing ? (
          <View style={[styles.composerContainer, { paddingBottom: Math.max(10, insets.bottom) }]}>
            <TextInput
              autoFocus
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSubmit}
              editable={!isStreaming}
              placeholder="Fale ou escreva para o Charlie..."
              placeholderTextColor="#77809A"
              style={styles.composerInput}
              multiline
            />
            <Pressable
              style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}
              onPress={handleSubmit}
            >
              <Ionicons name="arrow-up" size={18} color="#0D0F12" />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.dockCard, { marginBottom: Math.max(14, insets.bottom) }]}>
            <Text style={styles.dockPrompt}>Fale ou escreva para o Charlie...</Text>
            <View style={styles.dockActions}>
              {/* Botão Falar */}
              <Pressable
                style={({ pressed }) => [
                  styles.dockButton,
                  styles.dockButtonPrimary,
                  pressed && styles.dockButtonPressed,
                ]}
                onPress={handleStartWriting}
              >
                <Text style={styles.dockButtonPrimaryText}>Falar</Text>
              </Pressable>

              {/* Botão Texto */}
              <Pressable
                style={({ pressed }) => [
                  styles.dockButton,
                  styles.dockButtonSecondary,
                  pressed && styles.dockButtonPressed,
                ]}
                onPress={handleStartWriting}
              >
                <Text style={styles.dockButtonSecondaryText}>Texto</Text>
              </Pressable>

              {/* Botão Câmera */}
              <Pressable
                style={({ pressed }) => [
                  styles.dockButton,
                  styles.dockButtonSecondary,
                  pressed && styles.dockButtonPressed,
                ]}
                onPress={handleStartWriting}
              >
                <Text style={styles.dockButtonSecondaryText}>Câmera</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0D0F12',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
  },
  title: {
    color: '#F5F7FA',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  feed: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  messageWrap: {
    maxWidth: '88%',
    alignSelf: 'flex-start',
  },
  messageMine: {
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: '#818CF8',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: '#161A22',
    borderBottomLeftRadius: 4,
    borderColor: '#212631',
    borderWidth: 1,
  },
  messageText: {
    color: '#F5F7FA',
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextMine: {
    color: '#0D0F12',
    fontWeight: '600',
  },
  streamingText: {
    color: '#818CF8',
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
  },
  dockCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    marginHorizontal: 18,
    marginBottom: 14,
    padding: 14,
  },
  dockPrompt: {
    color: '#8791A4',
    fontSize: 13,
    marginBottom: 12,
  },
  dockActions: {
    flexDirection: 'row',
    gap: 10,
  },
  dockButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockButtonPrimary: {
    backgroundColor: '#818CF8',
  },
  dockButtonSecondary: {
    backgroundColor: '#212631',
  },
  dockButtonPrimaryText: {
    color: '#0D0F12',
    fontSize: 13,
    fontWeight: '700',
  },
  dockButtonSecondaryText: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '600',
  },
  dockButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopColor: '#1E232E',
    borderTopWidth: 1,
    backgroundColor: '#0D0F12',
    gap: 10,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#F5F7FA',
    fontSize: 14,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
});
