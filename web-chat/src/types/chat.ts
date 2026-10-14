export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'in_progress'
  | 'done'
  | 'completed'
  | 'cancelled'
  | 'interrupted'
  | 'error'
  | 'failed'
  | 'unknown';

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  textPreview?: string;
  extractedText?: string;
  preview_snippet?: string;
  has_extracted_text?: boolean;
  isImage: boolean;
}

export interface ToolExecutionCard {
  callId?: string;
  name: string;
  friendlyName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: 'executing' | 'completed' | 'error';
  durationMs?: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status?: MessageStatus;
  requestId?: string;
  isEdited?: boolean;
  editedAt?: string | null;
  version?: number;
  feedback?: number | null;
  attachments?: FileAttachment[];
  tools?: ToolExecutionCard[];
  threadId?: string;
  error?: string;
  isStreaming?: boolean;
}

export interface Thread {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  pinnedAt?: string | null;
  archivedAt?: string | null;
}

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

export type CharlieAIStatus = 'idle' | 'thinking' | 'speaking' | 'error';

export interface StreamEventData {
  token?: string;
  reply?: string;
  error?: string;
  status?: string;
  name?: string;
  friendly_name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  request_id?: string;
  assistant_message_id?: string;
  [key: string]: unknown;
}

export interface StreamEvent {
  type:
    | 'token'
    | 'done'
    | 'cancelled'
    | 'error'
    | 'state'
    | 'tool_call'
    | 'tool_start'
    | 'tool_end'
    | 'ping'
    | 'pong'
    | 'reset_and_fallback'
    | 'status'
    | 'client_tool_request';
  data?: StreamEventData;
}
