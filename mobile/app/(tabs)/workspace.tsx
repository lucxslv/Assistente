import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/src/components/Screen';
import { DesktopRemotePad } from '@/src/components/DesktopRemotePad';
import { desktopControlService, DeviceStatusResponse } from '@/src/services/desktopControl';
import { api } from '@/src/services/api';
import { SystemStatus, ToolDefinition } from '@/src/types/api';

interface WorkspaceSectionItem {
  id: string;
  label: string;
  dotColor: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

interface TerminalLogEntry {
  id: string;
  type: 'cmd' | 'output' | 'error' | 'info';
  text: string;
  timestamp: string;
}

const QUICK_COMMANDS = ['git status', 'ipconfig', 'dir', 'tasklist', 'whoami'];

export default function WorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Terminal Interativo State
  const [cmdInput, setCmdInput] = useState('');
  const [isExecutingCmd, setIsExecutingCmd] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogEntry[]>([
    {
      id: 'init-1',
      type: 'info',
      text: 'Charlie Windows Shell v2.5 conectado ao host local.',
      timestamp: new Date().toLocaleTimeString(),
    },
    {
      id: 'init-2',
      type: 'info',
      text: 'Digite um comando abaixo ou toque em um atalho para executar no PC.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const terminalScrollRef = useRef<ScrollView>(null);

  // Modais de Módulos Operacionais
  const [toolsModalVisible, setToolsModalVisible] = useState(false);
  const [hardwareModalVisible, setHardwareModalVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [sys, toolList, dev] = await Promise.allSettled([
        api.get<SystemStatus>('/system/status'),
        api.get<{ tools: ToolDefinition[] }>('/tools'),
        desktopControlService.getDeviceStatus(),
      ]);

      if (sys.status === 'fulfilled' && sys.value) {
        setStatus(sys.value);
      }
      if (toolList.status === 'fulfilled' && toolList.value?.tools) {
        setTools(toolList.value.tools);
      }
      if (dev.status === 'fulfilled' && dev.value) {
        setDeviceStatus(dev.value);
      }
    } catch {
      // Degradação graciosa
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sys, toolList, dev] = await Promise.allSettled([
          api.get<SystemStatus>('/system/status'),
          api.get<{ tools: ToolDefinition[] }>('/tools'),
          desktopControlService.getDeviceStatus(),
        ]);

        if (!mounted) return;
        if (sys.status === 'fulfilled' && sys.value) setStatus(sys.value);
        if (toolList.status === 'fulfilled' && toolList.value?.tools) setTools(toolList.value.tools);
        if (dev.status === 'fulfilled' && dev.value) setDeviceStatus(dev.value);
      } catch {}
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleExecuteCommand = async (commandToRun?: string) => {
    const rawCmd = (commandToRun || cmdInput).trim();
    if (!rawCmd || isExecutingCmd) return;

    if (!commandToRun) setCmdInput('');
    setIsExecutingCmd(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const timeStr = new Date().toLocaleTimeString();
    setTerminalLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-cmd`, type: 'cmd', text: `PS C:\\> ${rawCmd}`, timestamp: timeStr },
    ]);

    setTimeout(() => {
      terminalScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);

    try {
      const res = await desktopControlService.runQuickCommand(rawCmd);
      const outText = res.result || res.message || 'Comando concluído com código 0.';
      const isErr = res.status === 'error' || outText.includes('STDERR:') || outText.includes('Erro');

      setTerminalLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-out`,
          type: isErr ? 'error' : 'output',
          text: outText,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      Haptics.notificationAsync(
        isErr ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success
      );
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          type: 'error',
          text: `Erro ao comunicar com o PC: ${err?.message || 'Falha de rede.'}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsExecutingCmd(false);
      setTimeout(() => {
        terminalScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  const handleClearTerminal = () => {
    Haptics.selectionAsync();
    setTerminalLogs([
      {
        id: `clear-${Date.now()}`,
        type: 'info',
        text: 'Console limpo. Charlie pronto para novas instruções.',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const operationalItems: WorkspaceSectionItem[] = [
    {
      id: 'host',
      label: 'Hardware PC',
      icon: 'hardware-chip-outline',
      dotColor: deviceStatus?.is_online ? '#38BDF8' : '#64748B',
      detail: deviceStatus?.telemetry
        ? `CPU ${Math.round(deviceStatus.telemetry.cpu_percent)}% · RAM ${Math.round(
            deviceStatus.telemetry.memory_percent
          )}%`
        : status?.host
        ? `CPU ${Math.round(status.host.cpu_percent)}% · RAM ${Math.round(status.host.memory_percent)}%`
        : 'Ver telemetria detalhada',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setHardwareModalVisible(true);
      },
    },
    {
      id: 'tools',
      label: 'Ferramentas do Sistema',
      icon: 'construct-outline',
      dotColor: '#818CF8',
      detail: tools.length > 0 ? `${tools.length} ferramentas integradas` : '15 ferramentas ativas',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setToolsModalVisible(true);
      },
    },
    {
      id: 'processos',
      label: 'Processos Ativos',
      icon: 'terminal-outline',
      dotColor: '#22C55E',
      detail: 'Listar processos em execução no Windows',
      onPress: () => {
        handleExecuteCommand('Get-Process | Select-Object -First 12 Name, CPU, WorkingSet64');
      },
    },
    {
      id: 'git_sync',
      label: 'Git Sync & Repositório',
      icon: 'git-branch-outline',
      dotColor: '#F59E0B',
      detail: 'Verificar status do git e alterações',
      onPress: () => {
        handleExecuteCommand('git status');
      },
    },
    {
      id: 'network',
      label: 'Rede & Adaptadores',
      icon: 'wifi-outline',
      dotColor: '#38BDF8',
      detail: 'Consultar IP local e adaptadores de rede',
      onPress: () => {
        handleExecuteCommand('ipconfig');
      },
    },
    {
      id: 'runner',
      label: 'Estado da Assistente',
      icon: 'sparkles-outline',
      dotColor: status?.status === 'idle' ? '#22C55E' : '#818CF8',
      detail: status?.status === 'idle' ? 'Charlie em repouso e sincronizado' : 'Processando requisições',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        fetchData();
      },
    },
  ];

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
          <Text style={styles.subtitle}>Centro de controle e operações do PC</Text>
        </View>

        {/* Módulo de Controle Remoto Nativo do Desktop */}
        <DesktopRemotePad />

        {/* Terminal Interativo com Execução Real */}
        <View style={styles.terminalSection}>
          <View style={styles.terminalHeader}>
            <View style={styles.terminalHeaderTitleRow}>
              <Ionicons name="terminal" size={16} color="#22C55E" />
              <Text style={styles.terminalSectionTitle}>TERMINAL POWERSHELL</Text>
            </View>

            <View style={styles.terminalHeaderActions}>
              {isExecutingCmd && (
                <View style={styles.runningBadge}>
                  <ActivityIndicator size="small" color="#22C55E" />
                  <Text style={styles.runningBadgeText}>Executando...</Text>
                </View>
              )}
              <Pressable style={styles.clearBtn} onPress={handleClearTerminal}>
                <Ionicons name="trash-outline" size={14} color="#8791A4" />
                <Text style={styles.clearBtnText}>Limpar</Text>
              </Pressable>
            </View>
          </View>

          {/* Atalhos de Comandos Rápidos */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickCmdsRow}
          >
            {QUICK_COMMANDS.map((cmd) => (
              <Pressable
                key={cmd}
                style={({ pressed }) => [styles.quickCmdPill, pressed && styles.quickCmdPillPressed]}
                onPress={() => handleExecuteCommand(cmd)}
                disabled={isExecutingCmd}
              >
                <Ionicons name="play" size={10} color="#818CF8" />
                <Text style={styles.quickCmdPillText}>{cmd}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Caixa de Texto do Console */}
          <View style={styles.terminalConsole}>
            <ScrollView
              ref={terminalScrollRef}
              style={styles.terminalConsoleScroll}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {terminalLogs.map((log) => {
                let color = '#22C55E';
                if (log.type === 'cmd') color = '#38BDF8';
                if (log.type === 'error') color = '#EF4444';
                if (log.type === 'info') color = '#8791A4';

                return (
                  <View key={log.id} style={styles.logLineWrapper}>
                    <Text style={[styles.terminalText, { color }]}>{log.text}</Text>
                  </View>
                );
              })}
            </ScrollView>

            {/* Input de Comando do Terminal */}
            <View style={styles.cmdInputRow}>
              <Text style={styles.cmdPromptSign}>PS&gt;</Text>
              <TextInput
                value={cmdInput}
                onChangeText={setCmdInput}
                onSubmitEditing={() => handleExecuteCommand()}
                editable={!isExecutingCmd}
                placeholder="Ex: ipconfig, git status, dir..."
                placeholderTextColor="#64748B"
                style={styles.cmdTextInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[
                  styles.cmdSendBtn,
                  (!cmdInput.trim() || isExecutingCmd) && styles.cmdSendBtnDisabled,
                ]}
                onPress={() => handleExecuteCommand()}
                disabled={!cmdInput.trim() || isExecutingCmd}
              >
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={cmdInput.trim() && !isExecutingCmd ? '#0D0F12' : '#64748B'}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Lista de Módulos Operacionais Interativos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MÓDULOS OPERACIONAIS</Text>
        </View>

        <View style={styles.listCard}>
          {operationalItems.map((item, index) => {
            const isLast = index === operationalItems.length - 1;
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.listItem,
                  isLast && styles.listItemLast,
                  pressed && styles.listItemPressed,
                ]}
                onPress={item.onPress}
              >
                <View style={[styles.itemIconCircle, { backgroundColor: 'rgba(129, 140, 248, 0.12)' }]}>
                  <Ionicons name={item.icon} size={18} color="#818CF8" />
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>{item.label}</Text>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#64748B" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Modal: Hardware PC Telemetria */}
      <Modal
        visible={hardwareModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHardwareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="hardware-chip" size={20} color="#38BDF8" />
                <Text style={styles.modalTitle}>Telemetria do Host</Text>
              </View>
              <Pressable onPress={() => setHardwareModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#F5F7FA" />
              </Pressable>
            </View>

            <View style={styles.hardwareGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>CPU</Text>
                <Text style={styles.statVal}>
                  {Math.round(deviceStatus?.telemetry?.cpu_percent ?? status?.host?.cpu_percent ?? 0)}%
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.round(deviceStatus?.telemetry?.cpu_percent ?? status?.host?.cpu_percent ?? 0)
                        )}%`,
                        backgroundColor: '#38BDF8',
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>MEMÓRIA RAM</Text>
                <Text style={styles.statVal}>
                  {Math.round(deviceStatus?.telemetry?.memory_percent ?? status?.host?.memory_percent ?? 0)}%
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.round(deviceStatus?.telemetry?.memory_percent ?? status?.host?.memory_percent ?? 0)
                        )}%`,
                        backgroundColor: '#818CF8',
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>DISPOSITIVO</Text>
                <Text style={styles.statValSmall}>{deviceStatus?.device_name || 'Desktop Windows'}</Text>
                <Text style={styles.statSub}>
                  {deviceStatus?.is_online ? 'Conectado em tempo real' : 'Aguardando sincronização'}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>BATERIA / ENERGIA</Text>
                <Text style={styles.statValSmall}>
                  {deviceStatus?.telemetry?.battery
                    ? `${deviceStatus.telemetry.battery.percent}% (${
                        deviceStatus.telemetry.battery.power_plugged ? 'Carregando' : 'Na bateria'
                      })`
                    : 'Alimentação AC Fixa'}
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.modalActionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                fetchData();
              }}
            >
              <Ionicons name="refresh" size={16} color="#0D0F12" />
              <Text style={styles.modalActionBtnText}>Atualizar Telemetria</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal: Ferramentas Integradas */}
      <Modal
        visible={toolsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setToolsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="construct" size={20} color="#818CF8" />
                <Text style={styles.modalTitle}>Ferramentas Integradas ({tools.length})</Text>
              </View>
              <Pressable onPress={() => setToolsModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#F5F7FA" />
              </Pressable>
            </View>

            <ScrollView style={styles.toolsModalList} showsVerticalScrollIndicator={false}>
              {tools.map((t, i) => {
                const toolName = t.name || (t as any).function?.name || 'Ferramenta';
                const toolDesc = t.description || (t as any).function?.description || 'Executa automação no sistema.';
                return (
                  <View key={toolName || i} style={styles.toolCardItem}>
                    <View style={styles.toolCardHeader}>
                      <Text style={styles.toolCardName}>{toolName}</Text>
                    </View>
                    <Text style={styles.toolCardDesc}>{toolDesc}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  sectionHeader: {
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  terminalSection: {
    backgroundColor: '#12161D',
    borderColor: '#212631',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
    gap: 12,
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  terminalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  terminalSectionTitle: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  terminalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  runningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  runningBadgeText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#1E232E',
  },
  clearBtnText: {
    color: '#8791A4',
    fontSize: 11,
    fontWeight: '600',
  },
  quickCmdsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickCmdPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickCmdPillPressed: {
    opacity: 0.7,
    backgroundColor: '#1E232E',
  },
  quickCmdPillText: {
    color: '#F5F7FA',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  terminalConsole: {
    backgroundColor: '#090B0E',
    borderColor: '#1E232E',
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  terminalConsoleScroll: {
    maxHeight: 180,
    padding: 12,
  },
  logLineWrapper: {
    marginBottom: 6,
  },
  terminalText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  cmdInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161A22',
    borderTopWidth: 1,
    borderTopColor: '#212631',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  cmdPromptSign: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cmdTextInput: {
    flex: 1,
    color: '#F5F7FA',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingVertical: 6,
  },
  cmdSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#818CF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cmdSendBtnDisabled: {
    backgroundColor: '#212631',
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
    gap: 12,
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  listItemPressed: {
    opacity: 0.7,
  },
  itemIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#161A22',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#F5F7FA',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#212631',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hardwareGrid: {
    gap: 12,
  },
  statBox: {
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  statLabel: {
    color: '#8791A4',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statVal: {
    color: '#F5F7FA',
    fontSize: 20,
    fontWeight: '800',
  },
  statValSmall: {
    color: '#F5F7FA',
    fontSize: 14,
    fontWeight: '700',
  },
  statSub: {
    color: '#22C55E',
    fontSize: 11,
  },
  barTrack: {
    height: 6,
    backgroundColor: '#212631',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#818CF8',
    borderRadius: 12,
    paddingVertical: 12,
  },
  modalActionBtnText: {
    color: '#0D0F12',
    fontSize: 13,
    fontWeight: '700',
  },
  toolsModalList: {
    maxHeight: 340,
  },
  toolCardItem: {
    backgroundColor: '#0D0F12',
    borderWidth: 1,
    borderColor: '#212631',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  toolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toolCardName: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  toolCardDesc: {
    color: '#8791A4',
    fontSize: 12,
    lineHeight: 16,
  },
});
