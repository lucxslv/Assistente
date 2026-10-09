/**
 * Contrato Canônico de Mensagens e Conversas do Charlie.
 * Compartilhado entre Backend, Web Chat, Desktop e Mobile.
 */

import { ToolCallInfo } from './events';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type MessageStatus = 'pending' | 'sending' | 'streaming' | 'done' | 'error';

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  textPreview?: string;
  isImage: boolean;
}

export interface StructuredWidget<T = Record<string, unknown>> {
  id: string;
  type: string;
  version?: number;
  data: T;
  fallbackText: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status?: MessageStatus;
  attachments?: FileAttachment[];
  threadId?: string;
  error?: string;
  isStreaming?: boolean;
  tools?: ToolCallInfo[];
  widgets?: StructuredWidget[];
}

export interface Thread {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
  preview?: string;
}

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

export type CharlieAIStatus = 'idle' | 'thinking' | 'speaking' | 'executing_tool' | 'error';
