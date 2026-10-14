import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  User as UserIcon,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react';
import { Message, FileAttachment, ToolExecutionCard } from '../../types/chat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { formatTimeOrDate, formatBytes } from '../../utils/formatters';
import { hapticFeedback } from '../../utils/haptics';
import { mediaDb } from '../../services/mediaDb';

const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  search_web: 'Pesquisa na Web',
  read_webpage: 'Leitura de Página Web',
  get_weather: 'Consulta de Clima',
  get_datetime: 'Data e Hora do Sistema',
  get_system_status: 'Diagnóstico de Hardware',
  execute_system_command: 'Execução de Comando Local',
  control_home_device: 'Automação Residencial',
  read_screen: 'Inspeção Visual de Tela',
  launch_app: 'Abertura de Aplicativo',
};

const AttachmentCard: React.FC<{ att: FileAttachment }> = ({ att }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(att.dataUrl || null);
  const [showSnippet, setShowSnippet] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    if (att.isImage && !att.dataUrl) {
      mediaDb.getMedia(att.id).then((cached) => {
        if (!isCancelled && cached) {
          setDataUrl(cached);
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [att.id, att.isImage, att.dataUrl]);

  const snippet = att.preview_snippet || att.textPreview || att.extractedText;

  return (
    <div className="flex flex-col rounded-xl bg-black/35 border border-white/[0.08] p-2.5 text-xs max-w-full min-w-0">
      <div className="flex items-center gap-2.5 min-w-0">
        {att.isImage && dataUrl ? (
          <img
            src={dataUrl}
            alt={att.name}
            className="w-10 h-10 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0 border border-white/[0.08]"
            onClick={() => window.open(dataUrl, '_blank')}
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0">
            {att.isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </div>
        )}

        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-medium text-[#F3F4F6] truncate" title={att.name}>
            {att.name}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-[#9CA3AF] font-mono">
            <span>{att.size ? formatBytes(att.size) : 'Anexo'}</span>
            {att.type && (
              <>
                <span>•</span>
                <span className="truncate max-w-[120px]">{att.type.split('/').pop()}</span>
              </>
            )}
          </div>
        </div>

        {snippet && (
          <button
            type="button"
            onClick={() => setShowSnippet((prev) => !prev)}
            className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-[#D1D5DB] flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0"
          >
            <span>{showSnippet ? 'Ocultar' : 'Trecho'}</span>
            {showSnippet ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {showSnippet && snippet && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] max-h-32 overflow-y-auto text-[11px] font-mono text-[#9CA3AF] whitespace-pre-wrap break-words bg-black/40 p-2 rounded-lg">
          {snippet.slice(0, 400)}
          {snippet.length > 400 ? '...' : ''}
        </div>
      )}
    </div>
  );
};

const ToolExecutionCardItem: React.FC<{ tool: ToolExecutionCard }> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);
  const label =
    tool.friendlyName || FRIENDLY_TOOL_NAMES[tool.name] || `Ferramenta: ${tool.name}`;

  return (
    <div className="rounded-xl bg-[#12151E] border border-white/[0.07] px-3 py-2 text-xs mb-2 max-w-full min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {tool.status === 'executing' ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
          ) : tool.status === 'error' ? (
            <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          )}
          <Wrench className="w-3 h-3 text-[#9CA3AF] flex-shrink-0" />
          <span className="font-medium text-[#E5E7EB] truncate">{label}</span>
          <span className="text-[10px] font-mono text-[#6B7280]">
            {tool.status === 'executing'
              ? 'executando...'
              : tool.status === 'error'
              ? 'falhou'
              : 'concluído'}
          </span>
        </div>

        {(tool.args || tool.result !== undefined) && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-[10px] text-[#9CA3AF] hover:text-white flex items-center gap-0.5 cursor-pointer flex-shrink-0"
          >
            <span>{expanded ? 'Ocultar' : 'Detalhes'}</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1.5 text-[11px] font-mono text-[#9CA3AF] overflow-x-auto">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div>
              <span className="text-[#6B7280]">Parâmetros: </span>
              <span className="break-all">{JSON.stringify(tool.args)}</span>
            </div>
          )}
          {tool.result !== undefined && (
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words bg-black/35 p-2 rounded-lg">
              {typeof tool.result === 'string'
                ? tool.result.slice(0, 500)
                : JSON.stringify(tool.result, null, 2).slice(0, 500)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface MessageItemProps {
  message: Message;
  userName?: string;
  userAvatarUrl?: string;
  onRetryAssistant?: (message: Message) => void;
  onRegenerateAssistant?: (message: Message) => void;
  onEditUser?: (message: Message, newContent: string) => void;
  onFeedback?: (message: Message, rating: 1 | -1) => void;
  onResendUser?: (message: Message) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  userName = 'Você',
  userAvatarUrl,
  onRetryAssistant,
  onRegenerateAssistant,
  onEditUser,
  onFeedback,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      hapticFeedback.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSaveEdit = () => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    setIsEditing(false);
    if (onEditUser && trimmed !== message.content) {
      hapticFeedback.light();
      onEditUser(message, trimmed);
    }
  };

  return (
    <div
      className={`group w-full max-w-4xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex gap-2.5 sm:gap-3.5 transition-colors min-w-0 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Assistant Avatar with Charlie Logo */}
      {isAssistant && (
        <div className="w-8 h-8 rounded-xl bg-black border border-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden mt-0.5 p-1.5">
          <img src="/logo.png" alt="Charlie" className="w-full h-full object-contain object-center" />
        </div>
      )}

      {/* Message Body Container */}
      <div
        className={`flex flex-col min-w-0 max-w-[90%] sm:max-w-[78%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Header: Name, Time & Edited Badge */}
        <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-[#6B7280] flex-wrap">
          <span className="font-medium text-[#9CA3AF]">
            {isUser ? userName : 'Charlie'}
          </span>
          <span>•</span>
          <span>{formatTimeOrDate(message.createdAt)}</span>
          {message.isEdited && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/[0.05] text-[#9CA3AF] font-mono">
              editado
            </span>
          )}
          {message.status === 'cancelled' && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 font-mono">
              <Ban className="w-2.5 h-2.5" />
              interrompido
            </span>
          )}
          {message.status === 'interrupted' && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 font-mono">
              parcial recuperado
            </span>
          )}
        </div>

        {/* Content Box with strict overflow/word-break protection */}
        <div
          className={`rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-[15px] sm:text-sm leading-relaxed transition-all min-w-0 max-w-full overflow-hidden break-words ${
            isUser
              ? 'bg-[#181B22] text-[#F3F4F6] border border-white/[0.08] rounded-tr-sm'
              : 'bg-[#0E0F12] text-[#E5E7EB] border border-white/[0.06] rounded-tl-sm w-full shadow-sm'
          }`}
        >
          {/* Structured User Attachments Cards */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-2 mb-2.5 pb-2.5 border-b border-white/[0.08]">
              {message.attachments.map((att) => (
                <AttachmentCard key={att.id} att={att} />
              ))}
            </div>
          )}

          {/* Dynamic Tool Execution Cards (Assistant) */}
          {isAssistant && message.tools && message.tools.length > 0 && (
            <div className="mb-2.5">
              {message.tools.map((tool, idx) => (
                <ToolExecutionCardItem key={`${tool.name}-${idx}`} tool={tool} />
              ))}
            </div>
          )}

          {/* Inline Editor for User Messages */}
          {isEditing && isUser ? (
            <div className="w-full min-w-[240px] sm:min-w-[360px] space-y-2.5">
              <textarea
                rows={3}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="w-full rounded-xl bg-[#0E0F12] border border-primary/50 p-2.5 text-sm text-[#F3F4F6] focus:outline-none resize-y leading-relaxed"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditDraft(message.content);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#D1D5DB] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium transition-colors cursor-pointer"
                >
                  Salvar e Reenviar
                </button>
              </div>
            </div>
          ) : message.content ? (
            <div className="min-w-0 max-w-full overflow-hidden break-words">
              <MarkdownRenderer content={message.content} />
              {message.isStreaming && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-primary animate-pulse align-middle" />
              )}
            </div>
          ) : message.isStreaming ? (
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF] py-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              <span>Pensando...</span>
            </div>
          ) : null}

          {/* Error notice */}
          {message.error && (
            <div className="mt-2.5 flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 break-words">{message.error}</span>
              {onRetryAssistant && (
                <button
                  onClick={() => {
                    hapticFeedback.light();
                    onRetryAssistant(message);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium transition-colors cursor-pointer flex-shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tentar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action bar: Copy, Edit (User), Regenerate & Thumbs Up/Down (Assistant) */}
        {!message.isStreaming && !isEditing && message.content && (
          <div className="flex items-center gap-1 mt-1 px-1 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-wrap">
            <button
              onClick={handleCopy}
              className="min-h-[32px] sm:min-h-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#6B7280] hover:text-[#D1D5DB] active:text-white hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer"
              title="Copiar mensagem"
              aria-label="Copiar mensagem"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[10px]">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Copiar</span>
                </>
              )}
            </button>

            {isUser && onEditUser && (
              <button
                onClick={() => {
                  hapticFeedback.light();
                  setEditDraft(message.content);
                  setIsEditing(true);
                }}
                className="min-h-[32px] sm:min-h-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer"
                title="Editar mensagem e regenerar resposta"
                aria-label="Editar mensagem"
              >
                <Pencil className="w-3 h-3" />
                <span className="text-[10px]">Editar</span>
              </button>
            )}

            {isAssistant && onRegenerateAssistant && (
              <button
                onClick={() => {
                  hapticFeedback.light();
                  onRegenerateAssistant(message);
                }}
                className="min-h-[32px] sm:min-h-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer"
                title="Regenerar resposta"
                aria-label="Regenerar resposta"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="text-[10px]">Regenerar</span>
              </button>
            )}

            {isAssistant && onFeedback && (
              <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    hapticFeedback.light();
                    onFeedback(message, 1);
                  }}
                  className={`p-1 rounded-lg transition-colors cursor-pointer ${
                    message.feedback === 1
                      ? 'text-emerald-400 bg-emerald-500/15'
                      : 'text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04]'
                  }`}
                  title="Boa resposta"
                  aria-label="Avaliar positivamente"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticFeedback.light();
                    onFeedback(message, -1);
                  }}
                  className={`p-1 rounded-lg transition-colors cursor-pointer ${
                    message.feedback === -1
                      ? 'text-red-400 bg-red-500/15'
                      : 'text-[#6B7280] hover:text-[#D1D5DB] hover:bg-white/[0.04]'
                  }`}
                  title="Resposta insatisfatória"
                  aria-label="Avaliar negativamente"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-[#1A1D24] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-[#9CA3AF] mt-0.5 overflow-hidden">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt={userName} className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-4 h-4" />
          )}
        </div>
      )}
    </div>
  );
};
