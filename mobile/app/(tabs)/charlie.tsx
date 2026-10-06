import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { ChatHistoryModal } from '@/src/components/ChatHistoryModal';
import { MessageItem } from '@/src/components/MessageItem';
import { StreamingMessageBubble } from '@/src/components/StreamingMessageBubble';
import { useChatStream } from '@/src/hooks/useChatStream';
import { useServerConnection } from '@/src/hooks/useServerConnection';
import { useDeviceConnection } from '@/src/hooks/useDeviceConnection';
import { threadsService } from '@/src/services/threads';
import { Thread } from '@/src/types/api';

export default function CharlieScreen() {
  const insets = useSafeAreaInsets();
  const serverConn = useServerConnection();
  const deviceConn = useDeviceConnection();

  const [thread, setThread] = useState<Thread | null>(null);
  const [input, setInput] = useState('');
  const [writing, setWriting] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Controle inteligente de auto-scroll
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const listRef = useRef<FlatList>(null);

  const {
    messages,
    setMessages,
    send,
    isStreaming,
    isThinking,
    thinkingSeconds,
    streamingText,
    activeTool,
  } = useChatStream(thread?.id ?? null);

  // Monitora teclado para dimensionamento dinâmico sem sobreposição
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Inicializa sessão de thread real (zero mocks)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const threads = await threadsService.list();
        if (!mounted) return;
        const active = threads[0] ?? (await threadsService.create('Conversa Principal'));
        setThread(active);
        const history = await threadsService.messages(active.id);
        if (!mounted) return;
        setMessages(history || []);
      } catch {
        if (mounted) setMessages([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll não bloqueante: só rola se o usuário já estiver colado no fim
  useEffect(() => {
    if (isStreaming && isAtBottom) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [streamingText, isStreaming, isAtBottom]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 60;
    const atBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    setIsAtBottom(atBottom);
    setShowScrollBottomBtn(!atBottom && isStreaming);
  };

  const scrollToBottom = () => {
    Haptics.selectionAsync();
    listRef.current?.scrollToEnd({ animated: true });
    setIsAtBottom(true);
    setShowScrollBottomBtn(false);
  };

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

  const handleNewThread = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const newThread = await threadsService.create('Nova Conversa');
      setThread(newThread);
      setMessages([]);
    } catch {
      // Degradação graciosa
    }
  };

  const handleSelectThread = async (selected: Thread) => {
    Haptics.selectionAsync();
    setThread(selected);
    try {
      const history = await threadsService.messages(selected.id);
      setMessages(history || []);
    } catch {
      setMessages([]);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* Cabeçalho com Status Desacoplado: Servidor API vs PC Físico */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Charlie</Text>
            <View style={styles.statusRow}>
              {/* Status da API */}
              <View style={styles.statusBadge}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: serverConn.isOnline ? '#22C55E' : '#EF4444' },
                  ]}
                />
                <Text style={styles.statusText}>
                  Servidor: {serverConn.isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>

              {/* Status do Computador Físico */}
              <View style={styles.statusBadge}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: deviceConn.isPcOnline ? '#22C55E' : '#64748B' },
                  ]}
                />
                <Text style={styles.statusText}>
                  {deviceConn.isPcOnline
                    ? `${deviceConn.pcName} (${serverConn.latencyMs ? `${serverConn.latencyMs}ms` : 'Online'})`
                    : `${deviceConn.pcName} (Offline)`}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            {/* Botão de Histórico de Conversas */}
            <Pressable
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.iconButtonPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setHistoryModalOpen(true);
              }}
            >
              <Ionicons name="time-outline" size={20} color="#F5F7FA" />
            </Pressable>

            {/* Botão Nova Conversa */}
            <Pressable
              style={({ pressed }) => [
                styles.headerIconButton,
                styles.headerNewButton,
                pressed && styles.iconButtonPressed,
              ]}
              onPress={handleNewThread}
            >
              <Ionicons name="add" size={20} color="#818CF8" />
            </Pressable>
          </View>
        </View>

        {/* Feed de Mensagens com Toque para Fechar Teclado */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.feedWrapper}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              onScroll={handleScroll}
              scrollEventThrottle={32}
              contentContainerStyle={[
                styles.feed,
                { paddingBottom: isKeyboardVisible ? 20 : 80 + insets.bottom },
              ]}
              renderItem={({ item }) => (
                <MessageItem
                  message={item}
                  onOpenMonitor={() => router.push('/workspace')}
                  onResend={(content) => send(content)}
                />
              )}
              ListEmptyComponent={
                !isStreaming ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="chatbubbles-outline" size={42} color="#334155" />
                    <Text style={styles.emptyTitle}>Inicie uma conversa com o Charlie</Text>
                    <Text style={styles.emptySubtitle}>
                      Pergunte sobre código, monitore seu computador ou dê ordens de automação.
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                <StreamingMessageBubble
                  isThinking={isThinking}
                  thinkingSeconds={thinkingSeconds}
                  text={streamingText}
                  activeTool={activeTool}
                />
              }
            />

            {/* Botão Flutuante de Auto-Scroll ao Final */}
            {showScrollBottomBtn && (
              <Pressable style={styles.floatingScrollBtn} onPress={scrollToBottom}>
                <Ionicons name="arrow-down" size={13} color="#0D0F12" />
                <Text style={styles.floatingScrollText}>Novas mensagens</Text>
              </Pressable>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Bloco de Entrada Primário */}
        {writing ? (
          <View
            style={[
              styles.composerContainer,
              {
                paddingBottom: isKeyboardVisible ? 8 : Math.max(12, insets.bottom),
              },
            ]}
          >
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
          <View
            style={[
              styles.dockCard,
              {
                marginBottom: isKeyboardVisible ? 8 : Math.max(14, insets.bottom),
              },
            ]}
          >
            <Text style={styles.dockPrompt}>Fale ou escreva para o Charlie...</Text>
            <View style={styles.dockActions}>
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

      {/* Drawer / Modal de Histórico de Conversas */}
      <ChatHistoryModal
        visible={historyModalOpen}
        activeThreadId={thread?.id}
        onClose={() => setHistoryModalOpen(false)}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0D0F12',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: '#8791A4',
    fontSize: 10,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNewButton: {
    borderColor: 'rgba(129, 140, 248, 0.3)',
    backgroundColor: 'rgba(129, 140, 248, 0.1)',
  },
  iconButtonPressed: {
    opacity: 0.7,
  },
  feedWrapper: {
    flex: 1,
    position: 'relative',
  },
  feed: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    color: '#F5F7FA',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  floatingScrollBtn: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#818CF8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingScrollText: {
    color: '#0D0F12',
    fontSize: 12,
    fontWeight: '700',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#161A22',
    borderTopWidth: 1,
    borderTopColor: '#212631',
    gap: 10,
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: '#0D0F12',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F5F7FA',
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  dockCard: {
    marginHorizontal: 16,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  dockPrompt: {
    color: '#8791A4',
    fontSize: 13,
    paddingHorizontal: 4,
  },
  dockActions: {
    flexDirection: 'row',
    gap: 10,
  },
  dockButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockButtonPrimary: {
    backgroundColor: '#818CF8',
  },
  dockButtonSecondary: {
    backgroundColor: '#212631',
  },
  dockButtonPressed: {
    opacity: 0.8,
  },
  dockButtonPrimaryText: {
    color: '#0D0F12',
    fontWeight: '700',
    fontSize: 13,
  },
  dockButtonSecondaryText: {
    color: '#F5F7FA',
    fontWeight: '600',
    fontSize: 13,
  },
});
