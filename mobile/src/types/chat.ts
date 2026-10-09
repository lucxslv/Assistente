/**
 * Contrato de tipos para o chat conversacional e Generative UI do Charlie.
 * Suporta tanto texto formatado em Markdown quanto blocos estruturados de dados (Widgets).
 */

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'sending' | 'streaming' | 'done' | 'error';

/**
 * Payload estruturado do widget de saúde da infraestrutura / servidor.
 * Permite renderização rica com CPU, RAM, conexões de banco e streams em tempo real.
 */
export interface ServerHealthWidgetData {
  title?: string;
  status?: 'healthy' | 'degraded' | 'offline';
  cpuPercent: number;
  ramPercent: number;
  database: 'healthy' | 'degraded' | 'offline' | boolean;
  webSocket: 'connected' | 'disconnected' | boolean;
  sse?: 'connected' | 'disconnected' | boolean;
  actionLabel?: string;
}

/**
 * Payload para widget de consumo e cotas de armazenamento.
 */
export interface StorageWidgetData {
  title?: string;
  usedPercent: number;
  usedLabel: string;
  totalLabel: string;
}

export interface UnavailableWidgetData {
  originalKind?: string;
  reason?: string;
}

/**
 * Contrato canônico de conteúdo estruturado com fallback obrigatório.
 */
export interface StructuredContent<T = Record<string, unknown>> {
  kind: string;
  version: number;
  data: T;
  fallbackText: string;
}

/**
 * União discriminada de todos os widgets suportados pelo Charlie.
 * Facilita type narrowing no WidgetRegistry.
 */
export type AssistantWidget =
  | { id: string; type: 'server_health'; version?: number; data: ServerHealthWidgetData; fallbackText?: string }
  | { id: string; type: 'storage_usage'; version?: number; data: StorageWidgetData; fallbackText?: string }
  | { id: string; type: 'embedded_widget_unavailable'; version?: number; data: UnavailableWidgetData; fallbackText: string };

/**
 * Contrato da resposta do backend (payload estruturado ou legado).
 */
export interface AssistantPayload {
  version: 1;
  text?: string;
  widgets?: AssistantWidget[];
}

/**
 * Mensagem completa renderizada na timeline de conversação.
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: MessageStatus;
  widgets?: AssistantWidget[];
}

/**
 * Utilitário seguro para fazer parsing de respostas do assistente.
 * Se o backend retornar texto simples ou Markdown, encapsula em AssistantPayload.
 * Se retornar JSON válido compatível com version: 1, extrai texto e widgets nativos.
 */
export function parseAssistantPayload(value: unknown): AssistantPayload {
  if (typeof value !== 'string') {
    return { version: 1, text: '' };
  }

  const trimmed = value.trim();

  // Verifica se pode ser JSON antes de tentar o parse
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as AssistantPayload;
      if (
        parsed.version === 1 &&
        (typeof parsed.text === 'string' || Array.isArray(parsed.widgets))
      ) {
        return parsed;
      }
    } catch {
      // Ignora falha de parse e segue como texto Markdown simples
    }
  }

  return { version: 1, text: value };
}
