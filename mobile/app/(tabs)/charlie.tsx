import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
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
import { desktopControlService } from '@/src/services/desktopControl';
import { threadsService } from '@/src/services/threads';
import { Thread } from '@/src/types/api';

interface QuickActionChip {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  prompt: string;
}

const QUICK_CHIPS: QuickActionChip[] = [
  {
    id: 'pc_status',
    label: 'Status do PC',
    icon: 'speedometer-outline',
    color: '#38BDF8',
    prompt: 'Qual é o status atual do meu computador? Uso de CPU, memória e tarefas ativas?',
  },
  {
    id: 'screenshot',
    label: 'Tirar Print',
    icon: 'camera-outline',
    color: '#818CF8',
    prompt: 'Tire uma captura de tela do computador e me descreva o que está aberto.',
  },
  {
    id: 'lock',
    label: 'Bloquear PC',
    icon: 'lock-closed-outline',
    color: '#EF4444',
    prompt: 'Bloqueie a estação de trabalho do meu computador agora.',
  },
  {
    id: 'media',
    label: 'Pausar Mídia',
    icon: 'play-outline',
    color: '#F59E0B',
    prompt: 'Pause ou retome a mídia em reprodução no computador.',
  },
  {
    id: 'projects',
    label: 'Git Status',
    icon: 'git-branch-outline',
    color: '#22C55E',
    prompt: 'Execute o git status no projeto atual e liste as modificações pendentes.',
  },
  {
    id: 'minimize',
    label: 'Minimizar Tudo',
    icon: 'contract-outline',
    color: '#A855F7',
    prompt: 'Minimize todas as janelas abertas no desktop.',
  },
];

