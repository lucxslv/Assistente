import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  RefreshCw,
  Download,
  Search,
  Filter,
  DollarSign,
  Cpu,
  Users,
  MessageSquare,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Terminal,
  Activity,
  AlertCircle,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import { AuditService } from '../../services/auditService';
import { AuditMetrics, AuditLog } from '../../types/audit';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';

interface AuditDashboardProps {
  onBackToChat: () => void;
}

export const AuditDashboard: React.FC<AuditDashboardProps> = ({ onBackToChat }) => {
  // State
  const [metrics, setMetrics] = useState<AuditMetrics | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>('');
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Inspection Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  // Fetch metrics
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

  // Fetch logs
  const loadLogs = useCallback(
    async (currentPage = page) => {
      setIsLoadingLogs(true);
      setError(null);
      try {
        const data = await AuditService.getLogs({
          page: currentPage,
          limit: 25,
          search: searchQuery.trim() || undefined,
          modelName: selectedModel || undefined,
          userEmail: selectedUserEmail.trim() || undefined,
        });
        setLogs(data.logs || []);
        setPage(data.page || 1);
        setTotalPages(data.totalPages || data.total_pages || 1);
        setTotalLogs(data.total || 0);
      } catch (err: unknown) {
        console.error('Falha ao carregar logs:', err);
        setError('Não foi possível carregar os registros de auditoria.');
      } finally {
        setIsLoadingLogs(false);
      }
    },
    [page, searchQuery, selectedModel, selectedUserEmail]
  );

  useEffect(() => {
    loadMetrics();
    loadLogs(1);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadLogs(1);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true);
    try {
      await AuditService.exportLogs(format);
    } catch (err: unknown) {
      console.error('Erro na exportação:', err);
      alert('Falha ao exportar registros de auditoria.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyResponse = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
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

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#0A0B0E] text-[#F3F4F6] overflow-y-auto">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-white/[0.06] bg-[#0E0F12]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
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
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[#F3F4F6] flex items-center gap-2">
                Painel de Auditoria & Custos
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-normal">
                  PATH 1 • Supabase
                </span>
              </h1>
              <p className="text-[11px] text-[#9CA3AF] hidden md:block">
                Telemetria interna, registro imutável de interações e controle de custos USD
              </p>
            </div>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadMetrics();
              loadLogs(page);
            }}
            disabled={isLoadingMetrics || isLoadingLogs}
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.08] text-xs text-[#E5E7EB] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Atualizar dados de telemetria"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#9CA3AF] ${isLoadingMetrics || isLoadingLogs ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting || totalLogs === 0}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs font-medium text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exportar registros completos em CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={() => handleExport('json')}
              disabled={isExporting || totalLogs === 0}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-xs font-medium text-primary transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Exportar registros completos em JSON"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
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
              <span className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">Requisições Auditadas</span>
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

          {/* Card 4: Usuários Ativos */}
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">Usuários Testadores</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-amber-400 tracking-tight">
              {metrics ? (metrics.unique_users_count ?? metrics.unique_users ?? 0) : '0'}
            </div>
            <div className="mt-2 text-[11px] text-[#9CA3AF] flex items-center justify-between">
              <span>Contas únicas ativas</span>
              <span className="text-amber-400/80 font-mono">Supabase Auth</span>
            </div>
          </div>
        </div>

        {/* Secondary Insights Row: Breakdown por Modelo & Top Usuários */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Consumo por Modelo */}
          <div className="lg:col-span-2 bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-[#F3F4F6] flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-primary" />
              Consumo & Custos por Modelo LLM
            </h3>
            {metrics?.models_breakdown && metrics.models_breakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[#9CA3AF]">
                      <th className="pb-2.5 font-medium">Modelo</th>
                      <th className="pb-2.5 font-medium text-right">Chamadas</th>
                      <th className="pb-2.5 font-medium text-right">Tokens</th>
                      <th className="pb-2.5 font-medium text-right">Custo USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {metrics.models_breakdown.map((m, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 font-mono text-[#F3F4F6] font-medium flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-primary/80" />
                          {m.model_name}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#D1D5DB]">{(m.requests_count ?? m.count ?? 0).toLocaleString()}</td>
                        <td className="py-2.5 text-right font-mono text-[#D1D5DB]">{formatTokens(m.total_tokens)}</td>
                        <td className="py-2.5 text-right font-mono text-emerald-400 font-semibold">{formatUSD(m.total_cost_usd ?? m.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-[#9CA3AF] py-6 text-center">Nenhum modelo registrado ainda.</div>
            )}
          </div>

          {/* Top Usuários Testadores */}
          <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-[#F3F4F6] flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-amber-400" />
              Usuários Mais Ativos
            </h3>
            {metrics?.top_users && metrics.top_users.length > 0 ? (
              <div className="space-y-3">
                {metrics.top_users.map((u, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[#F3F4F6] font-medium truncate">{u.user_email}</span>
                      <span className="text-[10px] text-[#9CA3AF] font-mono">{(u.requests_count ?? u.requests ?? 0)} interações</span>
                    </div>
                    <span className="font-mono text-emerald-400 font-medium flex-shrink-0">
                      {formatUSD(u.total_cost_usd ?? u.total_cost)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#9CA3AF] py-6 text-center">Nenhum registro de usuário ainda.</div>
            )}
          </div>
        </div>

        {/* Interactive Log Explorer */}
        <div className="bg-[#111317] border border-white/[0.08] rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F3F4F6] flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                Registros de Auditoria Imutáveis
                <span className="text-xs font-mono text-[#9CA3AF] font-normal">({totalLogs} no total)</span>
              </h2>
              <p className="text-[11px] text-[#9CA3AF]">
                Clique em qualquer linha ou no botão de inspeção para visualizar o prompt e a resposta completos
              </p>
            </div>

            {/* Filters Form */}
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  type="text"
                  placeholder="Buscar texto ou email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* Error Notice */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Logs Table / Mobile List */}
          {isLoadingLogs ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
              <span className="text-xs text-[#9CA3AF]">Consultando banco de auditoria Supabase...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#9CA3AF] border border-dashed border-white/[0.08] rounded-lg">
              Nenhuma interação encontrada com os filtros informados.
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
                          <span className="text-[10px] text-[#6B7280] font-mono">{item.ip_address || 'IP não reg.'}</span>
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

          {/* Pagination Controls */}
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
      </div>

      {/* Modal: Inspecionar Interação Completa */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Detalhes da Interação de Auditoria"
        description={selectedLog ? `ID: ${selectedLog.id} • ${formatDate(selectedLog.created_at)}` : ''}
        maxWidth="lg"
      >
        {selectedLog && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs">
            {/* Metadata Badges */}
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

            {/* Prompt Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#D1D5DB] uppercase tracking-wide">
                  Prompt do Usuário
                </span>
                <button
                  onClick={() => handleCopyPrompt(selectedLog.user_prompt)}
                  className="flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                >
                  {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPrompt ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-[#0E0F12] border border-white/[0.06] font-mono text-[11px] text-[#E5E7EB] whitespace-pre-wrap select-text max-h-48 overflow-y-auto">
                {selectedLog.user_prompt}
              </div>
            </div>

            {/* Model Response Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#D1D5DB] uppercase tracking-wide flex items-center gap-1.5">
                  <span>Resposta do Modelo</span>
                  <Badge variant="default" className="text-[10px] font-mono">
                    {selectedLog.model_name}
                  </Badge>
                </span>
                <button
                  onClick={() => handleCopyResponse(selectedLog.model_response)}
                  className="flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                >
                  {copiedResponse ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedResponse ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-[#0E0F12] border border-white/[0.06] font-mono text-[11px] text-[#D1D5DB] whitespace-pre-wrap select-text max-h-64 overflow-y-auto">
                {selectedLog.model_response}
              </div>
            </div>

            {/* Bottom Technical Info */}
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>Sessão: {selectedLog.session_id || 'default'}</span>
              <span>User ID: {selectedLog.user_id}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
export default AuditDashboard;
