import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { api } from '@/src/services/api';
import { SystemStatus, ToolDefinition } from '@/src/types/api';

interface WorkspaceSectionItem {
  id: string;
  label: string;
  dotColor: string;
  detail: string;
}

export default function WorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [sys, toolList] = await Promise.allSettled([
        api.get<SystemStatus>('/system/status'),
        api.get<{ tools: ToolDefinition[] }>('/tools'),
      ]);

      if (sys.status === 'fulfilled' && sys.value) {
        setStatus(sys.value);
      }
      if (toolList.status === 'fulfilled' && toolList.value?.tools) {
        setTools(toolList.value.tools);
      }
    } catch {
      // Degradação graciosa
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [sys, toolList] = await Promise.allSettled([
          api.get<SystemStatus>('/system/status'),
          api.get<{ tools: ToolDefinition[] }>('/tools'),
        ]);

        if (!mounted) return;
        if (sys.status === 'fulfilled' && sys.value) {
          setStatus(sys.value);
        }
        if (toolList.status === 'fulfilled' && toolList.value?.tools) {
          setTools(toolList.value.tools);
        }
      } catch {
        // Degradação graciosa
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const items: WorkspaceSectionItem[] = [
    {
      id: 'runner',
      label: 'Runner',
      dotColor: '#818CF8',
      detail: '2 em execução',
    },
    {
      id: 'tasks',
      label: 'Tasks',
      dotColor: '#F59E0B',
      detail: '3 aguardando',
    },
    {
      id: 'logs',
      label: 'Logs',
      dotColor: '#22C55E',
      detail: 'ao vivo',
    },
    {
      id: 'servers',
      label: 'Servers',
      dotColor: '#22C55E',
      detail: status ? `${status.connected_devices_count || 1} online` : '1 online',
    },
    {
      id: 'tools',
      label: 'Tools',
      dotColor: '#64748B',
      detail: tools.length > 0 ? `${tools.length} ferramentas` : '12 ferramentas',
    },
    {
      id: 'snippets',
      label: 'Snippets',
      dotColor: '#64748B',
      detail: '8 salvos',
    },
  ];

  const handlePressItem = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Screen>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData();
            }}
            tintColor="#818CF8"
          />
        }
      >
        {/* Cabeçalho */}
        <View style={styles.header}>
          <Text style={styles.title}>Workspace</Text>
          <Text style={styles.subtitle}>Operar e controlar</Text>
        </View>

        {/* Lista de Módulos Operacionais */}
        <View style={styles.listCard}>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.listItem,
                  isLast && styles.listItemLast,
                  pressed && styles.listItemPressed,
                ]}
                onPress={handlePressItem}
              >
                <View style={[styles.dot, { backgroundColor: item.dotColor }]} />
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>{item.label}</Text>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#64748B" />
              </Pressable>
            );
          })}
        </View>

        {/* Secção Live Log */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>LIVE LOG</Text>
        </View>

        {/* Consola de Logs */}
        <View style={styles.terminalCard}>
          <Text style={styles.terminalLine}>{'> GET /api/chat'}</Text>
          <Text style={styles.terminalLine}>{'> stream started'}</Text>
          <Text style={styles.terminalLine}>{'> tool_call'}</Text>
          <Text style={styles.terminalLine}>{'> response completed'}</Text>
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
  listCard: {
    backgroundColor: '#161A22',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E232E',
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  listItemPressed: {
    opacity: 0.7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 14,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '700',
  },
  itemDetail: {
    color: '#8791A4',
    fontSize: 11,
    marginTop: 2,
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
    color: '#22C55E',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
