import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  RefreshCw,
  Search,
  DollarSign,
  Cpu,
  Users,
  MessageSquare,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Layers,
  Terminal,
  Activity,
  AlertCircle,
  FileSpreadsheet,
  FileJson,
  User as UserIcon,
  Bot,
  Calendar,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { AuditService } from '../../services/auditService';
import {
  AuditMetrics,
  AuditLog,
  AuditUserSummary,
  UserConversationsResponse,
  UserConversationSession,
} from '../../types/audit';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';

interface AuditDashboardProps {
  onBackToChat: () => void;
}

export const AuditDashboard: React.FC<AuditDashboardProps> = ({ onBackToChat }) => {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState<'users' | 'raw_logs'>('users');

  // Metrics State
  const [metrics, setMetrics] = useState<AuditMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);

  // Per-User Directory State
  const [usersList, setUsersList] = useState<AuditUserSummary[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [selectedUserData, setSelectedUserData] = useState<UserConversationsResponse | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(false);

  // Raw Logs State
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [rawSearchQuery, setRawSearchQuery] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Global Actions State
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 1. Fetch Metrics
  const loadMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const data = await AuditService.getMetrics();
      setMetrics(data);
    } catch (err: unknown) {
      console.error('Falha ao carregar métricas:', err);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, []);

  // 2. Fetch Users Directory
  const loadUsersDirectory = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const list = await AuditService.getUsers();
      setUsersList(list || []);
      // Auto-seleciona o primeiro usuário se nenhum selecionado
      if (!selectedUserEmail && list && list.length > 0) {
        setSelectedUserEmail(list[0].user_email);
      }
    } catch (err: unknown) {
      console.error('Falha ao listar usuários:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [selectedUserEmail]);

  // 3. Fetch Selected User Conversations
  const loadUserConversations = useCallback(async (email: string) => {
    setIsLoadingConversations(true);
    try {
      const data = await AuditService.getUserConversations(email);
      setSelectedUserData(data);
    } catch (err: unknown) {
      console.error(`Falha ao carregar conversas do usuário ${email}:`, err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  // 4. Fetch Raw Logs
  const loadLogs = useCallback(
    async (currentPage = page) => {
      setIsLoadingLogs(true);
      setError(null);
      try {
        const data = await AuditService.getLogs({
          page: currentPage,
          limit: 25,
          search: rawSearchQuery.trim() || undefined,
          modelName: selectedModel || undefined,
        });
        setLogs(data.logs || []);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || data.total_pages || 1);
        setTotalLogs(data.total || 0);
      } catch (err: unknown) {
        console.error('Falha ao carregar logs:', err);
        setError('Não foi possível carregar os registros.');
      } finally {
        setIsLoadingLogs(false);
      }
    },
    [page, rawSearchQuery, selectedModel]
  );

  // Initial Load
  useEffect(() => {
    loadMetrics();
    loadUsersDirectory();
  }, [loadMetrics, loadUsersDirectory]);

  // When selected user changes, fetch their conversations
  useEffect(() => {
    if (selectedUserEmail) {
      loadUserConversations(selectedUserEmail);
    }
  }, [selectedUserEmail, loadUserConversations]);

  // Trigger raw logs if tab switches
  useEffect(() => {
    if (activeTab === 'raw_logs' && logs.length === 0) {
      loadLogs(1);
    }
  }, [activeTab, logs.length, loadLogs]);

  const handleExport = async (format: 'csv' | 'json', targetEmail?: string) => {
    setIsExporting(true);
    try {
      await AuditService.exportLogs(format, targetEmail);
    } catch (err: unknown) {
      console.error('Erro na exportação:', err);
      alert('Falha ao exportar registros de auditoria.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatUSD = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return '$0.000000';
    return `$${val.toFixed(6)}`;
  };

  const formatTokens = (val: number | undefined) => {
    if (!val) return '0';
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
    return val.toLocaleString();
  };

  const formatDate = (isoString: string | null | undefined) => {
    if (!isoString) return 'Data indisp.';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatTimeOnly = (isoString: string | null | undefined) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  // Filtered users list
  const filteredUsers = usersList.filter((u) =>
    u.user_email.toLowerCase().includes(userSearchQuery.toLowerCase().trim())
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#0A0B0E] text-[#F3F4F6] overflow-y-auto font-sans select-none">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-white/[0.06] bg-[#0E0F12]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-[#E5E7EB] hover:text-white transition-colors cursor-pointer"
            title="Voltar para a conversa"
          >
            <ArrowLeft className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Voltar ao Chat</span>
          </button>

          <div className="h-5 w-[1px] bg-white/[0.08] hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-black border border-white/[0.08] flex items-center justify-center overflow-hidden p-1 flex-shrink-0 shadow-sm">
              <img src="/logo.png" alt="Charlie" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[#F3F4F6] flex items-center gap-2">
                Vault de Auditoria & Custos
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-normal">
                  Stealth Mode
                </span>
              </h1>
              <p className="text-[11px] text-[#9CA3AF] hidden md:block">
                Controle confidencial de conversas, consumo de tokens e custos em USD
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadMetrics();
              loadUsersDirectory();
              if (selectedUserEmail) loadUserConversations(selectedUserEmail);
              if (activeTab === 'raw_logs') loadLogs(page);
            }}
            disabled={isLoadingMetrics || isLoadingUsers || isLoadingConversations}
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.08] text-xs text-[#E5E7EB] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Atualizar dados do vault"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#9CA3AF] ${
                isLoadingMetrics || isLoadingUsers || isLoadingConversations ? 'animate-spin' : ''
              }`}
            />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs font-medium text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Exportar todos os registros em CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV Geral</span>
            </button>

            <button
              onClick={() => handleExport('json')}
              disabled={isExporting}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-xs font-medium text-primary transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Exportar todos os registros em JSON"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Gasto Total USD */}
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">Custo Total (USD)</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400 tracking-tight">
              {formatUSD(metrics?.total_cost_usd)}
            </div>
            <div className="mt-2 text-[11px] text-[#9CA3AF] flex items-center justify-between">
              <span>Precificado por 1M tokens</span>
              <span className="font-mono text-emerald-400/80">6 casas decimais</span>
            </div>
          </div>

          {/* Card 2: Total de Requisições */}
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 relative overflow-hidden group hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">Total de Interações</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-[#F3F4F6] tracking-tight">
              {metrics ? metrics.total_requests.toLocaleString() : '0'}
            </div>
            <div className="mt-2 text-[11px] text-[#9CA3AF] flex items-center justify-between">
              <span>Zero latência adicional</span>
              <span className="text-primary font-mono">100% async</span>
            </div>
          </div>

          {/* Card 3: Total Tokens */}
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">Tokens Processados</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Cpu className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-blue-400 tracking-tight">
              {formatTokens(metrics?.total_tokens)}
            </div>
            <div className="mt-2 text-[11px] text-[#9CA3AF] flex items-center justify-between">
              <span>Prompt: {formatTokens(metrics?.total_prompt_tokens)}</span>
              <span>Resp: {formatTokens(metrics?.total_completion_tokens)}</span>
            </div>
          </div>

          {/* Card 4: Usuários Testadores */}
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">Amigos / Testadores</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-amber-400 tracking-tight">
              {metrics ? (metrics.unique_users_count ?? metrics.unique_users ?? 0) : '0'}
            </div>
            <div className="mt-2 text-[11px] text-[#9CA3AF] flex items-center justify-between">
              <span>Contas ativas auditadas</span>
              <span className="text-amber-400/80 font-mono">Supabase Auth</span>
            </div>
          </div>
        </div>

        {/* View Mode Toggle: [Conversas por Amigo] vs [Logs Brutos] */}
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#111317] border border-white/[0.08]">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.04]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Conversas por Amigo / Usuário</span>
            </button>

            <button
              onClick={() => setActiveTab('raw_logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'raw_logs'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.04]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Logs Brutos do Sistema</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-[#9CA3AF]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Auditoria contínua ativa</span>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: MASTER-DETAIL VIEW (CONVERSAS POR AMIGO / USUÁRIO) */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Pane: AMIGOS / USUÁRIOS (Directory) */}
            <div className="lg:col-span-4 bg-[#111317] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col max-h-[750px] sticky top-20">
              {/* Directory Header */}
              <div className="p-3.5 border-b border-white/[0.06] bg-[#14171E]/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#D1D5DB] tracking-wide uppercase flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span>Amigos / Usuários</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] text-[#9CA3AF]">
                      {usersList.length}
                    </span>
                  </h3>
                </div>

                {/* Filter Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type="text"
                    placeholder="Filtrar por e-mail..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#0E0F12] border border-white/[0.08] rounded-lg text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Users List */}
              <div className="overflow-y-auto divide-y divide-white/[0.04] p-1.5">
                {isLoadingUsers ? (
                  <div className="py-12 text-center text-xs text-[#9CA3AF] flex flex-col items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                    <span>Carregando amigos testadores...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#9CA3AF]">
                    Nenhum amigo encontrado.
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUserEmail === user.user_email;
                    return (
                      <div
                        key={user.user_email}
                        onClick={() => setSelectedUserEmail(user.user_email)}
                        className={`p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 border border-primary/40 shadow-sm'
                            : 'hover:bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-semibold truncate ${
                              isSelected ? 'text-primary' : 'text-[#F3F4F6]'
                            }`}
                          >
                            {isSelected ? '> ' : ''}
                            {user.user_email}
                          </span>
                          <span className="text-[10px] font-mono text-[#9CA3AF]">
                            {formatDate(user.last_active)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                          <span className="font-mono">
                            • {user.total_sessions} {user.total_sessions === 1 ? 'sessão' : 'sessões'} |{' '}
                            <strong className="text-emerald-400 font-semibold">{formatUSD(user.total_cost_usd)}</strong> total
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-[#D1D5DB] font-mono">
                            {user.total_messages} msgs
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: CONVERSAS DO USUÁRIO SELECIONADO */}
            <div className="lg:col-span-8 bg-[#111317] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col min-h-[500px]">
              {/* Header of Selected User */}
              <div className="p-4 border-b border-white/[0.06] bg-[#14171E]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wider block">
                    Conversas do Usuário Selecionado
                  </span>
                  <h2 className="text-sm font-bold text-[#F3F4F6] truncate flex items-center gap-2">
                    <span className="text-primary">{selectedUserEmail || 'Nenhum usuário selecionado'}</span>
                    {selectedUserData && (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {formatUSD(selectedUserData.total_cost_usd)} acumulado
                      </span>
                    )}
                  </h2>
                </div>

                {selectedUserEmail && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleExport('csv', selectedUserEmail)}
                      disabled={isExporting}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-[#E5E7EB] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      title="Exportar conversas deste amigo em CSV"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Exportar CSV</span>
                    </button>

                    <button
                      onClick={() => loadUserConversations(selectedUserEmail)}
                      disabled={isLoadingConversations}
                      className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
                      title="Recarregar conversas deste usuário"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isLoadingConversations ? 'animate-spin text-primary' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Sessions Dialogue Flow */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-6 flex-1">
                {isLoadingConversations ? (
                  <div className="py-24 text-center text-xs text-[#9CA3AF] flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                    <span>Recuperando histórico de conversas...</span>
                  </div>
                ) : !selectedUserData || selectedUserData.sessions.length === 0 ? (
                  <div className="py-16 text-center text-xs text-[#9CA3AF] border border-dashed border-white/[0.08] rounded-xl p-8">
                    Nenhuma conversa registrada para este usuário ainda.
                  </div>
                ) : (
                  selectedUserData.sessions.map((session, sIdx) => (
                    <div
                      key={session.session_id || sIdx}
                      className="border border-white/[0.08] rounded-xl bg-[#0E0F12]/80 overflow-hidden shadow-sm"
                    >
                      {/* Session Header Card */}
                      <div className="px-4 py-2.5 bg-[#14171E] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          <span className="font-semibold text-[#F3F4F6]">
                            [Sessão: {formatDate(session.started_at)}]
                          </span>
                          <span className="text-[#9CA3AF]">•</span>
                          <span className="text-[#9CA3AF] font-mono">
                            {session.message_count} {session.message_count === 1 ? 'msg' : 'msgs'}
                          </span>
                          <span className="text-[#9CA3AF]">•</span>
                          <span className="text-emerald-400 font-mono font-semibold">
                            Custo: {formatUSD(session.total_cost_usd)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {session.model_names.map((m, mIdx) => (
                            <span
                              key={mIdx}
                              className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-[#9CA3AF]"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Chat Bubbles / Dialogues */}
                      <div className="p-4 space-y-4">
                        {session.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className="rounded-xl border border-white/[0.06] bg-[#111317] overflow-hidden space-y-2 p-3 text-xs"
                          >
                            {/* 👤 Amigo Prompt */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                                <span className="font-bold text-[#F3F4F6] flex items-center gap-1.5">
                                  <UserIcon className="w-3.5 h-3.5 text-blue-400" />
                                  <span>👤 Amigo:</span>
                                </span>
                                <div className="flex items-center gap-2 font-mono text-[10px]">
                                  <span>{formatTimeOnly(msg.created_at)}</span>
                                  <span>•</span>
                                  <span>{msg.prompt_tokens} tokens</span>
                                  <button
                                    onClick={() => handleCopyText(msg.user_prompt, `p_${msg.id}`)}
                                    className="p-1 rounded hover:bg-white/[0.06] text-[#9CA3AF] hover:text-white cursor-pointer"
                                    title="Copiar prompt"
                                  >
                                    {copiedId === `p_${msg.id}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg bg-[#0E0F12] border border-white/[0.04] text-[#E5E7EB] font-sans whitespace-pre-wrap select-text leading-relaxed">
                                {msg.user_prompt}
                              </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-white/[0.04] my-2" />

                            {/* 🤖 Charlie Response */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                                <span className="font-bold text-primary flex items-center gap-1.5">
                                  <div className="w-4 h-4 rounded bg-black border border-white/[0.1] flex items-center justify-center overflow-hidden p-0.5 flex-shrink-0">
                                    <img src="/logo.png" alt="Charlie" className="w-full h-full object-contain" />
                                  </div>
                                  <span>Charlie:</span>
                                </span>
                                <div className="flex items-center gap-2 font-mono text-[10px]">
                                  <span className="text-emerald-400 font-semibold">{formatUSD(msg.cost_usd)}</span>
                                  <span>•</span>
                                  <span>{msg.completion_tokens} tokens</span>
                                  <button
                                    onClick={() => handleCopyText(msg.model_response, `r_${msg.id}`)}
                                    className="p-1 rounded hover:bg-white/[0.06] text-[#9CA3AF] hover:text-white cursor-pointer"
                                    title="Copiar resposta"
                                  >
                                    {copiedId === `r_${msg.id}` ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.04] text-[#D1D5DB] font-sans whitespace-pre-wrap select-text leading-relaxed">
                                {msg.model_response}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RAW LOGS TABLE (VISÃO GERAL DETALHADA) */}
        {activeTab === 'raw_logs' && (
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#F3F4F6] flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" />
                  Registros de Auditoria Imutáveis
                  <span className="text-xs font-mono text-[#9CA3AF] font-normal">({totalLogs} no total)</span>
                </h2>
                <p className="text-[11px] text-[#9CA3AF]">
                  Inspeção detalhada de cada interação registrada no Supabase
                </p>
              </div>

              {/* Filters */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  loadLogs(1);
                }}
                className="flex flex-wrap items-center gap-2 w-full md:w-auto"
              >
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type="text"
                    placeholder="Buscar texto ou email..."
                    value={rawSearchQuery}
                    onChange={(e) => setRawSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0E0F12] border border-white/[0.08] rounded-lg text-[#F3F4F6] placeholder-[#6B7280] focus:outline-none focus:border-primary/50"
                  />
                </div>

                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    setPage(1);
                  }}
                  className="py-1.5 px-2.5 text-xs bg-[#0E0F12] border border-white/[0.08] rounded-lg text-[#F3F4F6] focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="">Todos os Modelos</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                </select>

                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Filtrar
                </button>
              </form>
            </div>

            {isLoadingLogs ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <span className="text-xs text-[#9CA3AF]">Consultando banco de auditoria Supabase...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#9CA3AF] border border-dashed border-white/[0.08] rounded-lg">
                Nenhuma interação encontrada.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[#9CA3AF]">
                      <th className="pb-2.5 font-medium">Data/Hora</th>
                      <th className="pb-2.5 font-medium">Usuário & IP</th>
                      <th className="pb-2.5 font-medium">Modelo</th>
                      <th className="pb-2.5 font-medium text-right">Tokens</th>
                      <th className="pb-2.5 font-medium text-right">Custo USD</th>
                      <th className="pb-2.5 font-medium">Prompt Preview</th>
                      <th className="pb-2.5 font-medium text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {logs.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedLog(item)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      >
                        <td className="py-3 font-mono text-[#9CA3AF] text-[11px] whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="py-3 max-w-[180px]">
                          <div className="flex flex-col">
                            <span className="text-[#F3F4F6] font-medium truncate">{item.user_email}</span>
                            <span className="text-[10px] text-[#6B7280] font-mono">
                              {item.ip_address || 'IP não reg.'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-[#D1D5DB]">
                            {item.model_name}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono text-[#D1D5DB] whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold">{item.total_tokens.toLocaleString()}</span>
                            <span className="text-[10px] text-[#6B7280]">
                              {item.prompt_tokens}p / {item.completion_tokens}c
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-emerald-400 font-semibold whitespace-nowrap">
                          {formatUSD(item.cost_usd)}
                        </td>
                        <td className="py-3 max-w-xs truncate text-[#9CA3AF] text-[11px]">
                          {item.user_prompt}
                        </td>
                        <td className="py-3 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(item);
                            }}
                            className="px-2 py-1 rounded bg-white/[0.04] group-hover:bg-primary/20 group-hover:text-primary border border-white/[0.08] text-[11px] text-[#9CA3AF] transition-colors cursor-pointer"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.06] text-xs">
                <span className="text-[#9CA3AF]">
                  Página <strong className="text-[#F3F4F6]">{page}</strong> de{' '}
                  <strong className="text-[#F3F4F6]">{totalPages}</strong>
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const prev = Math.max(1, page - 1);
                      setPage(prev);
                      loadLogs(prev);
                    }}
                    disabled={page <= 1 || isLoadingLogs}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 border border-white/[0.08] text-[#D1D5DB] cursor-pointer"
                    title="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      const next = Math.min(totalPages, page + 1);
                      setPage(next);
                      loadLogs(next);
                    }}
                    disabled={page >= totalPages || isLoadingLogs}
                    className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 border border-white/[0.08] text-[#D1D5DB] cursor-pointer"
                    title="Próxima página"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Inspecionar Interação Completa (Tabela Bruta) */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Detalhes da Interação de Auditoria"
        description={selectedLog ? `ID: ${selectedLog.id} • ${formatDate(selectedLog.created_at)}` : ''}
        maxWidth="lg"
      >
        {selectedLog && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-[#0E0F12] border border-white/[0.06]">
              <div>
                <span className="text-[10px] text-[#6B7280] block uppercase">Usuário</span>
                <span className="text-[#F3F4F6] font-medium truncate block">{selectedLog.user_email}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#6B7280] block uppercase">Endereço IP</span>
                <span className="text-[#F3F4F6] font-mono block">{selectedLog.ip_address || 'Não registrado'}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#6B7280] block uppercase">Tokens Totais</span>
                <span className="text-blue-400 font-mono font-medium block">
                  {selectedLog.total_tokens} ({selectedLog.prompt_tokens}p + {selectedLog.completion_tokens}c)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#6B7280] block uppercase">Custo USD</span>
                <span className="text-emerald-400 font-mono font-bold block">{formatUSD(selectedLog.cost_usd)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#D1D5DB] uppercase tracking-wide">
                Prompt do Usuário
              </span>
              <div className="p-3 rounded-lg bg-[#0E0F12] border border-white/[0.06] font-mono text-[11px] text-[#E5E7EB] whitespace-pre-wrap select-text max-h-48 overflow-y-auto">
                {selectedLog.user_prompt}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#D1D5DB] uppercase tracking-wide flex items-center gap-1.5">
                <span>Resposta do Modelo</span>
                <Badge variant="default" className="text-[10px] font-mono">
                  {selectedLog.model_name}
                </Badge>
              </span>
              <div className="p-3 rounded-lg bg-[#0E0F12] border border-white/[0.06] font-mono text-[11px] text-[#D1D5DB] whitespace-pre-wrap select-text max-h-64 overflow-y-auto">
                {selectedLog.model_response}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AuditDashboard;
