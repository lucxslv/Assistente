import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { threadsService } from '@/src/services/threads';
import { Thread } from '@/src/types/api';

interface ChatHistoryModalProps {
  visible: boolean;
  activeThreadId?: string;
  onClose: () => void;
  onSelectThread: (thread: Thread) => void;
  onNewThread: () => void;
}

interface ThreadGroup {
  title: string;
  data: Thread[];
}

function groupThreadsByDate(threads: Thread[]): ThreadGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  const groups: {
    hoje: Thread[];
    ontem: Thread[];
    estaSemana: Thread[];
    maisAntigas: Thread[];
  } = {
    hoje: [],
    ontem: [],
    estaSemana: [],
    maisAntigas: [],
  };

  threads.forEach((t) => {
    const rawDate = t.updatedAt || t.createdAt;
    const time = rawDate ? new Date(rawDate).getTime() : 0;
    if (time >= todayStart) {
      groups.hoje.push(t);
    } else if (time >= yesterdayStart) {
      groups.ontem.push(t);
    } else if (time >= weekStart) {
      groups.estaSemana.push(t);
    } else {
      groups.maisAntigas.push(t);
    }
  });

  return [
    { title: 'Hoje', data: groups.hoje },
    { title: 'Ontem', data: groups.ontem },
    { title: 'Esta semana', data: groups.estaSemana },
    { title: 'Mais antigas', data: groups.maisAntigas },
  ].filter((g) => g.data.length > 0);
}

export function ChatHistoryModal({
  visible,
  activeThreadId,
  onClose,
  onSelectThread,
  onNewThread,
}: ChatHistoryModalProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (visible) {
      (async () => {
        try {
          const list = await threadsService.list();
          if (mounted) {
            setThreads(list);
          }
        } catch {
          // Degradação graciosa
        } finally {
          if (mounted) {
            setLoading(false);
          }
        }
      })();
    }
    return () => {
      mounted = false;
    };
  }, [visible]);

  const handleCreateNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onNewThread();
    onClose();
  };

  const handleSelect = (thread: Thread) => {
    Haptics.selectionAsync();
    onSelectThread(thread);
    onClose();
  };

  const handleDelete = async (threadId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDeletingId(threadId);
    try {
      await threadsService.remove(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDeletingId(null);
    }
  };

  const grouped = groupThreadsByDate(threads);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Cabeçalho */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Histórico de Conversas</Text>
              <Text style={styles.subtitle}>Sessões e contextos arquivados</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#F5F7FA" />
            </Pressable>
          </View>

          {/* Botão + Nova Conversa */}
          <Pressable style={styles.newThreadButton} onPress={handleCreateNew}>
            <Ionicons name="add" size={20} color="#0D0F12" />
            <Text style={styles.newThreadButtonText}>Nova Conversa</Text>
          </Pressable>

          {/* Lista Agrupada por Data */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="small" color="#818CF8" />
            </View>
          ) : threads.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="chatbubbles-outline" size={36} color="#64748B" />
              <Text style={styles.emptyText}>Nenhuma conversa anterior encontrada.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollList}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {grouped.map((group) => (
                <View key={group.title} style={styles.groupSection}>
                  <Text style={styles.groupHeader}>{group.title.toUpperCase()}</Text>

                  {group.data.map((item) => {
                    const isActive = item.id === activeThreadId;
                    const isDeleting = item.id === deletingId;

                    return (
                      <Pressable
                        key={item.id}
                        style={({ pressed }) => [
                          styles.threadItem,
                          isActive && styles.threadItemActive,
                          pressed && styles.threadItemPressed,
                        ]}
                        onPress={() => handleSelect(item)}
                      >
                        <View style={styles.threadItemIcon}>
                          <Ionicons
                            name={isActive ? 'chatbubble' : 'chatbubble-outline'}
                            size={16}
                            color={isActive ? '#818CF8' : '#8791A4'}
                          />
                        </View>

                        <View style={styles.threadItemContent}>
                          <Text
                            style={[
                              styles.threadTitle,
                              isActive && styles.threadTitleActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.name || 'Conversa sem título'}
                          </Text>
                        </View>

                        <Pressable
                          style={styles.deleteButton}
                          onPress={() => handleDelete(item.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <ActivityIndicator size="small" color="#EF4444" />
                          ) : (
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          )}
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161A22',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#212631',
    maxHeight: '85%',
    minHeight: 460,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#F5F7FA',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#8791A4',
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newThreadButton: {
    height: 44,
    backgroundColor: '#818CF8',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  newThreadButtonText: {
    color: '#0D0F12',
    fontWeight: '800',
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: '#8791A4',
    fontSize: 13,
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    gap: 16,
  },
  groupSection: {
    gap: 6,
  },
  groupHeader: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
    marginLeft: 4,
  },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0F12',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  threadItemActive: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
  },
  threadItemPressed: {
    backgroundColor: '#1E232E',
  },
  threadItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#161A22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadItemContent: {
    flex: 1,
  },
  threadTitle: {
    color: '#F5F7FA',
    fontSize: 13,
    fontWeight: '600',
  },
  threadTitleActive: {
    color: '#818CF8',
    fontWeight: '700',
  },
  deleteButton: {
    padding: 6,
  },
});