export default function CharlieScreen() {
  const insets = useSafeAreaInsets();
  const serverConn = useServerConnection();
  const deviceConn = useDeviceConnection();

  const [thread, setThread] = useState<Thread | null>(null);
  const [input, setInput] = useState('');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isListening, setIsListening] = useState(false);

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

  // Inicializa sessão de thread real
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
        if (mounted) {
          const now = new Date().toISOString();
          const fallbackThread: Thread = {
            id: `thread-${Date.now()}`,
            name: 'Conversa Principal',
            createdAt: now,
            updatedAt: now,
          };
          setThread(fallbackThread);
          setMessages([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll
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

  const handleSubmit = async (textToSend?: string) => {
    const messageContent = (textToSend || input).trim();
    if (!messageContent || isStreaming) return;

    if (!textToSend) setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await send(messageContent);
  };

  const handleChipPress = async (chip: QuickActionChip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Se for ação direta simples de bloqueio ou mídia, executa localmente se o PC estiver online
    if (chip.id === 'lock') {
      try {
        await desktopControlService.lockPC();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } else if (chip.id === 'media') {
      try {
        await desktopControlService.sendMediaKey('play_pause');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    } else if (chip.id === 'minimize') {
      try {
        await desktopControlService.minimizeAll();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
    }

    // Também envia como prompt conversacional para o Charlie responder com inteligência
    await handleSubmit(chip.prompt);
  };

  const toggleMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsListening((prev) => !prev);
    if (!isListening) {
      // Simula ativação de voz ou prepara gravação
      setTimeout(() => {
        setIsListening(false);
      }, 5000);
    }
  };

  const handleNewThread = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const newThread = await threadsService.create('Nova Conversa');
      setThread(newThread);
      setMessages([]);
    } catch {}
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
        {/* Cabeçalho */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Charlie</Text>
              <View style={styles.modelPill}>
                <Text style={styles.modelPillText}>Gemini 3.1</Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: serverConn.isOnline ? '#22C55E' : '#EF4444' },
                  ]}
                />
                <Text style={styles.statusText}>
                  {serverConn.isOnline ? 'Nuvem Conectada' : 'Offline'}
                </Text>
              </View>

              <View style={styles.statusBadge}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: deviceConn.isPcOnline ? '#22C55E' : '#64748B' },
                  ]}
                />
                <Text style={styles.statusText}>
                  {deviceConn.isPcOnline ? `${deviceConn.pcName} (Ativo)` : `${deviceConn.pcName} (Ausente)`}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.iconButtonPressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setHistoryModalOpen(true);
              }}
            >
              <Ionicons name="time-outline" size={18} color="#F5F7FA" />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.headerIconButton,
                styles.headerNewButton,
                pressed && styles.iconButtonPressed,
              ]}
              onPress={handleNewThread}
            >
              <Ionicons name="add" size={18} color="#818CF8" />
            </Pressable>
          </View>
        </View>

        {/* Feed de Mensagens */}
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
                { paddingBottom: isKeyboardVisible ? 12 : 24 },
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
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="sparkles" size={32} color="#818CF8" />
                    </View>
                    <Text style={styles.emptyTitle}>Como posso te ajudar agora?</Text>
                    <Text style={styles.emptySubtitle}>
                      Tenho controle total sobre o seu computador e acesso à nuvem. Toque em uma sugestão abaixo ou digite um comando.
                    </Text>

                    {/* Grade de Sugestões de Início */}
                    <View style={styles.emptyGrid}>
                      {QUICK_CHIPS.slice(0, 4).map((chip) => (
                        <Pressable
                          key={chip.id}
                          style={styles.emptyCard}
                          onPress={() => handleChipPress(chip)}
                        >
                          <Ionicons name={chip.icon} size={18} color={chip.color} />
                          <Text style={styles.emptyCardText}>{chip.label}</Text>
                        </Pressable>
                      ))}
                    </View>
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

            {/* Botão Flutuante de Auto-Scroll */}
            {showScrollBottomBtn && (
              <Pressable style={styles.floatingScrollBtn} onPress={scrollToBottom}>
                <Ionicons name="arrow-down" size={12} color="#0D0F12" />
                <Text style={styles.floatingScrollText}>Novas mensagens</Text>
              </Pressable>
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Faixa Horizontal de Chips de Ação Rápida */}
        <View style={styles.chipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {QUICK_CHIPS.map((chip) => (
              <Pressable
                key={chip.id}
                style={styles.chip}
                onPress={() => handleChipPress(chip)}
              >
                <Ionicons name={chip.icon} size={14} color={chip.color} />
                <Text style={styles.chipLabel}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Barra de Entrada / Composer Funcional */}
        <View
          style={[
            styles.composerContainer,
            {
              paddingBottom: isKeyboardVisible ? 8 : Math.max(10, insets.bottom),
            },
          ]}
        >
          {/* Botão Microfone / Voz */}
          <Pressable
            style={[styles.composerIconButton, isListening && styles.micActive]}
            onPress={toggleMic}
          >
            <Ionicons
              name={isListening ? 'radio' : 'mic-outline'}
              size={18}
              color={isListening ? '#EF4444' : '#8791A4'}
            />
          </Pressable>

          {/* Campo de Texto */}
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => handleSubmit()}
            editable={!isStreaming}
            placeholder={isListening ? 'Ouvindo...' : 'Fale ou escreva para o Charlie...'}
            placeholderTextColor="#64748B"
            style={[styles.composerInput, { maxHeight: 100 }]}
            multiline
          />

          {/* Botão de Enviar */}
          <Pressable
            style={[
              styles.sendButton,
              (!input.trim() || isStreaming) && styles.sendButtonDisabled,
            ]}
            onPress={() => handleSubmit()}
            disabled={!input.trim() || isStreaming}
          >
            <Ionicons
              name="arrow-up"
              size={18}
              color={input.trim() && !isStreaming ? '#0D0F12' : '#64748B'}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Drawer de Histórico */}
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
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A202C',
  },
  headerLeft: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  modelPill: {
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    borderColor: 'rgba(129, 140, 248, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modelPillText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    color: '#8791A4',
    fontSize: 10,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  emptyContainer: {
    paddingTop: 30,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 12,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  emptyTitle: {
    color: '#F5F7FA',
    fontSize: 18,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: '#8791A4',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    marginTop: 14,
  },
  emptyCard: {
    width: '48%',
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyCardText: {
    color: '#F5F7FA',
    fontSize: 12,
    fontWeight: '700',
  },
  floatingScrollBtn: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: '#818CF8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  floatingScrollText: {
    color: '#0D0F12',
    fontSize: 11,
    fontWeight: '800',
  },
  chipsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#1A202C',
    paddingVertical: 8,
    backgroundColor: '#0D0F12',
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipLabel: {
    color: '#F5F7FA',
    fontSize: 11,
    fontWeight: '700',
  },
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 4,
    backgroundColor: '#0D0F12',
    gap: 8,
  },
  composerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  micActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 16,
    color: '#F5F7FA',
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 13,
    minHeight: 40,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#1E232E',
    borderWidth: 1,
    borderColor: '#212631',
  },
});
